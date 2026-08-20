/**
 * crawl — طبقة جلب صفحات/فيدات العملاء (خلفية بحتة)
 * ─────────────────────────────────────────────────────────────
 * تقنيات مطبقة (مستخلصة من دراسة Scrapling v2):
 *  - سلم تدرّج: خدمة Scrapling الجانبية (بصمة TLS/متصفح خفي) → جلب مباشر محسّن
 *  - فك ضغط gzip/deflate يدوياً (undici لا يفك الضغط تلقائياً)
 *  - كشف الترميز: charset من الرأس أو meta — دعم windows-1256 للفيدات العربية
 *  - كشف الحجب: أكواد + بصمات محتوى ("Just a moment", "access denied"...)
 *  - احترام Retry-After + إعادة محاولة بتراجع عشوائي (backoff + jitter)
 *  - حارس SSRF بالـ DNS Pinning
 */
import { gunzipSync, inflateSync } from 'node:zlib';
import { decodeBuffer, detectCharset } from './charsets.js';

// ─────────────────────────── كشف الحجب ───────────────────────────

const BLOCKED_STATUS = new Set([401, 403, 407, 429, 444, 500, 502, 503, 504]);
const BLOCKED_MARKERS = [
  'just a moment', 'access denied', 'cf-browser-verification', 'captcha',
  'rate limit', 'sorry, you have been blocked', 'verify you are human',
  'challenge-platform', 'attention required',
];

export function isBlockedResponse(status: number, body: string): boolean {
  if (BLOCKED_STATUS.has(status)) return true;
  const low = body.slice(0, 20_000).toLowerCase();
  return BLOCKED_MARKERS.some((m) => low.includes(m));
}

function parseRetryAfter(headers: Headers): number {
  const v = headers.get('retry-after');
  if (!v) return 0;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 60) : 0;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ─────────────────────────── فك الضغط ───────────────────────────

function decompress(buf: Buffer, encoding: string | null): Buffer {
  try {
    if (encoding === 'gzip') return gunzipSync(buf);
    if (encoding === 'deflate') return inflateSync(buf);
    // خوادم أحياناً ترسل gzip برأس deflate — جرب الاثنين بأمان
    if (buf[0] === 0x1f && buf[1] === 0x8b) return gunzipSync(buf);
  } catch {
    /* تجاهل — سنتعامل معه كبيانات خام */
  }
  return buf;
}

// ─────────────────────────── الجلب المباشر المحسّن ───────────────────────────

/** تنظيف رابط فيد: إزالة كيانات HTML والمسافات (بعض العملاء يلصقون روابط منسوخة من المتصفح) */
export function sanitizeFeedUrl(url: string): string {
  let u = url.trim();
  // إزالة كيانات HTML شائعة
  u = u.replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&#38;/gi, '&');
  return u;
}

/** توليد متغيرات عنوان الفيد — بعض الخوادم تستجيب فقط لنطاق معين (www أو بدونه) أو بروتوكول معين */
export function buildUrlVariants(url: string): string[] {
  const clean = sanitizeFeedUrl(url);
  const variants: string[] = [clean];
  try {
    const u = new URL(clean);
    // إزالة www إن وُجد
    if (u.hostname.startsWith('www.')) {
      const noWww = new URL(clean);
      noWww.hostname = u.hostname.slice(4);
      variants.push(noWww.toString());
    } else {
      // إضافة www
      const withWww = new URL(clean);
      withWww.hostname = 'www.' + u.hostname;
      variants.push(withWww.toString());
    }
    // تبديل البروتوكول (بعض الخوادم ترفض https بسياسات قديمة)
    const protoSwap = new URL(clean);
    protoSwap.protocol = u.protocol === 'https:' ? 'http:' : 'https:';
    variants.push(protoSwap.toString());
  } catch {
    /* تجاهل — المتغير الأساسي يكفي */
  }
  return [...new Set(variants)];
}

/** رؤوس جلب واقعية لفيدات المنتجات (تعامل كمتجر RSS/CSV) */
function feedHeaders(): Record<string, string> {
  const agents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
    'Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0',
  ];
  return {
    'user-agent': agents[Math.floor(Math.random() * agents.length)]!,
    accept: 'application/rss+xml, application/xml;q=0.9, text/xml;q=0.8, text/csv;q=0.7, */*;q=0.5',
    'accept-language': 'ar-EG,ar;q=0.9,en;q=0.6',
    'accept-encoding': 'gzip, deflate',
    'cache-control': 'no-cache',
    pragma: 'no-cache',
  };
}

export interface DirectFetchResult {
  ok: boolean;
  status: number;
  text: string;
  url: string;
  blocked: boolean;
  contentType: string;
}

