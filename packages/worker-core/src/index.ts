/**
 * @cbd/worker-core — منطق العامل الخلفي 24/7
 * يعمل داخل عملية الـ API (وضع التطوير/الديمو) أو كعملية مستقلة (الإنتاج).
 *
 * المهام:
 * 1. نبضات المزودين (Heartbeats) — كل 30 ثانية لكل مزود نشط.
 * 2. Dead-Man Switch — يكتشف توقف أي عامل/خدمة خلال دقيقة.
 * 3. تنبيهات مجمّعة (Debounce 15 دقيقة) — Telegram / Email / سجل داخلي.
 * 4. تنظيف دوري للمحادثات القديمة حسب سياسة الاحتفاظ.
 */
import type { CircuitBreaker, HealthRegistry } from '@cbd/gateway';
import { OpenAICompatibleAdapter, GeminiAdapter, MockAdapter } from '@cbd/gateway';
import { cache, db, getProviderHealthRaw, id, json, listEnabledProviders, now, recordHeartbeat } from '@cbd/db';

// ─────────────────────────────── بناء المحوّلات من DB ───────────────────────────────

export interface AdapterFactory {
  build(provider: { id: string; name: string; kind: string; baseUrl: string; apiKeyEnc: string }): {
    adapter: { ping(): Promise<{ ok: boolean; latencyMs: number; message: string; quota: { remaining: number | null; limit: number | null; resetAt: number | null } }>; id: string; name: string };
  };
}

export function defaultAdapterFactory(decrypt: (enc: string) => string): AdapterFactory {
  return {
    build(provider) {
      const apiKey = decrypt(provider.apiKeyEnc ?? '');
      switch (provider.kind) {
        case 'mock':
          return { adapter: new MockAdapter({ id: provider.id, name: provider.name }) };
        case 'gemini-native':
          return { adapter: new GeminiAdapter({ id: provider.id, name: provider.name, baseUrl: provider.baseUrl, apiKey }) };
        default:
          return { adapter: new OpenAICompatibleAdapter({ id: provider.id, name: provider.name, baseUrl: provider.baseUrl, apiKey }) };
      }
    },
  };
}

// ─────────────────────────────── النبضات ───────────────────────────────

export interface HeartbeatOptions {
  intervalMs?: number;      // الافتراضي 30 ثانية
  ttlSeconds?: number;      // TTL نبضة المزود في الكاش
  workerTtlSeconds?: number; // TTL نبضة العامل نفسه
  decrypt: (enc: string) => string;
  health?: HealthRegistry;
  breakers?: CircuitBreaker;
  notify: (alert: { type: string; severity: string; title: string; body: string }) => void;
}

export class HeartbeatRunner {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private readonly intervalMs: number;
  private readonly ttlSeconds: number;
  private readonly workerTtlSeconds: number;
  private readonly decrypt: (enc: string) => string;
  private readonly health?: HealthRegistry;
  private readonly breakers?: CircuitBreaker;
  private readonly notify: (a: { type: string; severity: string; title: string; body: string }) => void | Promise<void>;
  private lastWorkerAlert = 0;

  constructor(opts: HeartbeatOptions) {
    this.intervalMs = opts.intervalMs ?? 30_000;
    this.ttlSeconds = opts.ttlSeconds ?? 120;
    this.workerTtlSeconds = opts.workerTtlSeconds ?? 90;
    this.decrypt = opts.decrypt;
    this.health = opts.health;
    this.breakers = opts.breakers;
    this.notify = opts.notify;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), this.intervalMs);
    this.timer.unref?.();
    void this.tick();
    console.log(`💓 Heartbeats: كل ${this.intervalMs / 1000} ثانية`);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** فحص كل المزودين دفعة واحدة + تجديد نبضة العامل */
  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      // نبضة العامل نفسه (Dead-Man Switch مركزي)
      await cache.set('worker:pulse:main', String(now()), this.workerTtlSeconds);

      const providers = await listEnabledProviders();
      const factory = defaultAdapterFactory(this.decrypt);

      await Promise.allSettled(
        providers.map(async (p) => {
          const started = now();
          try {
            const { adapter } = factory.build(p);
            const health = await adapter.ping();
            await recordHeartbeat({
              providerId: p.id,
              ok: health.ok,
              latencyMs: health.latencyMs,
              message: health.message,
              at: started,
            });
            await cache.set(`provider:pulse:${p.id}`, health.ok ? '1' : '0', this.ttlSeconds);
            this.health?.recordPulse(p.id, health.ok, health.latencyMs, health.quota);

            // فحص دوائر مفتوحة (HALF_OPEN) عند عودة المزود للحياة
            if (health.ok && this.breakers) {
              for (const s of this.breakers.allStatuses()) {
                if (s.key.startsWith(`${p.id}:`) && s.state === 'half_open') {
                  this.breakers.recordSuccess(s.key);
                }
              }
            }

            // تنبيه عند سقوط مزود كان سليماً
            const prev = await cache.get(`provider:state:${p.id}`);
            if (prev === '1' && !health.ok) {
              this.notify({
                type: 'provider_down',
                severity: 'critical',
                title: `⚠️ مزود سقط: ${p.name}`,
                body: `آخر نبضة فشلت: ${health.message}`,
              });
            }
            await cache.set(`provider:state:${p.id}`, health.ok ? '1' : '0', 3600);
          } catch (err) {
            await await recordHeartbeat({
              providerId: p.id,
              ok: false,
              latencyMs: 0,
              message: (err as Error).message,
              at: started,
            });
            await cache.set(`provider:pulse:${p.id}`, '0', this.ttlSeconds);
          }
        })
      );
    } finally {
      this.running = false;
    }
  }
}

