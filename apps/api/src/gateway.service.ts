/**
 * GatewayService — يربط قاعدة البيانات (مزودون/نماذج/سياسات) بمحرك @cbd/gateway.
 * - بناء المحوّلات من صفوف DB (فك تشفير المفاتيح هنا فقط)
 * - تجميع نظام الرسائل: الشخصية + سياق الصفحة + استرجاع معرفة (RAG خفيف)
 * - تشغيل الراوتر وتسجيل العدادات عند الانتهاء
 */
import { Injectable } from '@nestjs/common';
import { db, json, recordUsage, id, now } from '@cbd/db';
import {
  CircuitBreaker,
  HealthRegistry,
  GeminiAdapter,
  MockAdapter,
  OpenAICompatibleAdapter,
  Router,
} from '@cbd/gateway';
import type { Bot, ChatMessageLite, PageContext, RoutingPolicy, RoutingTier } from '@cbd/shared';
import type { Candidate, FinalOutcome } from '@cbd/gateway';
import { decryptSecret } from './crypto.js';

export interface ChatContext {
  bot: Bot;
  clientId: string;
  history: ChatMessageLite[];
  page?: PageContext;
  signal?: AbortSignal;
}

export interface ChatStreamResult {
  stream: AsyncIterable<{ type: 'delta' | 'done' | 'error'; text?: string; message?: string }>;
  finalize(): Promise<FinalOutcome>;
}

@Injectable()
export class GatewayService {
  /** حالة مشتركة لكل العملية — النبضات تسجل فيها وهي نفسها التي يقرأها الراوتر */
  readonly breakers = new CircuitBreaker({
    baseCooldownMs: 15_000,
    maxCooldownMs: 120_000,
    onStateChange: (key, state) => console.log(`🔌 Circuit ${key} → ${state}`),
  });
  readonly health = new HealthRegistry();
  private readonly router = new Router({
    breakers: this.breakers,
    health: this.health,
    defaultTimeoutMs: 25_000,
  });

  /** بناء محوّل من صف مزود (المفتاح يُفك هنا فقط ولا يغادر العملية) */
  buildAdapter(row: { id: string; name: string; kind: string; base_url: string; api_key_enc: string }) {
    const apiKey = decryptSecret(String(row.api_key_enc ?? ''));
    switch (row.kind) {
      case 'mock':
        return new MockAdapter({ id: row.id, name: row.name });
      case 'gemini-native':
        return new GeminiAdapter({ id: row.id, name: row.name, baseUrl: String(row.base_url), apiKey });
      default:
        return new OpenAICompatibleAdapter({
          id: row.id,
          name: row.name,
          baseUrl: String(row.base_url),
          apiKey,
        });
    }
  }

  /** مرشحو التنفيذ من سياسة توجيه — كل طبقة = مجموعة مرشحين أفقيين */
  async buildCandidates(policy: RoutingPolicy): Promise<Candidate[][]> {
    const tiers: Candidate[][] = [];
    for (let tierIndex = 0; tierIndex < policy.tiers.length; tierIndex++) {
      const tier = policy.tiers[tierIndex]!;
      const candidates: Candidate[] = [];
      for (const providerId of tier.providerIds) {
        const p = (await db.get('SELECT * FROM providers WHERE id = ? AND enabled = 1', providerId)) as any;
        if (!p) continue;
        const m = (await db.get('SELECT * FROM models WHERE provider_id = ? AND name = ?', providerId, tier.model)) as any;
        const adapter = this.buildAdapter(p);
        candidates.push({
          adapter,
          providerId,
          model: tier.model,
          tier: tierIndex,
          weight: tier.weight,
          maxTokens: tier.maxTokens,
          temperature: tier.temperature,
          costPer1MIn: Number(m?.cost_in ?? 0),
          costPer1MOut: Number(m?.cost_out ?? 0),
          free: m ? Number(m.free) === 1 : true,
        });
      }
      if (candidates.length) tiers.push(candidates);
    }
    return tiers;
  }

  /** استرجاع معرفة خفيف: أهم 3 أجزاء تطابق كلمات الرسالة (RAG-lite قبل pgvector) */
  private async retrieveKnowledge(botId: string, query: string, limit = 3): Promise<string[]> {
    const chunks = await db.all('SELECT * FROM knowledge_chunks WHERE bot_id = ?', botId) as any[];
    if (!chunks.length) return [];
    const words = query
      .toLowerCase()
      .split(/[\s،,؟?]+/)
      .filter((w) => w.length > 2);
    const scored = chunks
      .map((c) => {
        const hay = `${c.title} ${c.content}`.toLowerCase();
        const score = words.reduce((acc, w) => acc + (hay.includes(w) ? 1 : 0), 0);
        return { c, score };
      })
      .sort((a, b) => b.score - a.score);
    const best = scored.filter((s) => s.score > 0).slice(0, limit);
    if (!best.length && scored[0]) best.push(scored[0]); // سياق عام إذا لم يوجد تطابق
    return best.map((s) => `【${s.c.title}】\n${s.c.content}`.slice(0, 900));
  }

