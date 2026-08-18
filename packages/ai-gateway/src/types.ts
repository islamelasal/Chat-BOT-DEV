/**
 * @cbd/gateway — أنواع بوابة الذكاء الاصطناعي
 */
import type { ChatMessageLite } from '@cbd/shared';

export interface ChatParams {
  model: string;
  messages: ChatMessageLite[];
  maxTokens: number;
  temperature: number;
  signal?: AbortSignal;
}

export type ChatChunk =
  | { type: 'delta'; text: string }
  | { type: 'done'; usage: { input: number; output: number } | null }
  | { type: 'error'; message: string; code?: string };

export interface HealthInfo {
  ok: boolean;
  latencyMs: number;
  message: string;
  quota: { remaining: number | null; limit: number | null; resetAt: number | null };
}

export interface ProviderAdapter {
  readonly id: string;          // معرف المزود في DB
  readonly name: string;
  readonly kind: 'openai-compatible' | 'gemini-native' | 'mock';
  chat(params: ChatParams): AsyncIterable<ChatChunk>;
  ping(): Promise<HealthInfo>;
  listModels(): Promise<string[]>;
}

export interface Candidate {
  adapter: ProviderAdapter;
  providerId: string;
  model: string;
  tier: number;                 // ترتيب الطبقة في السياسة
  weight: number;
  maxTokens: number;
  temperature: number;
  costPer1MIn: number;
  costPer1MOut: number;
  free: boolean;
}

export interface RouteResult {
  chunks: AsyncIterable<ChatChunk>;
  /** يُستدعى عند نهاية البث لتسجيل النتيجة النهائية */
  finalize(): Promise<FinalOutcome>;
}

export interface FinalOutcome {
  providerId: string;
  model: string;
  success: boolean;
  fallbackUsed: boolean;
  attempts: number;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  costUsd: number;
  error?: string;
}
