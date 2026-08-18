/**
 * دائرة الكسر (Circuit Breaker) لكل زوج (مزود × نموذج)
 * CLOSED → OPEN عند معدل خطأ > 50% في نافذة أو 5 فشل متتالي
 * OPEN → HALF_OPEN بعد مهلة تبريد تصاعدية → فحص برسالة تجريبية
 */
import type { CircuitState } from '@cbd/shared';

interface Breaker {
  state: CircuitState;
  failures: number;
  successes: number;
  consecutiveFailures: number;
  windowStart: number;
  openedAt: number | null;
  retryAt: number | null;
  cooldownMs: number;
}

export class CircuitBreaker {
  private breakers = new Map<string, Breaker>();
  private readonly onStateChange?: (key: string, state: CircuitState) => void;

  constructor(opts?: {
    errorThreshold?: number;      // نسبة الخطأ
    windowMs?: number;
    consecutiveThreshold?: number;
    baseCooldownMs?: number;
    maxCooldownMs?: number;
    onStateChange?: (key: string, state: CircuitState) => void;
  }) {
    this.opts = {
      errorThreshold: opts?.errorThreshold ?? 0.5,
      windowMs: opts?.windowMs ?? 120_000,
      consecutiveThreshold: opts?.consecutiveThreshold ?? 5,
      baseCooldownMs: opts?.baseCooldownMs ?? 10_000,
      maxCooldownMs: opts?.maxCooldownMs ?? 300_000,
    };
    this.onStateChange = opts?.onStateChange;
  }
  private readonly opts: Required<Omit<NonNullable<ConstructorParameters<typeof CircuitBreaker>[0]>, 'onStateChange'>>;

  private breaker(key: string): Breaker {
    let b = this.breakers.get(key);
    if (!b) {
      b = {
        state: 'closed',
        failures: 0,
        successes: 0,
        consecutiveFailures: 0,
        windowStart: Date.now(),
        openedAt: null,
        retryAt: null,
        cooldownMs: this.opts.baseCooldownMs,
      };
      this.breakers.set(key, b);
    }
    return b;
  }

  /** هل يُسمح بمحاولة الآن؟ (يُدير انتقال HALF_OPEN تلقائياً) */
  allow(key: string): boolean {
    const b = this.breaker(key);
    const now = Date.now();
    // تدوير النافذة
    if (now - b.windowStart > this.opts.windowMs) {
      b.failures = 0;
      b.successes = 0;
      b.consecutiveFailures = 0;
      b.windowStart = now;
    }
    if (b.state === 'open') {
      if (b.retryAt != null && now >= b.retryAt) {
        b.state = 'half_open';
        this.onStateChange?.(key, b.state);
        return true;
      }
      return false;
    }
    return true;
  }

  recordSuccess(key: string): void {
    const b = this.breaker(key);
    b.successes++;
    b.consecutiveFailures = 0;
    if (b.state === 'half_open') {
      // تعافٍ كامل
      b.state = 'closed';
      b.failures = 0;
      b.cooldownMs = this.opts.baseCooldownMs;
      b.openedAt = null;
      b.retryAt = null;
      this.onStateChange?.(key, b.state);
    }
  }

  recordFailure(key: string): void {
    const b = this.breaker(key);
    const now = Date.now();
    if (now - b.windowStart > this.opts.windowMs) {
      b.failures = 0;
      b.successes = 0;
      b.consecutiveFailures = 0;
      b.windowStart = now;
    }
    b.failures++;
    b.consecutiveFailures++;
    const total = b.failures + b.successes;
    const errorRate = total > 0 ? b.failures / total : 0;

    if (b.state === 'half_open') {
      this.open(key, b);
      return;
    }
    if (b.state === 'closed' && (b.consecutiveFailures >= this.opts.consecutiveThreshold || errorRate > this.opts.errorThreshold)) {
      this.open(key, b);
    }
  }

  private open(key: string, b: Breaker): void {
    b.state = 'open';
    b.openedAt = Date.now();
    b.retryAt = Date.now() + b.cooldownMs;
    b.cooldownMs = Math.min(b.cooldownMs * 2, this.opts.maxCooldownMs); // تبريد تصاعدي
    this.onStateChange?.(key, b.state);
  }

  stateOf(key: string): CircuitState {
    return this.breaker(key).state;
  }

  status(key: string): { state: CircuitState; failures: number; openedAt: number | null; retryAt: number | null } {
    const b = this.breaker(key);
    return { state: b.state, failures: b.failures, openedAt: b.openedAt, retryAt: b.retryAt };
  }

  allStatuses(): Array<{ key: string } & ReturnType<CircuitBreaker['status']>> {
    return [...this.breakers.entries()].map(([key, b]) => ({
      key,
      state: b.state,
      failures: b.failures,
      openedAt: b.openedAt,
      retryAt: b.retryAt,
    }));
  }
}
