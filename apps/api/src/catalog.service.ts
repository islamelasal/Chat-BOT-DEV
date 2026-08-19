/**
 * CatalogService — الفيد الحي لمنتجات العملاء
 * ───────────────────────────────────────────────
 * المعايير المنفذة:
 *  - محلل تلقائي (CSV بفاصل ذاتي الاكتشاف / XML / JSON Lines) بدون تبعيات.
 *  - Upsert آمن: تفرد (client_id, external_id) — نفس المنتج يُحدَّث، الجديد يُدرج.
 *  - بصمة محتوى (SHA-256) لكل منتج — لا كتابة إلا عند تغيّر فعلي (IO أمثل).
 *  - سجل تغييرات (catalog_changes): new | updated | price_changed | stock_changed.
 *  - Idempotent بالكامل: إعادة التشغيل لا تكرر سجلات التغيير.
 *  - تدرّج جلب: fetch مباشر → خدمة Scrapling (تجاوز Cloudflare) → خطأ موثق.
 *  - سقوف: 30 ثانية مهلة، 5MB حجم، 20,000 منتج/مزامنة.
 */
import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { db, id, now } from '@cbd/db';
import { fetchDirect, looksLikeHtml } from './crawl.js';

export interface NormalizedProduct {
  externalId: string;
  name: string;
  category: string;
  brand: string;
  price: number;
  oldPrice: number | null;
  currency: string;
  inStock: boolean;
  imageUrl: string;
  productUrl: string;
  description: string;
  isDeal: boolean;
  isBride: boolean;
}

export interface SyncSummary {
  ok: boolean;
  clientId: string;
  total: number;
  inserted: number;
  updated: number;
  unchanged: number;
  itemsTotal: number;
  durationMs: number;
  error?: string;
}

const MAX_FEED_BYTES = 5 * 1024 * 1024;
const MAX_ITEMS = 20_000;

const HEADER_ALIASES: Record<string, string[]> = {
  externalId: ['id', 'product_id', 'productid', 'code', 'sku', 'item id', 'product id', 'article'],
  name: ['name', 'product', 'product name', 'title', 'item', 'اسم'],
  price: ['price', 'sale price', 'final price', 'our price', 'السعر'],
  oldPrice: ['list price', 'old price', 'original price', 'price (original)', 'regular price'],
  category: ['category', 'categories', 'category path', 'القسم'],
  brand: ['brand', 'manufacturer', 'vendor', 'العلامة'],
  imageUrl: ['image', 'image url', 'image_url', 'photo', 'picture', 'الصورة'],
  productUrl: ['url', 'link', 'product url', 'product_url', 'buy url', 'href', 'الرابط'],
  description: ['description', 'desc', 'details', 'short description', 'الوصف'],
  currency: ['currency', 'العملة'],
  inStock: ['in stock', 'instock', 'stock', 'available', 'availability', 'متوفر'],
  isDeal: ['is_deal', 'isdeal', 'deal', 'عرض خاص', 'عرض'],
  isBride: ['is_bride_essential', 'isbride', 'bride', 'bride_essential', 'عروسة', 'جهاز العروسة'],
};

@Injectable()
export class CatalogService {
  private readonly logger = new Logger('Catalog');

  // ─────────────────────────── الجلب ───────────────────────────

