/**
 * محوّل OpenAI-Compatible — يغطي ~90% من المزودين (OpenRouter, Groq, DeepSeek,
 * Together, NVIDIA, Mistral, Cerebras, DMXAPI, AIMLAPI, SiliconFlow, SambaNova...)
 * أي مزود = صف بيانات (baseUrl + key) بدون كود جديد.
 */
import type { ChatChunk, ChatParams, HealthInfo, ProviderAdapter } from '../types.js';

interface AdapterOptions {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
}

export class OpenAICompatibleAdapter implements ProviderAdapter {
  readonly id: string;
  readonly name: string;
  readonly kind = 'openai-compatible' as const;
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(opts: AdapterOptions) {
    this.id = opts.id;
    this.name = opts.name;
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '');
    this.apiKey = opts.apiKey;
  }

  private get hasKey(): boolean {
    return this.apiKey.length > 0;
  }

  async *chat(params: ChatParams): AsyncIterable<ChatChunk> {
    if (!this.hasKey) {
      yield { type: 'error', message: 'مفتاح API غير مضبوط لهذا المزود', code: 'no_api_key' };
      return;
    }
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    params.signal?.addEventListener('abort', onAbort, { once: true });
    try {
      const res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: params.model,
          messages: params.messages,
          max_tokens: params.maxTokens,
          temperature: params.temperature,
          stream: true,
        }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const body = await res.text().catch(() => '');
        yield {
          type: 'error',
          message: `HTTP ${res.status}: ${body.slice(0, 200)}`,
          code: res.status === 429 ? 'rate_limited' : res.status >= 500 ? 'server_error' : 'http_error',
        };
        return;
      }

      let input = 0;
      let output = 0;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (!line.startsWith('data:')) continue;
          const data = line.slice(5).trim();
          if (data === '[DONE]') {
            yield { type: 'done', usage: { input, output } };
            return;
          }
          try {
            const json = JSON.parse(data);
            const delta: string | undefined = json.choices?.[0]?.delta?.content;
            if (delta) {
              output += delta.length;
              yield { type: 'delta', text: delta };
            }
            if (json.usage) {
              input = json.usage.prompt_tokens ?? input;
              output = json.usage.completion_tokens ?? output;
            }
          } catch {
            /* تجاهل أسطر غير صالحة */
          }
        }
      }
      yield { type: 'done', usage: { input, output } };
    } catch (err) {
      const aborted = (err as Error)?.name === 'AbortError';
      yield {
        type: 'error',
        message: aborted ? 'انتهت مهلة الطلب' : `فشل الاتصال: ${(err as Error).message}`,
        code: aborted ? 'timeout' : 'network_error',
      };
    } finally {
      params.signal?.removeEventListener('abort', onAbort);
    }
  }

  async ping(): Promise<HealthInfo> {
    const start = Date.now();
    if (!this.hasKey) {
      return { ok: false, latencyMs: 0, message: 'مفتاح API غير مضبوط', quota: { remaining: null, limit: null, resetAt: null } };
    }
    try {
      const res = await fetch(`${this.baseUrl}/models`, {
        headers: { authorization: `Bearer ${this.apiKey}` },
        signal: AbortSignal.timeout(8000),
      });
      const quota = parseQuota(res.headers);
      return {
        ok: res.ok,
        latencyMs: Date.now() - start,
        message: res.ok ? 'OK' : `HTTP ${res.status}`,
        quota,
      };
    } catch (err) {
      return { ok: false, latencyMs: Date.now() - start, message: (err as Error).message, quota: { remaining: null, limit: null, resetAt: null } };
    }
  }

  async listModels(): Promise<string[]> {
    if (!this.hasKey) return [];
    try {
      const res = await fetch(`${this.baseUrl}/models`, {
        headers: { authorization: `Bearer ${this.apiKey}` },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return [];
      const json = (await res.json()) as { data?: Array<{ id: string }> };
      return (json.data ?? []).map((m) => m.id);
    } catch {
      return [];
    }
  }
}

/** قراءة حدود الاستخدام من ترويسات x-ratelimit-* */
export function parseQuota(headers: Headers): HealthInfo['quota'] {
  const remaining = headers.get('x-ratelimit-remaining');
  const limit = headers.get('x-ratelimit-limit');
  const reset = headers.get('x-ratelimit-reset');
  return {
    remaining: remaining != null ? Number(remaining) : null,
    limit: limit != null ? Number(limit) : null,
    resetAt: reset != null ? Number(reset) * 1000 : null,
  };
}
