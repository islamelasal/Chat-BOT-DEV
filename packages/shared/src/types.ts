/**
 * @cbd/shared — عقود الأنواع المشتركة بين كل طبقات المنصة
 * (اللوحة + الـ API + العامل + الودجت) — مصدر الحقيقة الوحيد للعقود.
 */

// ─────────────────────────────── الهوية والثيم ───────────────────────────────

export type WidgetPosition = 'bottom-left' | 'bottom-right';
export type BubbleStyle = 'circle' | 'pill';
export type WindowMode = 'docked' | 'fullscreen';

export interface ThemeConfig {
  primary: string;        // اللون الرئيسي
  secondary: string;      // لون التمييز
  background: string;     // خلفية المحادثة
  bubbleText: string;     // نص الفقاعة
  headerText: string;     // لون نص رأس المحادثة
  font: string;           // اسم الخط
  position: WidgetPosition;
  bubbleStyle: BubbleStyle;
  windowMode: WindowMode;
  welcomeTitle: string;   // عنوان الترحيب
  welcomeText: string;    // نص الترحيب
  suggestions: string[];  // اقتراحات سريعة
  showBrand: boolean;
  logoUrl: string | null;
  poweredBy: boolean;     // "مدعوم من Chat Bot Dev"
}

export interface BrandKit {
  logoUrl: string | null;
  colors: {
    primary: string;
    secondary: string;
    accent: string;
  };
  font: string;
}

// ─────────────────────────────── العملاء والبوتات ───────────────────────────────

export type ClientPlan = 'free' | 'starter' | 'pro' | 'enterprise';
export type ClientStatus = 'active' | 'suspended' | 'trial';

export interface Client {
  id: string;
  name: string;
  siteUrl: string;
  email: string;
  phone: string | null;
  plan: ClientPlan;
  status: ClientStatus;
  brand: BrandKit;
  domains: string[];            // allowlist — البوت يعمل عليها فقط
  monthlyMsgLimit: number;
  dailyMsgLimit: number;
  createdAt: number;
}

export interface Bot {
  id: string;
  clientId: string;
  name: string;
  description: string;
  persona: string;              // System Prompt
  language: 'ar' | 'en' | 'both';
  maxReplyLength: number;
  forbiddenTopics: string[];
  knowledgeChunks: KnowledgeChunk[];
  routing: RoutingPolicy;
  active: boolean;
  createdAt: number;
}

export interface KnowledgeChunk {
  id: string;
  title: string;
  content: string;
  source: string;               // ملف/رابط/نص
}

// ─────────────────────────────── المزودون والنماذج ───────────────────────────────

export type ProviderKind = 'openai-compatible' | 'gemini-native' | 'mock';

export interface Provider {
  id: string;
  name: string;
  kind: ProviderKind;
  baseUrl: string;
  apiKey: string;               // مشفر عند التخزين
  enabled: boolean;
  tier: 'free' | 'paid';
  limits: { rpm: number; tpm: number; dailyTokens: number } | null;
  createdAt: number;
}

export interface ModelInfo {
  id: string;
  providerId: string;
  name: string;                 // الاسم الكامل لدى المزود
  contextWindow: number;
  costPer1MIn: number;          // USD
  costPer1MOut: number;
  free: boolean;
  enabled: boolean;
}

// ─────────────────────────────── التوجيه ───────────────────────────────

export type RoutingStrategy =
  | 'priority-failover'
  | 'weighted-round-robin'
  | 'least-latency'
  | 'cheapest-first'
  | 'smart-auto';

export interface RoutingTier {
  model: string;                // اسم النموذج لدى المزود
  providerIds: string[];        // مرشحون لنفس النموذج (fallback أفقي)
  weight: number;
  maxTokens: number;
  temperature: number;
}

export interface RoutingPolicy {
  strategy: RoutingStrategy;
  tiers: RoutingTier[];         // مرتبة — الأعلى أولوية
}

// ─────────────────────────────── المحادثة والعدادات ───────────────────────────────

export type ChatRole = 'user' | 'assistant' | 'system';

export interface ChatMessageLite {
  role: ChatRole;
  content: string;
}

export interface PageContext {
  path: string;
  title: string;
  lang: string;
}

export interface UsageEvent {
  id: string;
  clientId: string;
  botId: string;
  providerId: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
  status: 'ok' | 'error' | 'fallback' | 'rate_limited';
  costUsd: number;
  createdAt: number;            // epoch ms
}

export interface Conversation {
  id: string;
  clientId: string;
  botId: string;
  visitorId: string;
  pagePath: string | null;
  messages: Array<{
    id: string;
    role: ChatRole;
    content: string;
    feedback: 'up' | 'down' | null;
    createdAt: number;
  }>;
  createdAt: number;
  updatedAt: number;
}

// ─────────────────────────────── النبضات والحالة ───────────────────────────────

export type CircuitState = 'closed' | 'open' | 'half_open';

export interface CircuitStatus {
  key: string;                  // providerId:model
  state: CircuitState;
  failures: number;
  openedAt: number | null;
  retryAt: number | null;
}

export interface HeartbeatRecord {
  id: string;
  providerId: string;
  ok: boolean;
  latencyMs: number;
  message: string;
  at: number;
}

export interface ProviderHealth {
  providerId: string;
  providerName: string;
  lastPulse: number | null;
  ok: boolean | null;
  ewmaLatencyMs: number | null;
  successRate: number | null;
  quotaRemaining: number | null; // 0..1
  circuitStates: CircuitStatus[];
}
