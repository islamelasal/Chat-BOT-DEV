import { describe, expect, it } from 'vitest';
import { CircuitBreaker } from '../src/circuit-breaker.js';
import { HealthRegistry } from '../src/health.js';
import { Router } from '../src/router.js';
import type { Candidate, ChatChunk, ProviderAdapter } from '../src/types.js';
import { MockAdapter } from '../src/adapters/mock.js';

function fakeAdapter(opts: {
  id: string;
  name: string;
  fail?: boolean;
  latencyMs?: number;
  tokens?: number;
}): ProviderAdapter {
  const { fail = false, latencyMs = 1, tokens = 10 } = opts;
  return {
    id: opts.id,
    name: opts.name,
    kind: 'openai-compatible',
    async *chat(): AsyncIterable<ChatChunk> {
      if (fail) {
        yield { type: 'error', message: 'HTTP 500', code: 'server_error' };
        return;
      }
      await new Promise((r) => setTimeout(r, latencyMs));
      for (let i = 0; i < tokens; i++) yield { type: 'delta', text: 'كلمة ' };
      yield { type: 'done', usage: { input: 5, output: tokens } };
    },
    async ping() {
      return { ok: !fail, latencyMs, message: 'ok', quota: { remaining: null, limit: null, resetAt: null } };
    },
    async listModels() {
      return [];
    },
  };
}

const candidate = (a: ProviderAdapter, over: Partial<Candidate> = {}): Candidate => ({
  adapter: a,
  providerId: a.id,
  model: 'model-x',
  tier: 0,
  weight: 1,
  maxTokens: 100,
  temperature: 0.4,
  costPer1MIn: 0,
  costPer1MOut: 0,
  free: true,
  ...over,
});

async function collect(route: ReturnType<Router['route']>) {
  let text = '';
  for await (const c of route.chunks) {
    if (c.type === 'delta') text += c.text;
  }
  return { text, outcome: await route.finalize() };
}

describe('CircuitBreaker', () => {
  it('يفتح الدائرة بعد 5 فشل متتالي', () => {
    const cb = new CircuitBreaker({ consecutiveThreshold: 5, baseCooldownMs: 1000 });
    const key = 'p:m';
    expect(cb.allow(key)).toBe(true);
    for (let i = 0; i < 5; i++) cb.recordFailure(key);
    expect(cb.stateOf(key)).toBe('open');
    expect(cb.allow(key)).toBe(false);
  });

  it('يتعافى عبر HALF_OPEN بعد انتهاء التبريد', async () => {
    const cb = new CircuitBreaker({ consecutiveThreshold: 2, baseCooldownMs: 30 });
    const key = 'p:m';
    cb.recordFailure(key);
    cb.recordFailure(key);
    expect(cb.stateOf(key)).toBe('open');
    await new Promise((r) => setTimeout(r, 60));
    expect(cb.allow(key)).toBe(true); // ينتقل لـ half_open
    expect(cb.stateOf(key)).toBe('half_open');
    cb.recordSuccess(key);
    expect(cb.stateOf(key)).toBe('closed');
  });

  it('خطأ واحد لا يفتح الدائرة', () => {
    const cb = new CircuitBreaker({ consecutiveThreshold: 5 });
    const key = 'p:m';
    cb.recordSuccess(key);
    cb.recordFailure(key);
    expect(cb.stateOf(key)).toBe('closed');
  });
});