  private async fetchFeed(url: string): Promise<string> {
    // 1) جلب مباشر محسّن (فك ضغط gzip + ترميز windows-1256/utf-8 + كشف حجب + إعادة محاولة)
    const direct = await fetchDirect(url, { timeoutMs: 25_000, attempts: 2 });
    if (direct.ok && direct.text.length > 0) {
      if (looksLikeHtml(direct.text)) {
        throw new Error('الرابط يعيد صفحة ويب (HTML) وليس فيد بيانات — تحقق من رابط الفيد');
      }
      return direct.text;
    }
    const directError = direct.ok ? 'محتوى فارغ' : `HTTP ${direct.status || 'تعذر الاتصال'}${direct.blocked ? ' (محجوب)' : ''}`;

    // 2) عبر خدمة Scrapling (تتخطى الحماية وتبصم كمتصفح)
    const scraplingUrl = process.env.SCRAPLING_URL ?? '';
    if (scraplingUrl) {
      try {
        const sres = await fetch(`${scraplingUrl.replace(/\/+$/, '')}/crawl`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ url, strategy: 'auto', timeout_ms: 30_000 }),
          signal: AbortSignal.timeout(60_000),
        });
        if (sres.ok) {
          const j = (await sres.json()) as { ok?: boolean; html?: string; error?: string };
          if (j.ok && j.html && j.html.length > 100) {
            if (looksLikeHtml(j.html)) {
              throw new Error('الرابط يعيد صفحة ويب (HTML) وليس فيد بيانات — تحقق من رابط الفيد');
            }
            return j.html;
          }
        }
      } catch {
        /* استمر للخطأ الأصلي */
      }
    }
    throw new Error(`فشل جلب الفيد: ${directError}`);
  }

  // ─────────────────────────── المحلل ───────────────────────────

  detectFormat(text: string): 'xml' | 'csv' | 'json' {
    const t = text.replace(/^\uFEFF/, '').trimStart();
    if (t.startsWith('<')) return 'xml';
    if (t.startsWith('[') || t.startsWith('{')) return 'json';
    return 'csv';
  }

  parseCsv(text: string): Array<Record<string, string>> {
    const t = text.replace(/^\uFEFF/, '');
    const lines = t.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length < 2) return [];
    const delim = this.detectDelimiter(lines[0]!);
    const split = (line: string) => this.splitCsvLine(line, delim);
    const headers = split(lines[0]!).map((h) => h.trim().toLowerCase().replace(/^"|"$/g, ''));
    const map = this.buildHeaderMap(headers);
    const rows: Array<Record<string, string>> = [];
    for (const line of lines.slice(1, MAX_ITEMS + 1)) {
      const cells = split(line);
      if (cells.length === 0) continue;
      const row: Record<string, string> = {};
      for (const [canonical, idxs] of Object.entries(map)) {
        for (const i of idxs) {
          if (cells[i] != null && cells[i] !== '') {
            row[canonical] = cells[i]!.trim().replace(/^"|"$/g, '');
            break;
          }
        }
      }
      if (row.name || row.externalId) rows.push(row);
    }
    return rows;
  }

  private detectDelimiter(firstLine: string): string {
    const counts: Record<string, number> = { ',': 0, ';': 0, '\t': 0 };
    for (const ch of firstLine) {
      if (ch in counts) counts[ch]!++;
    }
    return (Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? ',') as string;
  }

  private splitCsvLine(line: string, delim: string): string[] {
    const out: string[] = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]!;
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQ = !inQ;
        }
      } else if (ch === delim && !inQ) {
        out.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
    out.push(cur);
    return out;
  }

  private buildHeaderMap(headers: string[]): Record<string, number[]> {
    const map: Record<string, number[]> = {};
    headers.forEach((h, i) => {
      if (!h) return;
      for (const [canonical, aliases] of Object.entries(HEADER_ALIASES)) {
        if (aliases.some((a) => h === a || h.startsWith(a + ' '))) {
          (map[canonical] ??= []).push(i);
        }
      }
    });
    return map;
  }

  parseXml(text: string): Array<Record<string, string>> {
    const rows: Array<Record<string, string>> = [];
    // نبحث عن عقد المنتج: <item> أو <product> أو <offer>
    const blockRe = /<(item|product|offer)\b[^>]*>([\s\S]*?)<\/\1>/gi;
    let m: RegExpExecArray | null;
    let count = 0;
    while ((m = blockRe.exec(text)) !== null && count < MAX_ITEMS) {
      const body = m[2]!;
      const row: Record<string, string> = {};
      const field = (re: RegExp) => {
        const f = body.match(re);
        return f?.[1]?.trim() ?? '';
      };
      row.externalId = field(/<(?:id|product_id|sku|code)>([\s\S]*?)<\/(?:id|product_id|sku|code)>/i) || field(/<g:id>([\s\S]*?)<\/g:id>/i);
      row.name = field(/<(?:title|name|product_name)>([\s\S]*?)<\/(?:title|name|product_name)>/i) || field(/<g:title>([\s\S]*?)<\/g:title>/i);
      row.price = field(/<(?:price|sale_price|g:price)>([\s\S]*?)<\/(?:price|sale_price|g:price)>/i);
      row.oldPrice = field(/<(?:list_price|old_price|regular_price|g:old_price)>([\s\S]*?)<\/(?:list_price|old_price|regular_price|g:old_price)>/i);
      row.category = field(/<(?:category|product_category|g:product_type)>([\s\S]*?)<\/(?:category|product_category|g:product_type)>/i);
      row.brand = field(/<(?:brand|manufacturer|vendor|g:brand)>([\s\S]*?)<\/(?:brand|manufacturer|vendor|g:brand)>/i);
      row.imageUrl = field(/<(?:image_url|image|g:image_link)>([\s\S]*?)<\/(?:image_url|image|g:image_link)>/i);
      row.productUrl = field(/<(?:url|link|product_url|g:link)>([\s\S]*?)<\/(?:url|link|product_url|g:link)>/i);
      row.description = field(/<(?:description|g:description)>([\s\S]*?)<\/(?:description|g:description)>/i);
      row.inStock = field(/<(?:availability|in_stock)>([\s\S]*?)<\/(?:availability|in_stock)>/i);
      if (row.name || row.externalId) rows.push(row);
      count++;
    }
    return rows;
  }

  parseJson(text: string): Array<Record<string, string>> {
    try {
      const parsed = JSON.parse(text);
      const arr = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.data) ? parsed.data : Array.isArray(parsed?.products) ? parsed.products : [];
      return arr.slice(0, MAX_ITEMS).map((p: any) => ({
        externalId: String(p.id ?? p.product_id ?? p.sku ?? ''),
        name: String(p.name ?? p.title ?? p.product ?? ''),
        price: String(p.price ?? p.sale_price ?? ''),
        oldPrice: String(p.old_price ?? p.list_price ?? ''),
        category: String(p.category ?? p.categories ?? ''),
        brand: String(p.brand ?? ''),
        imageUrl: String(p.image ?? p.image_url ?? ''),
        productUrl: String(p.url ?? p.link ?? p.product_url ?? ''),
        description: String(p.description ?? ''),
      }));
    } catch {
      return [];
    }
  }

  parseFeed(text: string): Array<Record<string, string>> {
    const format = this.detectFormat(text);
    if (format === 'xml') return this.parseXml(text);
    if (format === 'json') return this.parseJson(text);
    return this.parseCsv(text);
  }

  // ─────────────────────────── التطبيع ───────────────────────────

  private normalize(row: Record<string, string>, index: number): NormalizedProduct | null {
    const name = (row.name ?? '').trim();
    if (!name) return null;
    const toNum = (v: string | undefined): number | null => {
      if (v == null || v === '') return null;
      const n = parseFloat(v.replace(/[^\d.,-]/g, '').replace(',', '.'));
      return Number.isFinite(n) ? n : null;
    };
    const price = toNum(row.price) ?? 0;
    const externalId = (row.externalId ?? '').trim() ||
      createHash('sha1').update(`${name}|${row.productUrl ?? ''}`).digest('hex').slice(0, 16);
    const stockStr = (row.inStock ?? '').toLowerCase();
    const inStock = !(
      stockStr.includes('out') || stockStr.includes('no') || stockStr.includes('0') || stockStr.includes('غير')
    );
    const flag = (v: string | undefined): boolean => {
      if (!v) return false;
      const t = v.trim().toLowerCase();
      return ['1', 'true', 'yes', 'y', 'نعم', 'متاح'].includes(t);
    };
    return {
      externalId,
      name: name.slice(0, 300),
      category: (row.category ?? '').slice(0, 200),
      brand: (row.brand ?? '').slice(0, 120),
      price,
      oldPrice: toNum(row.oldPrice),
      currency: (row.currency ?? 'EGP').slice(0, 10) || 'EGP',
      inStock,
      imageUrl: (row.imageUrl ?? '').slice(0, 500),
      productUrl: (row.productUrl ?? '').slice(0, 500),
      description: (row.description ?? '').slice(0, 2000),
      isDeal: flag(row.isDeal),
      isBride: flag(row.isBride),
    };
  }

  private hashOf(p: NormalizedProduct): string {
    return createHash('sha256')
      .update([p.name, p.category, p.brand, p.price, p.oldPrice ?? '', p.inStock ? 1 : 0, p.imageUrl, p.productUrl, p.description.slice(0, 500), p.isDeal ? 1 : 0, p.isBride ? 1 : 0].join('\u0001'))
      .digest('hex');
  }

  // ─────────────────────────── المزامنة ───────────────────────────

  async syncClientCatalog(
    clientId: string,
    opts?: { sourceUrl?: string; demoOverride?: boolean }
  ): Promise<SyncSummary> {
    const started = Date.now();
    const catalog = await db.get('SELECT * FROM client_catalogs WHERE client_id = ?', clientId) as any;
    if (!catalog) return { ok: false, clientId, total: 0, inserted: 0, updated: 0, unchanged: 0, itemsTotal: 0, durationMs: Date.now() - started, error: 'لا يوجد كتالوج مضبوط لهذا العميل' };

    const sourceUrl = opts?.sourceUrl || String(catalog.source_url);
    if (!sourceUrl) return { ok: false, clientId, total: 0, inserted: 0, updated: 0, unchanged: 0, itemsTotal: 0, durationMs: Date.now() - started, error: 'رابط الفيد غير مضبوط' };

    await db.run("UPDATE client_catalogs SET sync_status = 'syncing', last_error = '' WHERE client_id = ?", clientId);
    let summary: SyncSummary = { ok: false, clientId, total: 0, inserted: 0, updated: 0, unchanged: 0, itemsTotal: Number(catalog.items_total ?? 0), durationMs: 0, error: '' };

    try {
      const text = await this.fetchFeed(sourceUrl);
      const rows = this.parseFeed(text);
      summary.total = rows.length;
      const seen = new Set<string>();
      for (let i = 0; i < rows.length; i++) {
        const p = this.normalize(rows[i]!, i);
        if (!p || seen.has(p.externalId)) continue;
        seen.add(p.externalId);
        const hash = this.hashOf(p);
        const existing = await db.get(
          'SELECT * FROM catalog_products WHERE client_id = ? AND external_id = ?',
          clientId, p.externalId
        ) as any;

        if (!existing) {
          await db.run(
            `INSERT INTO catalog_products
              (id, client_id, external_id, name, category, brand, price, old_price, currency, in_stock,
               image_url, product_url, description, is_deal, is_bride_essential, content_hash, first_seen_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            id('prd'), clientId, p.externalId, p.name, p.category, p.brand, p.price, p.oldPrice,
            p.currency, p.inStock ? 1 : 0, p.imageUrl, p.productUrl, p.description,
            p.isDeal ? 1 : 0, p.isBride ? 1 : 0, hash, now(), now()
          );
          await this.logChange(clientId, p.externalId, 'new', `أُضيف: ${p.name}`);
          summary.inserted++;
        } else if (String(existing.content_hash) !== hash) {
          const priceChanged = Number(existing.price) !== p.price || Number(existing.old_price ?? 0) !== (p.oldPrice ?? 0);
          const stockChanged = Number(existing.in_stock) !== (p.inStock ? 1 : 0);
          await db.run(
            `UPDATE catalog_products SET
               name = ?, category = ?, brand = ?, price = ?, old_price = ?, currency = ?, in_stock = ?,
               image_url = ?, product_url = ?, description = ?, is_deal = ?, is_bride_essential = ?,
               content_hash = ?, updated_at = ?
             WHERE client_id = ? AND external_id = ?`,
            p.name, p.category, p.brand, p.price, p.oldPrice, p.currency, p.inStock ? 1 : 0,
            p.imageUrl, p.productUrl, p.description, p.isDeal ? 1 : 0, p.isBride ? 1 : 0,
            hash, now(), clientId, p.externalId
          );
          const type = priceChanged ? 'price_changed' : stockChanged ? 'stock_changed' : 'updated';
          const details = priceChanged
            ? `السعر: ${existing.price} → ${p.price} ${p.currency}`
            : stockChanged
              ? `المخزون: ${Number(existing.in_stock) ? 'متوفر' : 'نفد'} → ${p.inStock ? 'متوفر' : 'نفد'}`
              : 'تحديث بيانات';
          await this.logChange(clientId, p.externalId, type, `${details} — ${p.name}`);
          summary.updated++;
        } else {
          summary.unchanged++;
        }
      }
      summary.ok = true;
      summary.itemsTotal = seen.size;
      summary.durationMs = Date.now() - started;
      await db.run(
        `UPDATE client_catalogs SET sync_status = 'ok', items_total = ?, last_synced_at = ?, last_success_at = ?, last_error = '' WHERE client_id = ?`,
        seen.size, now(), now(), clientId
      );
      this.logger.log(`كتالوج ${clientId}: ${summary.total} منتج — +${summary.inserted} جديد / ~${summary.updated} محدَّث / ${summary.unchanged} بلا تغيير (${summary.durationMs}ms)`);
    } catch (err) {
      summary.error = (err as Error).message;
      summary.durationMs = Date.now() - started;
      await db.run(
        `UPDATE client_catalogs SET sync_status = 'error', last_error = ?, last_synced_at = ? WHERE client_id = ?`,
        summary.error.slice(0, 400), now(), clientId
      );
      this.logger.warn(`كتالوج ${clientId} فشل: ${summary.error}`);
    }
    return summary;
  }

  async syncAll(): Promise<Array<{ clientId: string; ok: boolean; error?: string }>> {
    const rows = (await db.all("SELECT client_id FROM client_catalogs WHERE source_url != ''")) as any[];
    const results: Array<{ clientId: string; ok: boolean; error?: string }> = [];
    for (const r of rows) {
      const s = await this.syncClientCatalog(String(r.client_id));
      results.push({ clientId: String(r.client_id), ok: s.ok, error: s.error });
    }
    return results;
  }

  private async logChange(clientId: string, externalId: string, type: string, details: string): Promise<void> {
    await db.run(
      `INSERT INTO catalog_changes (id, client_id, external_id, change_type, details, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      id('chg'), clientId, externalId, type, details.slice(0, 300), now()
    );
    // تنظيف: نحتفظ بآخر 1000 تغيير لكل عميل
    await db.run(
      `DELETE FROM catalog_changes WHERE client_id = ? AND id NOT IN
         (SELECT id FROM catalog_changes WHERE client_id = ? ORDER BY created_at DESC LIMIT 1000)`,
      clientId, clientId
    );
  }

  // ─────────────────────────── القراءة ───────────────────────────

  async listCatalogs() {
    const rows = (await db.all('SELECT * FROM client_catalogs ORDER BY created_at ASC')) as any[];
    const clients = (await db.all('SELECT id, name FROM clients')) as any[];
    return rows.map((r) => ({
      id: String(r.id),
      clientId: String(r.client_id),
      clientName: clients.find((c) => String(c.id) === String(r.client_id))?.name ?? String(r.client_id),
      sourceUrl: String(r.source_url),
      format: String(r.format),
      syncStatus: String(r.sync_status),
      itemsTotal: Number(r.items_total),
      lastSyncedAt: r.last_synced_at ? Number(r.last_synced_at) : null,
      lastSuccessAt: r.last_success_at ? Number(r.last_success_at) : null,
      lastError: String(r.last_error),
    }));
  }

  async getProducts(clientId: string, opts?: { q?: string; category?: string; limit?: number; offset?: number }) {
    const limit = Math.min(Number(opts?.limit ?? 100), 500);
    const offset = Number(opts?.offset ?? 0);
    let sql = 'SELECT * FROM catalog_products WHERE client_id = ?';
    const params: unknown[] = [clientId];
    if (opts?.q) {
      sql += ' AND (name LIKE ? OR category LIKE ? OR brand LIKE ?)';
      const like = `%${opts.q}%`;
      params.push(like, like, like);
    }
    if (opts?.category) {
      sql += ' AND category = ?';
      params.push(opts.category);
    }
    sql += ' ORDER BY name ASC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    const rows = (await db.all(sql, ...params)) as any[];
    return rows.map((r) => this.productRow(r));
  }

  async getStats(clientId: string) {
    const cat = await db.get('SELECT * FROM client_catalogs WHERE client_id = ?', clientId) as any;
    const counts = await db.get(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(CASE WHEN in_stock = 1 THEN 1 ELSE 0 END),0) AS inStock,
              COALESCE(MIN(price),0) AS minPrice,
              COALESCE(MAX(price),0) AS maxPrice
       FROM catalog_products WHERE client_id = ?`,
      clientId
    ) as any;
    const categories = await db.all(
      `SELECT category, COUNT(*) AS c FROM catalog_products WHERE client_id = ? AND category != ''
       GROUP BY category ORDER BY c DESC LIMIT 12`,
      clientId
    ) as any[];
    const changes = await db.all(
      'SELECT * FROM catalog_changes WHERE client_id = ? ORDER BY created_at DESC LIMIT 20',
      clientId
    ) as any[];
    return {
      catalog: cat
        ? {
            syncStatus: String(cat.sync_status),
            itemsTotal: Number(cat.items_total),
            lastSyncedAt: cat.last_synced_at ? Number(cat.last_synced_at) : null,
            lastSuccessAt: cat.last_success_at ? Number(cat.last_success_at) : null,
            lastError: String(cat.last_error),
          }
        : null,
      totals: {
        products: Number(counts?.total ?? 0),
        inStock: Number(counts?.inStock ?? 0),
        minPrice: Number(counts?.minPrice ?? 0),
        maxPrice: Number(counts?.maxPrice ?? 0),
      },
      categories: categories.map((c) => ({ name: String(c.category), count: Number(c.c) })),
      recentChanges: changes.map((c) => ({
        id: String(c.id),
        externalId: String(c.external_id),
        type: String(c.change_type),
        details: String(c.details),
        at: Number(c.created_at),
      })),
    };
  }

  private productRow(r: any) {
    return {
      id: String(r.id),
      externalId: String(r.external_id),
      name: String(r.name),
      category: String(r.category),
      brand: String(r.brand),
      price: Number(r.price),
      oldPrice: r.old_price != null ? Number(r.old_price) : null,
      currency: String(r.currency),
      inStock: Number(r.in_stock) === 1,
      imageUrl: String(r.image_url),
      productUrl: String(r.product_url),
      description: String(r.description),
      isDeal: Number(r.is_deal) === 1,
      isBrideEssential: Number(r.is_bride_essential) === 1,
      firstSeenAt: Number(r.first_seen_at),
      updatedAt: Number(r.updated_at),
    };
  }

  /** أول N منتجات متوفرة — سياق التأريض لبوت كنز الشوا (مواصفة العميل: أول 8) */
  async firstProducts(clientId: string, limit = 8): Promise<Array<ReturnType<CatalogService['productRow']>>> {
    const rows = (await db.all(
      'SELECT * FROM catalog_products WHERE client_id = ? AND in_stock = 1 ORDER BY name ASC LIMIT ?',
      clientId, limit
    )) as any[];
    return rows.map((r) => this.productRow(r));
  }

  /** صيغة كنز الشوا لسطر المنتج داخل الموجه:
   *  - [SKU: {id}] {title} ({category}): بسعر {price} ج.م (بدلاً من {oldPrice} ج.م) - الماركة: {brand} */
  kanzLine(p: ReturnType<CatalogService['productRow']>): string {
    const old = p.oldPrice && p.oldPrice > p.price ? ` (بدلاً من ${p.oldPrice} ${p.currency})` : '';
    const flags = [p.isDeal ? ' ⚡ عرض لقطة' : '', p.isBrideEssential ? ' 👰 أساسي لجهاز العروسة' : ''].join('');
    return `- [SKU: ${p.externalId}] ${p.name} (${p.category || 'عام'}): بسعر ${p.price} ${p.currency}${old} - الماركة: ${p.brand || 'الشوا'} - متوفر: متوفر - الرابط: ${p.productUrl || 'https://elshawwa.com'}${flags}`;
  }

  /** كتلة كتالوج كنز الشوا الكاملة (أول 8 منتجات) — تُحقن في رسالة النظام */
  async buildKanzCatalogBlock(clientId: string): Promise<string> {
    const products = await this.firstProducts(clientId, 8);
    if (!products.length) return '';
    return (
      'منتجات الشوا المتاحة حالياً في المخزن الرقمي للاستشهاد بها أثناء النصيحة:\n' +
      products.map((p) => this.kanzLine(p)).join('\n')
    );
  }

  /**
   * خوارزمية عرض المنتجات الموصى بها (مواصفة كنز الشوا) — منتجان أسفل الإجابة عند تحقق:
   * - رسالة العميل تحتوي اسم فئة المنتج
   * - رد البوت يحتوي عنوان المنتج
   * - "عروسة" + isBrideEssential  |  "عروض" + isDeal  |  اسم الماركة
   */
  async matchProducts(
    clientId: string,
    userMessage: string,
    botReply: string,
    limit = 2
  ): Promise<Array<ReturnType<CatalogService['productRow']>>> {
    const rows = (await db.all(
      'SELECT * FROM catalog_products WHERE client_id = ? AND in_stock = 1 LIMIT 500',
      clientId
    )) as any[];
    if (!rows.length) return [];

    const userLower = userMessage.toLowerCase();
    const replyLower = botReply.toLowerCase();
    const hasBride = /عروس|جهاز.*عرو/.test(userMessage);
    const hasDeal = /عرض|خصم|لقطة|تخفيض/.test(userMessage);

    const scored = rows
      .map((r) => {
        const p = this.productRow(r);
        const nameL = p.name.toLowerCase();
        const catL = p.category.toLowerCase();
        const brandL = p.brand.toLowerCase();
        let score = 0;
        const reasons: string[] = [];
        if (catL && userLower.includes(catL.slice(0, 6))) {
          score += 3;
          reasons.push('فئة في رسالة العميل');
        }
        if (replyLower.includes(nameL.slice(0, 8))) {
          score += 3;
          reasons.push('عنوان في رد البوت');
        }
        if (hasBride && p.isBrideEssential) {
          score += 4;
          reasons.push('عروسة + أساسي');
        }
        if (hasDeal && p.isDeal) {
          score += 4;
          reasons.push('عروض + لقطة');
        }
        if (brandL && userLower.includes(brandL)) {
          score += 3;
          reasons.push('الماركة');
        }
        return { p, score, reasons };
      })
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return scored.map((s) => s.p);
  }

  /** استرجاع منتجات تطابق كلمات الرسالة — يغذي ذكاء البوت من الفيد الحي */
  async searchForBot(clientId: string, query: string, limit = 5): Promise<Array<ReturnType<CatalogService['productRow']>>> {
    const words = query
      .split(/[\s،,؟?.:;]+/)
      .map((w) => w.trim())
      .filter((w) => w.length > 2)
      .slice(0, 8);
    if (!words.length) return [];
    const rows = (await db.all(
      `SELECT * FROM catalog_products WHERE client_id = ? AND in_stock = 1 LIMIT 800`,
      clientId
    )) as any[];
    const scored = rows
      .map((r) => {
        const hay = `${r.name} ${r.category} ${r.brand}`.toLowerCase();
        const score = words.reduce((acc, w) => acc + (hay.includes(w.toLowerCase()) ? (r.name.toLowerCase().includes(w.toLowerCase()) ? 3 : 1) : 0), 0);
        return { r, score };
      })
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score || (a.r.price || 0) - (b.r.price || 0))
      .slice(0, limit)
      .map((s) => this.productRow(s.r));
    return scored;
  }
}
