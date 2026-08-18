/**
 * محرك التوجيه (Router) — قلب المنصة:
 * - استراتيجيات: priority-failover | weighted-round-robin | least-latency | cheapest-first | smart-auto
 * - فحص دوائر الكسر + سجل الصحة قبل كل محاولة
 * - سلاسل بدائل (Fallback Chains): أفقي داخل الطبقة، ثم طبقات تصعيدية
 * - مهلات لكل محاولة + تسجيل النتيجة النهائية للعدادات
 */
import type { ChatMessageLite, RoutingStrategy } from '@cbd/shared';
import type { Candidate, ChatChunk, FinalOutcome, RouteResult } from './types.js';
import { CircuitBreaker } from './circuit-breaker.js';
import { HealthRegistry } from './health.js';

export interface RouterOptions {
  breakers: CircuitBreaker;
  health: HealthRegistry;
  defaultTimeoutMs?: number;   // مهلة المحاولة الواحدة (الطبقة الأولى)
  onUsage?: (outcome: FinalOutcome) => void;
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class Router {
  private readonly breakers: CircuitBreaker;
  private readonly health: HealthRegistry;
  private readonly defaultTimeoutMs: number;
  private readonly onUsage?: (o: FinalOutcome) => void;
  private rrCounter = new Map<string, number>();

  constructor(opts: RouterOptions) {
    this.breakers = opts.breakers;
    this.health = opts.health;
    this.defaultTimeoutMs = opts.defaultTimeoutMs ?? 25_000;
    this.onUsage = opts.onUsage;
  }

  route(req: { strategy: RoutingStrategy; tiers: Candidate[][]; messages: ChatMessageLite[] }): RouteResult {
    const outcome: FinalOutcome = {
      providerId: '',
      model: '',
      success: false,
      fallbackUsed: false,
      attempts: 0,
      inputTokens: 0,
      outputTokens: 0,
      latencyMs: 0,
      costUsd: 0,
    };

    const startedAt = Date.now();

    const orderTier = (tier: Candidate[]): Candidate[] => {
      switch (req.strategy) {
        case 'priority-failover':
          return [...tier];
        case 'weighted-round-robin': {
          const key = tier.map((c) => c.model).join('|');
          const counter = this.rrCounter.get(key) ?? 0;
          this.rrCounter.set(key, counter + 1);
          const totalWeight = tier.reduce((a, c) => a + Math.max(1, c.weight), 0);
          let pointer = counter % totalWeight;
          const order: Candidate[] = [];
          const pool = [...tier];
          while (pool.length) {
            let acc = 0;
            let chosenIdx = 0;
            for (let i = 0; i < pool.length; i++) {
              const c = pool[i]!;
              acc += Math.max(1, c.weight);
              if (pointer < acc) {
                chosenIdx = i;
                break;
              }
            }
            const chosen = pool.splice(chosenIdx, 1)[0]!;
            order.push(chosen);
            pointer = (pointer + Math.max(1, chosen.weight)) % Math.max(1, totalWeight);
          }
          return order;
        }
        case 'least-latency':
          return [...tier].sort((a, b) => {
            const la = this.health.get(a.providerId).ewmaLatencyMs ?? Number.MAX_SAFE_INTEGER;
            const lb = this.health.get(b.providerId).ewmaLatencyMs ?? Number.MAX_SAFE_INTEGER;
            return la - lb;
          });
        case 'cheapest-first':
          return [...tier].sort((a, b) => a.costPer1MOut - b.costPer1MOut || a.costPer1MIn - b.costPer1MIn);
        case 'smart-auto': {
          const score = (c: Candidate): number => {
            const h = this.health.get(c.providerId);
            const healthScore = h.successRate == null ? 0.5 : h.successRate;
            const latencyScore = h.ewmaLatencyMs == null ? 0.5 : Math.max(0, 1 - h.ewmaLatencyMs / 10_000);
            const costScore = c.free ? 1 : Math.max(0, 1 - (c.costPer1MIn + c.costPer1MOut) / 20);
            const quotaScore = h.quotaRemaining == null ? 0.6 : Math.max(0, Math.min(1, h.quotaRemaining));
            return 0.4 * healthScore + 0.25 * latencyScore + 0.2 * costScore + 0.15 * quotaScore;
          };
          return [...tier].sort((a, b) => score(b) - score(a));
        }
      }
    };

    let chosenCosts: { costPer1MIn: number; costPer1MOut: number } | null = null;

    const chunks = (async function* (this: Router): AsyncIterable<ChatChunk> {
      let lastError = 'لا يوجد مزود متاح لهذا البوت';

      for (let tierIndex = 0; tierIndex < req.tiers.length; tierIndex++) {
        const tierRaw = req.tiers[tierIndex]!;
        const ordered = orderTier(tierRaw);

        for (const candidate of ordered) {
          const breakerKey = `${candidate.providerId}:${candidate.model}`;
          if (!this.breakers.allow(breakerKey)) continue;

          // مهلة المحاولة: الطبقة الأولى كاملة، وما بعدها أسرع (تدرج التصعيد)
          const timeoutMs = tierIndex === 0 ? this.defaultTimeoutMs : Math.max(8_000, this.defaultTimeoutMs * 0.7);
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), timeoutMs);

          outcome.attempts++;
          outcome.providerId = candidate.providerId;
          outcome.model = candidate.model;
          outcome.fallbackUsed = outcome.attempts > 1;
          const attemptStart = Date.now();
          let streamOk = false;
          let aborted = false;

          try {
            for await (const chunk of candidate.adapter.chat({
              model: candidate.model,
              messages: req.messages,
              maxTokens: candidate.maxTokens,
              temperature: candidate.temperature,
              signal: controller.signal,
            })) {
              if (chunk.type === 'error') {
                lastError = `${candidate.adapter.name}: ${chunk.message}`;
                aborted = chunk.code === 'timeout' || chunk.code === 'rate_limited';
                // 429 لا يُفتح الدائرة بالكامل — يُعامل كإشارة إشباع فقط
                if (!aborted) this.breakers.recordFailure(breakerKey);
                this.health.recordPulse(candidate.providerId, false, 0);
                continue;
              }
              if (!streamOk) {
                streamOk = true;
                this.breakers.recordSuccess(breakerKey);
              }
              if (chunk.type === 'done') {
                outcome.inputTokens = chunk.usage?.input ?? outcome.inputTokens;
                outcome.outputTokens = chunk.usage?.output ?? outcome.outputTokens;
                this.health.recordPulse(candidate.providerId, true, Date.now() - attemptStart);
              }
              yield chunk;
            }
            if (streamOk) {
              outcome.success = true;
              chosenCosts = {
                costPer1MIn: candidate.costPer1MIn,
                costPer1MOut: candidate.costPer1MOut,
              };
              break;
            }
          } finally {
            clearTimeout(timer);
          }
          if (outcome.success) break;
          // مهلة محاولة صامتة → فشل
          if (aborted) {
            this.breakers.recordFailure(breakerKey);
            lastError = `${candidate.adapter.name}: timeout`;
          }
        }
        if (outcome.success) break;
      }

      if (!outcome.success) {
        yield { type: 'error', message: `تعذر الوصول لأي مزود: ${lastError}`, code: 'all_failed' };
      }
    }).call(this);

    return {
      chunks,
      finalize: async () => {
        outcome.latencyMs = Date.now() - startedAt;
        if (outcome.success && chosenCosts) {
          outcome.costUsd =
            (outcome.inputTokens / 1_000_000) * chosenCosts.costPer1MIn +
            (outcome.outputTokens / 1_000_000) * chosenCosts.costPer1MOut;
        }
        this.onUsage?.(outcome);
        return outcome;
      },
    };
  }

  /** فحص صحي سريع لمرشح — يستخدمه قسم النبضات */
  async probe(candidate: Candidate): Promise<{ ok: boolean; latencyMs: number }> {
    const start = Date.now();
    try {
      const health = await candidate.adapter.ping();
      return { ok: health.ok, latencyMs: Date.now() - start };
    } catch {
      return { ok: false, latencyMs: Date.now() - start };
    }
  }
}

export { CircuitBreaker, HealthRegistry };
export type { Candidate, ChatChunk, FinalOutcome, RouteResult };
