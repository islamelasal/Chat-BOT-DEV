/**
 * Webhooks الصادرة — محرك تسليم آمن وقابل للتشغيل 24/7
 * ======================================================
 * - إيداع الحدث في قائمة (fire-and-forget) فلا يؤثر أبداً على زمن رد الودجت.
 * - معالجة دورية بادّعاء متفائل (optimistic claim) ضد التكرار عند تشغيل أكثر من عامل.
 * - إعادة محاولة بتراجع أسي (30ث → 2د → 10د → 1س → 6س) ثم `dead`.
 * - توقيع HMAC-SHA256 لكل رزمة حتى يتحقق المستلم من المصدر.
 * - حماية SSRF: منع العناوين الخاصة في الإنتاج.
 * - مهلة صارمة لكل طلب + سقف لحجم الرزمة.
 */
import { createHmac } from 'node:crypto';
import { db, id, json, now } from '@cbd/db';
import { config } from './config.js';
import { isPrivateUrl } from './crawl.js';

// ─────────────────────────────── الأنواع والثوابت ───────────────────────────────

export const WEBHOOK_EVENTS = [
  'lead.created',
  'conversation.message',
  'handoff.requested',
  'order.tracked',
  'catalog.synced',
  'webhook.test',
] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

/** فترات التراجع بين المحاولات (مللي ثانية) — المحاولة رقم n تستخدم الفترة رقم n-1 */
const BACKOFF_MS = [30_000, 120_000, 600_000, 3_600_000, 21_600_000];
/** أقصى حجم للرزمة المُرسَلة (256KB) — فوقها تُقصّ الحقول النصية الطويلة */
const MAX_PAYLOAD_BYTES = 256 * 1024;
/** حد أقصى لطول الحقول النصية داخل الرزمة (حماية قبل القص العام) */
const MAX_FIELD_CHARS = 4000;

export interface WebhookEndpointRow {
  id: string;
  client_id: string;
  name: string;
  url: string;
  secret: string;
  events_json: string;
  active: number;
  last_status: string;
  last_status_at: number | null;
  created_at: number;
  updated_at: number;
}

export interface WebhookDeliveryRow {
  id: string;
  endpoint_id: string;
  event: string;
  payload_json: string;
  status: string;
  attempts: number;
  next_attempt_at: number;
  response_code: number | null;
  response_body: string;
  error: string;
  duration_ms: number | null;
  created_at: number;
  updated_at: number;
}

// ─────────────────────────────── التوقيع والتحقق ───────────────────────────────

/** توقيع HMAC-SHA256 بالصيغة المتعارف عليها: sha256=hex(secret, `${ts}.${body}`) */
export function signPayload(secret: string, timestampSeconds: number, body: string): string {
  return 'sha256=' + createHmac('sha256', secret).update(`${timestampSeconds}.${body}`).digest('hex');
}

/** التحقق من صحة URL نقطة الوصول: http/https فقط + حماية SSRF (ما لم يُسمح صراحةً) */
export async function validateWebhookUrl(raw: string): Promise<{ ok: boolean; reason: string }> {
  let u: URL;
  try {
    u = new URL(String(raw).trim());
  } catch {
    return { ok: false, reason: 'رابط غير صالح — تأكد من كتابة عنوان كامل يبدأ بـ https://' };
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') {
    return { ok: false, reason: 'البروتوكول يجب أن يكون http أو https فقط' };
  }
  if (u.username || u.password) {
    return { ok: false, reason: 'لا يُسمح بوضع بيانات دخول داخل الرابط' };
  }
  if (!config.WEBHOOK_ALLOW_PRIVATE && (await isPrivateUrl(u.toString()))) {
    return { ok: false, reason: 'العنوان يشير لشبكة داخلية — مرفوض حمايةً من SSRF' };
  }
  return { ok: true, reason: '' };
}

/** تخطيط الحقول النصية الطويلة + سقف حجم الرزمة الكلي */
function compactPayload(payload: Record<string, unknown>): string {
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') return v.length > MAX_FIELD_CHARS ? v.slice(0, MAX_FIELD_CHARS) + '…' : v;
    if (Array.isArray(v)) return v.slice(0, 20).map(walk);
    if (v && typeof v === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) out[k] = walk(val);
      return out;
    }
    return v;
  };
  let s = JSON.stringify(walk(payload));
  if (s.length > MAX_PAYLOAD_BYTES) {
    s = JSON.stringify({ _truncated: true, _note: 'payload exceeded size limit', event: payload.event, at: payload.at });
  }
  return s;
}