describe('Router — failover', () => {
  it('ينتقل للمزود الثاني عند فشل الأول (priority-failover)', async () => {
    const cb = new CircuitBreaker();
    const health = new HealthRegistry();
    const router = new Router({ breakers: cb, health });
    const a1 = fakeAdapter({ id: 'prv1', name: 'bad', fail: true });
    const a2 = fakeAdapter({ id: 'prv2', name: 'good' });
    const route = router.route({
      strategy: 'priority-failover',
      tiers: [[candidate(a1), candidate(a2)]],
      messages: [{ role: 'user', content: 'مرحبا' }],
    });
    const { text, outcome } = await collect(route);
    expect(outcome.success).toBe(true);
    expect(outcome.providerId).toBe('prv2');
    expect(outcome.fallbackUsed).toBe(true);
    expect(outcome.attempts).toBe(2);
    expect(text).toContain('كلمة');
  });

  it('ينتقل بين الطبقات (tiers) عند فشل الطبقة كلها', async () => {
    const cb = new CircuitBreaker();
    const health = new HealthRegistry();
    const router = new Router({ breakers: cb, health });
    const a1 = fakeAdapter({ id: 'prv1', name: 'tier1', fail: true });
    const a2 = fakeAdapter({ id: 'prv2', name: 'tier2' });
    const route = router.route({
      strategy: 'priority-failover',
      tiers: [[candidate(a1, { tier: 0 })], [candidate(a2, { tier: 1 })]],
      messages: [{ role: 'user', content: 'مرحبا' }],
    });
    const { outcome } = await collect(route);
    expect(outcome.success).toBe(true);
    expect(outcome.providerId).toBe('prv2');
  });

  it('يتجنب مزوداً بدائرته مفتوحة ويختار السليم', async () => {
    const cb = new CircuitBreaker({ consecutiveThreshold: 2, baseCooldownMs: 60_000 });
    const health = new HealthRegistry();
    const router = new Router({ breakers: cb, health });
    const a1 = fakeAdapter({ id: 'prv1', name: 'down' });
    const a2 = fakeAdapter({ id: 'prv2', name: 'up' });
    // نفتح دائرة prv1 يدوياً
    cb.recordFailure('prv1:model-x');
    cb.recordFailure('prv1:model-x');
    expect(cb.stateOf('prv1:model-x')).toBe('open');

    const route = router.route({
      strategy: 'priority-failover',
      tiers: [[candidate(a1), candidate(a2)]],
      messages: [{ role: 'user', content: 'مرحبا' }],
    });
    const { outcome } = await collect(route);
    expect(outcome.providerId).toBe('prv2');
    expect(outcome.attempts).toBe(1);
  });

  it('smart-auto يختار المرشح الأسرع', async () => {
    const cb = new CircuitBreaker();
    const health = new HealthRegistry();
    const router = new Router({ breakers: cb, health });
    const slow = fakeAdapter({ id: 'slow', name: 'slow', latencyMs: 50 });
    const fast = fakeAdapter({ id: 'fast', name: 'fast', latencyMs: 1 });
    // نغذي سجل الصحة بمعلومات مسبقة
    health.recordPulse('slow', true, 300);
    health.recordPulse('fast', true, 30);
    const route = router.route({
      strategy: 'smart-auto',
      tiers: [[candidate(slow), candidate(fast)]],
      messages: [{ role: 'user', content: 'مرحبا' }],
    });
    const { outcome } = await collect(route);
    expect(outcome.providerId).toBe('fast');
  });

  it('يعيد خطأ واضحاً عند فشل كل البدائل', async () => {
    const cb = new CircuitBreaker({ consecutiveThreshold: 10 });
    const health = new HealthRegistry();
    const router = new Router({ breakers: cb, health });
    const a1 = fakeAdapter({ id: 'prv1', name: 'bad1', fail: true });
    const route = router.route({
      strategy: 'priority-failover',
      tiers: [[candidate(a1)]],
      messages: [{ role: 'user', content: 'مرحبا' }],
    });
    let errorText = '';
    for await (const c of route.chunks) {
      if (c.type === 'error') errorText = c.message;
    }
    const outcome = await route.finalize();
    expect(outcome.success).toBe(false);
    expect(errorText).toContain('تعذر');
  });

  it('MockAdapter يبث رداً عربياً عن الشحن', async () => {
    const mock = new MockAdapter({ id: 'prv_mock', name: 'Mock', wordsPerMin: 6000 });
    let text = '';
    for await (const c of mock.chat({
      model: 'mock/elshawwa-assistant',
      messages: [{ role: 'user', content: 'إيه سياسة الشحن عندكم؟' }],
      maxTokens: 500,
      temperature: 0.4,
    })) {
      if (c.type === 'delta') text += c.text;
    }
    expect(text).toContain('شحن');
  });
});