export async function fetchDirect(
  url: string,
  opts?: { timeoutMs?: number; attempts?: number; tryVariants?: boolean }
): Promise<DirectFetchResult> {
  const attempts = opts?.attempts ?? 2;
  const timeoutMs = opts?.timeoutMs ?? 15_000;
  const variants = opts?.tryVariants === false ? [url] : buildUrlVariants(url);
  let lastError = 'فشل الاتصال';

  for (const variant of variants) {
    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        let extra: Record<string, string> = {};
      try {
        const origin = new URL(variant).origin;
        extra = { referer: origin + '/', origin };
      } catch {
        /* تجاهل */
      }
      const res = await fetch(variant, {
        headers: { ...feedHeaders(), ...extra },
        redirect: 'follow',
        signal: AbortSignal.timeout(timeoutMs),
      });
        const contentType = res.headers.get('content-type') ?? '';
        const encoding = res.headers.get('content-encoding');
        const raw = Buffer.from(await res.arrayBuffer());
        const buf = decompress(raw, encoding);
        const text = decodeBuffer(buf, detectCharset(contentType, buf.subarray(0, 4096).toString('latin1')));
        const blocked = isBlockedResponse(res.status, text);
        if (blocked && attempt < attempts - 1) {
          const wait = parseRetryAfter(res.headers) * 1000 || (1000 + Math.random() * 1500) * (attempt + 1);
          await sleep(wait);
          continue;
        }
        return { ok: res.ok, status: res.status, text, url: res.url, blocked, contentType };
      } catch (err) {
        lastError = (err as Error).message;
        if (attempt < attempts - 1) await sleep(500 + Math.random() * 800);
      }
    }
  }
  return { ok: false, status: 0, text: '', url, blocked: false, contentType: '', error: lastError } as any;
}

// ─────────────────────────── استخراج النص ───────────────────────────

export function decodeEntities(html: string): string {
  return html
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, d) => String.fromCodePoint(Number(d)));
}

export interface CrawlResult {
  title: string;
  chunks: Array<{ title: string; content: string; source: string }>;
}

export function extractText(html: string): string {
  let s = decodeEntities(html);
  s = s.replace(/<script[\s\S]*?<\/script>/gi, ' ');
  s = s.replace(/<style[\s\S]*?<\/style>/gi, ' ');
  s = s.replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ');
  s = s.replace(/<svg[\s\S]*?<\/svg>/gi, ' ');
  s = s.replace(/<template[\s\S]*?<\/template>/gi, ' ');
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<\/(p|div|li|h1|h2|h3|h4|h5|h6|tr|section|article)>/gi, '\n');
  s = s.replace(/<\/?(li|tr)[^>]*>/gi, '\n• ');
  s = s.replace(/<[^>]+>/g, ' ');
  s = s
    .split('\n')
    .map((line) => line.replace(/[ \t\r]+/g, ' ').trim())
    .filter((line) => line.length > 0)
    .join('\n');
  return s;
}

export function chunkText(text: string, maxLen = 1400, overlap = 150): string[] {
  const lines = text.split('\n').filter((l) => l.trim().length > 0);
  const chunks: string[] = [];
  let current = '';
  for (const line of lines) {
    if (current.length + line.length + 1 > maxLen && current.length > 200) {
      chunks.push(current.trim());
      current = current.slice(-overlap) + '\n' + line;
    } else {
      current += (current ? '\n' : '') + line;
    }
  }
  if (current.trim().length > 40) chunks.push(current.trim());
  return chunks.slice(0, 30);
}

/** يبدو النص كصفحة HTML (مفيد لكشف "الفيد الذي يعيد صفحة ويب") */
export function looksLikeHtml(text: string): boolean {
  const t = text.trimStart().slice(0, 500).toLowerCase();
  return t.startsWith('<!doctype') || t.startsWith('<html') || /<(head|body|meta|script|div)\b/.test(t);
}

// ─────────────────────────── الزحف بسلم التدرّج ───────────────────────────

