/**
 * محوّل Google Gemini Native — واجهة Gemini الأصلية ليست OpenAI-compatible
 * فلها محوّل خاص (generativelanguage.googleapis.com).
 */
import type { ChatChunk, ChatParams, HealthInfo, ProviderAdapter } from '../types.js';

interface AdapterOptions {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
}

export class GeminiAdapter implements ProviderAdapter {
  readonly id: string;
  readonly name: string;
  readonly kind = 'gemini-native' as const;
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(opts: AdapterOptions) {
    this.id = opts.id;
    this.name = opts.name;
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '');
    this.apiKey = opts.apiKey;
  }

  async *chat(params: ChatParams): AsyncIterable<ChatChunk> {
    if (!this.apiKey) {
      yield { type: 'error', message: 'مفتاح API غير مضبوط لهذا المزود', code: 'no_api_key' };
      return;
    }
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    params.signal?.addEventListener('abort', onAbort, { once: true });
    try {
      const systemParts = params.messages.filter((m) => m.role === 'system').map((m) => ({ text: m.content }));
      const contents = params.messages
        .filter((m) => m.role !== 'system')
        .map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));

      const res = await fetch(
        `${this.baseUrl}/models/${params.model}:streamGenerateContent?alt=sse&key=${this.apiKey}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            contents,
            systemInstruction: systemParts.length ? { parts: systemParts } : undefined,
            generationConfig: {
              maxOutputTokens: params.maxTokens,
              temperature: params.temperature,
            },
          }),
          signal: controller.signal,
        }
      );

      if (!res.ok || !res.body) {
        const body = await res.text().catch(() => '');
        yield { type: 'error', message: `HTTP ${res.status}: ${body.slice(0, 200)}`, code: res.status === 429 ? 'rate_limited' : 'http_error' };
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
          try {
            const json = JSON.parse(data);
            const text: string | undefined = json.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('');
            if (text) {
              output += text.length;
              yield { type: 'delta', text };
            }
            if (json.usageMetadata) {
              input = json.usageMetadata.promptTokenCount ?? input;
              output = json.usageMetadata.candidatesTokenCount ?? output;
            }
          } catch {
            /* تجاهل */
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
    if (!this.apiKey) {
      return { ok: false, latencyMs: 0, message: 'مفتاح API غير مضبوط', quota: { remaining: null, limit: null, resetAt: null } };
    }
    try {
      const res = await fetch(`${this.baseUrl}/models?key=${this.apiKey}`, {
        signal: AbortSignal.timeout(8000),
      });
      return {
        ok: res.ok,
        latencyMs: Date.now() - start,
        message: res.ok ? 'OK' : `HTTP ${res.status}`,
        quota: { remaining: null, limit: null, resetAt: null },
      };
    } catch (err) {
      return { ok: false, latencyMs: Date.now() - start, message: (err as Error).message, quota: { remaining: null, limit: null, resetAt: null } };
    }
  }

  async listModels(): Promise<string[]> {
    if (!this.apiKey) return [];
    try {
      const res = await fetch(`${this.baseUrl}/models?key=${this.apiKey}`, {
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return [];
      const json = (await res.json()) as { models?: Array<{ name: string }> };
      return (json.models ?? []).map((m) => m.name.replace(/^models\//, ''));
    } catch {
      return [];
    }
  }
}