// ─────────────────────────────── Dead-Man Switch ───────────────────────────────

export class DeadManSwitch {
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly intervalMs: number;
  private readonly notify: (a: { type: string; severity: string; title: string; body: string }) => void | Promise<void>;
  private lastAlert = 0;

  constructor(opts: { intervalMs?: number; notify: HeartbeatOptions['notify'] }) {
    this.intervalMs = opts.intervalMs ?? 60_000;
    this.notify = opts.notify;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), this.intervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** يفحص نبضات TTL — أي مفتاح منتهي = خدمة ميتة */
  async tick(): Promise<void> {
    const workerPulse = await cache.get('worker:pulse:main');
    if (!workerPulse) {
      const nowMs = now();
      if (nowMs - this.lastAlert > 15 * 60_000) {
        this.lastAlert = nowMs;
        this.notify({
          type: 'worker_dead',
          severity: 'critical',
          title: '🚨 العامل الخلفي متوقف!',
          body: 'نبضة العامل انتهت TTL — النبضات والعدادات لا تعمل الآن. أعد تشغيل خدمة worker.',
        });
      }
    }

    const providerIds = new Set((await listEnabledProviders()).map((p) => p.id));
    const keys = await cache.keys('provider:pulse:');
    for (const key of keys) {
      const providerId = key.replace('provider:pulse:', '');
      if (!providerIds.has(providerId)) continue;
      const v = await cache.get(key);
      if (v === null) {
        const recent = await db.get('SELECT ok, at FROM heartbeat_logs WHERE provider_id = ? ORDER BY at DESC LIMIT 1', providerId) as { ok: number; at: number } | undefined;
        if (recent && now() - recent.at > 5 * 60_000) {
          this.notify({
            type: 'provider_stale',
            severity: 'warning',
            title: `⚠️ نبضات متوقفة: ${providerId}`,
            body: 'لا توجد نبضات حديثة لهذا المزود — راجع اتصاله.',
          });
        }
      }
    }
  }
}

// ─────────────────────────────── التنبيهات ───────────────────────────────

export interface NotifyTargets {
  telegram?: { botToken: string; chatId: string };
  email?: { smtpUrl: string; from: string; to: string };
}

export class Alerter {
  private readonly targets: NotifyTargets;
  private readonly dedupeMs: number;

  constructor(targets: NotifyTargets, dedupeMs = 15 * 60_000) {
    this.targets = targets;
    this.dedupeMs = dedupeMs;
  }

  async notify(alert: { type: string; severity: string; title: string; body: string }): Promise<void> {
    const dedupeKey = `${alert.type}:${alert.title}`;
    const existing = await db.get('SELECT created_at FROM alerts WHERE dedupe_key = ? AND resolved_at IS NULL ORDER BY created_at DESC LIMIT 1', dedupeKey) as { created_at: number } | undefined;
    if (existing && now() - existing.created_at < this.dedupeMs) return; // Debounce

    await db.run(
      `INSERT INTO alerts (id, type, severity, title, body, dedupe_key, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      id('alt'), alert.type, alert.severity, alert.title, alert.body, dedupeKey, now()
    );

    if (this.targets.telegram?.botToken) {
      const { botToken, chatId } = this.targets.telegram;
      fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: `${alert.title}\n\n${alert.body}` }),
      }).catch(() => {});
    }
    console.log(`🔔 [${alert.severity}] ${alert.title}`);
  }
}

// ─────────────────────────────── سياسة الاحتفاظ ───────────────────────────────

export class RetentionJanitor {
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly retentionDays: number;

  constructor(retentionDays = 90) {
    this.retentionDays = retentionDays;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), 6 * 3600_000);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  tick(): void {
    const cutoff = now() - this.retentionDays * 86_400_000;
    db.run('DELETE FROM conversations WHERE updated_at < ?', cutoff);
    db.run('DELETE FROM usage_events WHERE created_at < ?', cutoff);
    db.run('DELETE FROM audit_logs WHERE created_at < ?', cutoff - 180 * 86_400_000);
    db.run("DELETE FROM alerts WHERE created_at < ? AND resolved_at IS NOT NULL", cutoff);
  }
}

// ─────────────────────────────── تشغيل الكل ───────────────────────────────

export interface WorkerAllOptions {
  intervalMs?: number;
  retentionDays?: number;
  decrypt: (enc: string) => string;
  health?: HealthRegistry;
  breakers?: CircuitBreaker;
  targets?: NotifyTargets;
}

export interface WorkerRuntime {
  stop(): void;
}

export function startWorkerAll(opts: WorkerAllOptions): WorkerRuntime {
  const alerter = new Alerter(opts.targets ?? {});
  const notify = (a: { type: string; severity: string; title: string; body: string }) => { void alerter.notify(a); };

  const heartbeats = new HeartbeatRunner({
    intervalMs: opts.intervalMs,
    decrypt: opts.decrypt,
    health: opts.health,
    breakers: opts.breakers,
    notify,
  });
  const deadman = new DeadManSwitch({ notify });
  const janitor = new RetentionJanitor(opts.retentionDays);

  heartbeats.start();
  deadman.start();
  janitor.start();

  return {
    stop() {
      heartbeats.stop();
      deadman.stop();
      janitor.stop();
    },
  };
}