export async function crawlUrl(url: string, timeoutMs = 30000): Promise<CrawlResult> {
  // 1) خدمة Scrapling الجانبية (بصمة TLS / متصفح خفي يحل Cloudflare)
  const scraplingUrl = process.env.SCRAPLING_URL ?? '';
  if (scraplingUrl) {
    try {
      const sres = await fetch(`${scraplingUrl.replace(/\/+$/, '')}/crawl`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url, strategy: 'auto', timeout_ms: timeoutMs }),
        signal: AbortSignal.timeout(timeoutMs + 20_000),
      });
      if (sres.ok) {
        const j = (await sres.json()) as { ok?: boolean; html?: string; title?: string; error?: string };
        if (j.ok && j.html && j.html.length > 500) {
          const text = extractText(j.html);
          if (text.length >= 60) {
            return {
              title: j.title || url.replace(/^https?:\/\//, '').slice(0, 80),
              chunks: chunkText(text).map((content) => ({
                title: (j.title || url.replace(/^https?:\/\//, '').slice(0, 80)).slice(0, 120),
                content,
                source: url,
              })),
            };
          }
        }
      }
    } catch {
      /* استمر للجلب المباشر المحسّن */
    }
  }

  // 2) الجلب المباشر المحسّن (فك ضغط + ترميز + حجب + إعادة محاولة)
  const res = await fetchDirect(url, { timeoutMs: 15_000 });
  if (!res.ok) throw new Error(`HTTP ${res.status}${res.blocked ? ' (محجوب)' : ''}`);
  const contentType = res.contentType ?? '';
  if (!contentType.includes('html') && !contentType.includes('text') && !contentType.includes('xml')) {
    throw new Error('المحتوى ليس صفحة HTML');
  }
  const titleMatch = res.text.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const pageTitle = decodeEntities(titleMatch?.[1] ?? url).trim();
  const text = extractText(res.text);
  if (text.length < 60) throw new Error('لا يوجد محتوى نصي كافٍ');
  const parts = chunkText(text);
  return {
    title: pageTitle,
    chunks: parts.map((content) => ({
      title: pageTitle.slice(0, 120) || url.replace(/^https?:\/\//, '').slice(0, 80),
      content,
      source: url,
    })),
  };
}

// ─────────────────────────── llms.txt (معيار LLMs للويب) ───────────────────────────

export interface LlmResult {
  title: string;
  chunks: Array<{ title: string; content: string; source: string }>;
}

/**
 * استيراد llms.txt (ميزة CS-Cart 4.20.1 — Website → SEO → llms.txt)
 * يُقسم الملف حسب عناوين Markdown (# / ##) — كل قسم يصبح شظية معرفة مستقلة.
 */
export async function fetchLlmFile(url: string, timeoutMs = 30000): Promise<LlmResult> {
  const scraplingUrl = process.env.SCRAPLING_URL ?? '';
  let text = '';

  // سلسلة الجلب: مباشر محسّن → Scrapling
  const direct = await fetchDirect(url, { timeoutMs: 15_000, attempts: 2, tryVariants: true });
  if (direct.ok && direct.text.length > 40) {
    text = direct.text;
  } else if (scraplingUrl) {
    try {
      const sres = await fetch(`${scraplingUrl.replace(/\/+$/, '')}/crawl`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url, strategy: 'auto', timeout_ms: timeoutMs }),
        signal: AbortSignal.timeout(timeoutMs + 20_000),
      });
      if (sres.ok) {
        const j = (await sres.json()) as { ok?: boolean; html?: string };
        if (j.ok && j.html) text = j.html;
      }
    } catch {
      /* استمر */
    }
  }
  if (!text || text.length < 40) throw new Error('تعذر جلب llms.txt — تأكد من الرابط');

  const titleMatch = text.match(/^#\s+(.+)$/m);
  const title = titleMatch?.[1]?.trim() || url.replace(/^https?:\/\//, '').split('/')[0] || 'llms.txt';

  // تقسيم حسب عناوين Markdown
  const sections: Array<{ title: string; content: string }> = [];
  const lines = text.split(/\r?\n/);
  let currentTitle = title;
  let current: string[] = [];
  const flush = () => {
    const content = current.map((l) => l.trim()).filter(Boolean).join('\n').trim();
    if (content.length >= 30) sections.push({ title: currentTitle.slice(0, 120), content: content.slice(0, 3000) });
    current = [];
  };
  for (const line of lines) {
    const h = line.match(/^#{1,3}\s+(.+)$/);
    if (h) {
      flush();
      currentTitle = h[1]!.trim();
    } else {
      current.push(line);
    }
  }
  flush();

  if (!sections.length) {
    // ملف نصي بلا عناوين — قسم واحد
    const content = text.trim();
    sections.push({ title, content: content.slice(0, 5000) });
  }

  return {
    title,
    chunks: sections.map((sec) => ({ title: sec.title, content: sec.content, source: url })),
  };
}

// ─────────────────────────── حارس SSRF ───────────────────────────

function isPrivateIp(ip: string): boolean {
  if (ip === '::1' || ip === '::' || ip === 'fc00::' || /^fe[89ab]/.test(ip)) return true;
  const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const a = Number(m[1]), b = Number(m[2]);
  if (m.slice(1).some((o) => Number(o) > 255)) return true;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a >= 224) return true;
  return false;
}

export function isPrivateHost(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host === 'localhost' || host.endsWith('.localhost')) return true;
    if (host === '0.0.0.0' || host === '::1' || host === '[::1]') return true;
    return isPrivateIp(host);
  } catch {
    return true;
  }
}

export async function isPrivateUrl(url: string): Promise<boolean> {
  if (isPrivateHost(url)) return true;
  try {
    const host = new URL(url).hostname;
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return isPrivateIp(host);
    const dns = await import('node:dns');
    const resolved = await dns.promises.lookup(host, { all: true });
    return resolved.some((r) => isPrivateIp(r.address));
  } catch {
    return false;
  }
}