// ─────────────────────────────── الخدمة ───────────────────────────────

export class WebhooksService {
  private timer: ReturnType<typeof setInterval> | null = null;
  private processing = false;
  private kickRequested = false;

  // ── دورة الحياة ──

  startPolling(intervalMs: number = config.WEBHOOK_PROCESS_INTERVAL_MS): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.processDue(), intervalMs);
    this.timer.unref?.();
    void this.processDue();
    console.log(`🔗 Webhooks: معالجة دورية كل ${intervalMs / 1000} ثانية`);
  }

  stopPolling(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  // ── الإيداع (fire-and-forget — لا يرمي أبداً لمسار المتصل) ──

  async enqueue(event: WebhookEvent, clientId: string, payload: Record<string, unknown>): Promise<void> {
    try {
      const endpoints = (await db.all(
        "SELECT * FROM webhook_endpoints WHERE client_id = ? AND active = 1",
        clientId
      )) as unknown as WebhookEndpointRow[];
      const subscribed = endpoints.filter((e) => json<string[]>(e.events_json, []).includes(event));
      if (!subscribed.length) return; // لا مشتركين — skip بدون أخطاء
      const body = compactPayload({ ...payload, event, clientId, at: new Date().toISOString() });
      const t = now();
      for (const ep of subscribed) {
        await db.run(
          `INSERT INTO webhook_deliveries
             (id, endpoint_id, event, payload_json, status, attempts, next_attempt_at, response_code, response_body, error, duration_ms, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'pending', 0, ?, NULL, '', '', NULL, ?, ?)`,
          id('whd'), ep.id, event, body, t, t, t
        );
      }
      this.kick();
    } catch {
      /* يجب ألا يعطل الإيداع مسار الودجت إطلاقاً */
    }
  }

  /** جدولة معالجة فورية بدون انتظار دورة الـ timer */
  private kick(): void {
    if (this.processing) {
      this.kickRequested = true;
      return;
    }
    setTimeout(() => void this.processDue(), 50).unref?.();
  }

  // ── المعالجة الدورية (single-flight + claim متفائل) ──

  async processDue(batchSize = 20): Promise<number> {
    if (this.processing) {
      this.kickRequested = true;
      return 0;
    }
    this.processing = true;
    let sent = 0;
    try {
      do {
        this.kickRequested = false;
        const t = now();
        // استعادة الصفوف العالقة في 'sending' بعد انهيار عملية سابقة (سلامة ضد الأعطال)
        const staleSendingBefore = t - (config.WEBHOOK_TIMEOUT_MS * 2 + 60_000);
        const due = (await db.all(
          `SELECT * FROM webhook_deliveries
            WHERE (status IN ('pending','failed') AND next_attempt_at <= ?)
               OR (status = 'sending' AND updated_at <= ?)
            ORDER BY next_attempt_at ASC, id ASC LIMIT ?`,
          t, staleSendingBefore, batchSize
        )) as unknown as WebhookDeliveryRow[];

        for (const d of due) {
          // ادّعاء متفائل: آمن حتى مع عاملين — التحديث الشرطي يتيح صفاً واحداً فقط
          const claimed = await db.run(
            `UPDATE webhook_deliveries SET status = 'sending', updated_at = ?
              WHERE id = ?
                AND ((status IN ('pending','failed') AND next_attempt_at <= ?)
                  OR (status = 'sending' AND updated_at <= ?))`,
            now(), d.id, t, staleSendingBefore
          );
          if (Number(claimed.changes) !== 1) continue;
          const fresh = (await db.get('SELECT * FROM webhook_deliveries WHERE id = ?', d.id)) as unknown as WebhookDeliveryRow;
          const ok = await this.sendOne(fresh);
          if (ok) sent++;
        }
      } while (this.kickRequested);
    } finally {
      this.processing = false;
    }
    return sent;
  }

  // ── إرسال عملية واحدة مع كل حالات الخطأ ──

  private async sendOne(delivery: WebhookDeliveryRow): Promise<boolean> {
    const endpoint = (await db.get('SELECT * FROM webhook_endpoints WHERE id = ?', delivery.endpoint_id)) as unknown as WebhookEndpointRow | undefined;
    if (!endpoint || !endpoint.active) {
      await db.run(
        `UPDATE webhook_deliveries SET status = 'dead', error = ?, updated_at = ? WHERE id = ?`,
        endpoint ? 'نقطة الوصول موقوفة' : 'نقطة الوصول محذوفة', now(), delivery.id
      );
      return false;
    }

    const started = Date.now();
    try {
      const timestampSeconds = Math.floor(started / 1000);
      const signature = endpoint.secret
        ? signPayload(endpoint.secret, timestampSeconds, delivery.payload_json)
        : '';
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), config.WEBHOOK_TIMEOUT_MS);
      let res: Response;
      try {
        res = await fetch(endpoint.url, {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'User-Agent': 'ChatBotDev-Webhooks/1.0 (+https://chatbotdev.app)',
            'X-CBD-Event': delivery.event,
            'X-CBD-Delivery-Id': delivery.id,
            'X-CBD-Signature-Timestamp': String(timestampSeconds),
            ...(signature ? { 'X-CBD-Signature': signature } : {}),
          },
          body: delivery.payload_json,
        });
      } finally {
        clearTimeout(timer);
      }
      const durationMs = Date.now() - started;
      const bodySnippet = (await res.text().catch(() => '')).slice(0, 500);
      const okCode = res.status >= 200 && res.status < 300;

      if (okCode) {
        await db.run(
          `UPDATE webhook_deliveries
             SET status = 'success', attempts = attempts + 1, next_attempt_at = ?,
                 response_code = ?, response_body = ?, error = '', duration_ms = ?, updated_at = ?
           WHERE id = ?`,
          now(), res.status, bodySnippet, durationMs, now(), delivery.id
        );
        await this.setEndpointStatus(endpoint.id, 'ok', res.status);
        return true;
      }

      await this.recordFailure(delivery, res.status, bodySnippet, durationMs, `HTTP ${res.status}`);
      return false;
    } catch (err) {
      const durationMs = Date.now() - started;
      const message = err instanceof Error ? (err.name === 'AbortError' ? `انتهت المهلة بعد ${durationMs}ms` : err.message) : String(err);
      await this.recordFailure(delivery, null, '', durationMs, message);
      return false;
    }
  }

  /** تسجيل فشل + جدولة المحاولة التالية بتراجع أسي، أو `dead` بعد استنفاد المحاولات */
  private async recordFailure(
    delivery: WebhookDeliveryRow,
    responseCode: number | null,
    responseBody: string,
    durationMs: number,
    error: string
  ): Promise<void> {
    const attempts = delivery.attempts + 1;
    const max = config.WEBHOOK_MAX_ATTEMPTS;
    if (attempts >= max) {
      await db.run(
        `UPDATE webhook_deliveries
           SET status = 'dead', attempts = ?, response_code = ?, response_body = ?, error = ?, duration_ms = ?, updated_at = ?
         WHERE id = ?`,
        attempts, responseCode, responseBody, error, durationMs, now(), delivery.id
      );
      await this.setEndpointStatus(delivery.endpoint_id, 'error', responseCode);
      return;
    }
    const backoff = BACKOFF_MS[Math.min(attempts - 1, BACKOFF_MS.length - 1)] ?? BACKOFF_MS[BACKOFF_MS.length - 1]!;
    await db.run(
      `UPDATE webhook_deliveries
         SET status = 'failed', attempts = ?, next_attempt_at = ?, response_code = ?, response_body = ?, error = ?, duration_ms = ?, updated_at = ?
       WHERE id = ?`,
      attempts, now() + backoff, responseCode, responseBody, error, durationMs, now(), delivery.id
    );
  }

  private async setEndpointStatus(endpointId: string, status: 'ok' | 'error', code: number | null): Promise<void> {
    await db.run(
      `UPDATE webhook_endpoints SET last_status = ?, last_status_at = ? WHERE id = ?`,
      status === 'ok' ? 'ok' : `error${code ? `:${code}` : ''}`, now(), endpointId
    );
  }

  // ── اختبار متزامن (زر «اختبار» في اللوحة) ──

  async testEndpoint(endpointId: string): Promise<{
    ok: boolean;
    status: number | null;
    durationMs: number;
    error: string;
    responseBody: string;
  }> {
    const endpoint = (await db.get('SELECT * FROM webhook_endpoints WHERE id = ?', endpointId)) as unknown as WebhookEndpointRow | undefined;
    if (!endpoint) throw new Error('نقطة الوصول غير موجودة');
    const payload = JSON.stringify({
      event: 'webhook.test',
      message: 'اختبار الاتصال من Chat Bot Dev — لو وصلتك الرزمة دي فكل حاجة تمام ✅',
      at: new Date().toISOString(),
    });
    const started = Date.now();
    try {
      const timestampSeconds = Math.floor(started / 1000);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), config.WEBHOOK_TIMEOUT_MS);
      let res: Response;
      try {
        res = await fetch(endpoint.url, {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'User-Agent': 'ChatBotDev-Webhooks/1.0 (+https://chatbotdev.app)',
            'X-CBD-Event': 'webhook.test',
            ...(endpoint.secret
              ? {
                  'X-CBD-Signature-Timestamp': String(timestampSeconds),
                  'X-CBD-Signature': signPayload(endpoint.secret, timestampSeconds, payload),
                }
              : {}),
          },
          body: payload,
        });
      } finally {
        clearTimeout(timer);
      }
      const durationMs = Date.now() - started;
      const bodySnippet = (await res.text().catch(() => '')).slice(0, 500);
      const ok = res.status >= 200 && res.status < 300;
      // نسجّل الاختبار في سجل التسليمات لأغراض التدقيق (مع جدولة إعادة المحاولة إن فشل)
      await db.run(
        `INSERT INTO webhook_deliveries
           (id, endpoint_id, event, payload_json, status, attempts, next_attempt_at, response_code, response_body, error, duration_ms, created_at, updated_at)
         VALUES (?, ?, 'webhook.test', ?, ?, 1, ?, ?, ?, ?, ?, ?, ?)`,
        id('whd'), endpointId, payload, ok ? 'success' : 'failed',
        ok ? now() : now() + BACKOFF_MS[0]!,
        res.status, bodySnippet, ok ? '' : `HTTP ${res.status}`,
        durationMs, now(), now()
      );
      await this.setEndpointStatus(endpointId, ok ? 'ok' : 'error', res.status);
      return { ok, status: res.status, durationMs, error: ok ? '' : `HTTP ${res.status}`, responseBody: bodySnippet };
    } catch (err) {
      const durationMs = Date.now() - started;
      const message = err instanceof Error ? (err.name === 'AbortError' ? `انتهت المهلة بعد ${durationMs}ms` : err.message) : String(err);
      await db.run(
        `INSERT INTO webhook_deliveries
           (id, endpoint_id, event, payload_json, status, attempts, next_attempt_at, response_code, response_body, error, duration_ms, created_at, updated_at)
         VALUES (?, ?, 'webhook.test', ?, 'failed', 1, ?, NULL, '', ?, ?, ?, ?)`,
        id('whd'), endpointId, payload, now(), message, durationMs, now(), now()
      );
      await this.setEndpointStatus(endpointId, 'error', null);
      return { ok: false, status: null, durationMs, error: message, responseBody: '' };
    }
  }

  // ── إعادة إرسال يدوية ──

  async retryDelivery(deliveryId: string): Promise<boolean> {
    const row = (await db.get('SELECT * FROM webhook_deliveries WHERE id = ?', deliveryId)) as unknown as WebhookDeliveryRow | undefined;
    if (!row) throw new Error('عملية التسليم غير موجودة');
    if (row.status === 'success') throw new Error('العملية نجحت بالفعل — لا حاجة لإعادة الإرسال');
    await db.run(
      `UPDATE webhook_deliveries SET status = 'pending', attempts = 0, next_attempt_at = ?, error = '', updated_at = ? WHERE id = ?`,
      now(), now(), deliveryId
    );
    this.kick();
    return true;
  }
}