  /** تجميع الرسائل: النظام (شخصية+معرفة+سياق صفحة+قواعد أمان) ثم التاريخ ثم الرسالة */
  async buildMessages(ctx: ChatContext, userMessage: string): Promise<ChatMessageLite[]> {
    const knowledge = await this.retrieveKnowledge(ctx.bot.id, userMessage);
    const page = ctx.page;
    const systemParts = [
      ctx.bot.persona,
      page
        ? `الزائر الآن في صفحة: ${page.title || ''} (${page.path}) — اجعل ردك مناسباً لهذه الصفحة تحديداً.`
        : '',
      knowledge.length
        ? `معلومات موثوقة من قاعدة معرفة المتجر — استخدمها في إجابتك:\n${knowledge.join('\n\n')}`
        : '',
      `حد أقصى للرد: ${ctx.bot.maxReplyLength} حرف تقريباً.`,
      'لا تذكر أنك نموذج لغوي أو أن لديك قواعد معرفة — أنت موظف المتجر.',
    ].filter(Boolean);

    const forbidden = json<string[]>(null, []);
    if (ctx.bot.forbiddenTopics?.length) {
      systemParts.push(`ممنوع مناقشة: ${ctx.bot.forbiddenTopics.join('، ')} — اعتذر بلطف إن طُلب ذلك.`);
    }

    return [
      { role: 'system', content: systemParts.join('\n\n---\n\n') },
      ...ctx.history.slice(-16),
      { role: 'user', content: userMessage },
    ];
  }

  /** تشغيل محادثة كاملة عبر محرك التوجيه + تسجيل العدادات */
  async chat(ctx: ChatContext, userMessage: string): Promise<ChatStreamResult> {
    const policy = json<RoutingPolicy>(ctx.bot.routing as any, {
      strategy: 'priority-failover',
      tiers: [],
    } as RoutingPolicy);

    if (!policy.tiers?.length) {
      const fake = (async function* () {
        yield {
          type: 'error' as const,
          message: 'لا توجد سياسة توجيه مضبوطة لهذا البوت — أضف نماذج من قسم البوتات.',
        };
      })();
      return { stream: fake, finalize: async () => ({ providerId: '', model: '', success: false, fallbackUsed: false, attempts: 0, inputTokens: 0, outputTokens: 0, latencyMs: 0, costUsd: 0 }) };
    }

    const tiers = await this.buildCandidates(policy);
    const messages = await this.buildMessages(ctx, userMessage);
    const route = this.router.route({ strategy: policy.strategy, tiers, messages });

    const stream = (async function* () {
      for await (const chunk of route.chunks) {
        if (chunk.type === 'delta') yield { type: 'delta' as const, text: chunk.text };
        else if (chunk.type === 'error') yield { type: 'error' as const, message: chunk.message };
      }
      yield { type: 'done' as const };
    })();

    return {
      stream,
      finalize: async () => {
        const outcome = await route.finalize();
        recordUsage({
          id: id('use'),
          clientId: ctx.clientId,
          botId: ctx.bot.id,
          providerId: outcome.providerId || 'none',
          model: outcome.model || 'none',
          tokensIn: outcome.inputTokens,
          tokensOut: outcome.outputTokens,
          latencyMs: outcome.latencyMs,
          status: outcome.success ? (outcome.fallbackUsed ? 'fallback' : 'ok') : 'error',
          costUsd: outcome.costUsd,
          createdAt: now(),
        });
        return outcome;
      },
    };
  }
}

/** نسخة عامة خفيفة من البوت (من الصف) */
export function botFromRow(r: any): Bot {
  return {
    id: String(r.id),
    clientId: String(r.client_id),
    name: String(r.name),
    description: String(r.description ?? ''),
    persona: String(r.persona),
    language: String(r.language) as Bot['language'],
    maxReplyLength: Number(r.max_reply_len ?? 1200),
    forbiddenTopics: json<string[]>((r as any).forbidden_json, []),
    knowledgeChunks: [],
    routing: json<RoutingPolicy>((r as any).routing_json, { strategy: 'priority-failover', tiers: [] }),
    active: Number((r as any).active) === 1,
    createdAt: Number((r as any).created_at),
  };
}
