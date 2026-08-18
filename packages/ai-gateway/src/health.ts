/**
 * سجل الصحة (Health Registry) — مقاييس حية لكل مزود:
 * زمن استجابة EWMA، معدل نجاح نافذة، وحصة متبقية (من ترويسات x-ratelimit-*).
 */
export interface HealthEntry {
  providerId: string;
  ewmaLatencyMs: number | null;
  successRate: number | null;
  quotaRemaining: number | null; // 0..1 نسبة متبقية
  quotaResetAt: number | null;
  lastSeen: number | null;
}

const ALPHA = 0.3; // معامل EWMA

export class HealthRegistry {
  private entries = new Map<string, HealthEntry>();
  private window: Array<{ providerId: string; ok: boolean }> = [];
  private readonly windowMs: number;

  constructor(windowMs = 300_000) {
    this.windowMs = windowMs;
  }

  private entry(providerId: string): HealthEntry {
    let e = this.entries.get(providerId);
    if (!e) {
      e = {
        providerId,
        ewmaLatencyMs: null,
        successRate: null,
        quotaRemaining: null,
        quotaResetAt: null,
        lastSeen: null,
      };
      this.entries.set(providerId, e);
    }
    return e;
  }

  recordPulse(providerId: string, ok: boolean, latencyMs: number, quota?: { remaining: number | null; limit: number | null; resetAt: number | null }): void {
    const e = this.entry(providerId);
    e.lastSeen = Date.now();
    if (latencyMs > 0) {
      e.ewmaLatencyMs = e.ewmaLatencyMs == null ? latencyMs : Math.round(ALPHA * latencyMs + (1 - ALPHA) * e.ewmaLatencyMs);
    }
    if (quota) {
      e.quotaRemaining = quota.remaining != null && quota.limit != null && quota.limit > 0 ? quota.remaining / quota.limit : null;
      e.quotaResetAt = quota.resetAt ?? null;
    }
    this.window.push({ providerId, ok });
    const cutoff = Date.now() - this.windowMs;
    while (this.window.length && this.window[0] && cutoff > Date.now()) {
      this.window.shift();
    }
    // تنظيف النافذة عند كبر حجمها
    if (this.window.length > 10_000) this.window.splice(0, this.window.length - 5_000);
  }

  successRateOf(providerId: string): number | null {
    const recent = this.window.filter((w) => w.providerId === providerId).slice(-50);
    if (!recent.length) return null;
    return recent.filter((w) => w.ok).length / recent.length;
  }

  get(providerId: string): HealthEntry {
    const e = this.entry(providerId);
    return { ...e, successRate: this.successRateOf(providerId) };
  }

  all(): HealthEntry[] {
    return [...this.entries.keys()].map((k) => this.get(k));
  }
}
