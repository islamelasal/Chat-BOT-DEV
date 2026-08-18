import { z } from 'zod';

/** مخططات التحقق من المدخلات — تُستخدم في الـ API واللوحة معاً */

export const loginSchema = z.object({
  email: z.string().email().max(190),
  password: z.string().min(8).max(128),
});

export const clientCreateSchema = z.object({
  name: z.string().min(2).max(120),
  siteUrl: z.string().url(),
  email: z.string().email(),
  phone: z.string().max(30).optional().nullable(),
  plan: z.enum(['free', 'starter', 'pro', 'enterprise']).default('free'),
  domains: z.array(z.string().min(4)).default([]),
  monthlyMsgLimit: z.number().int().min(100).default(5000),
  dailyMsgLimit: z.number().int().min(10).default(300),
});

export const clientUpdateSchema = clientCreateSchema.partial().extend({
  status: z.enum(['active', 'suspended', 'trial']).optional(),
});

export const brandUpdateSchema = z.object({
  logoUrl: z.string().url().nullable().optional(),
  colors: z.object({
    primary: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    secondary: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    accent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  }),
  font: z.string().max(60),
});

export const themeUpdateSchema = z.object({
  primary: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  secondary: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  bubbleText: z.string().max(90),
  headerText: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  font: z.string().max(60),
  position: z.enum(['bottom-left', 'bottom-right']),
  bubbleStyle: z.enum(['circle', 'pill']),
  windowMode: z.enum(['docked', 'fullscreen']),
  welcomeTitle: z.string().max(120),
  welcomeText: z.string().max(500),
  suggestions: z.array(z.string().max(120)).max(6),
  showBrand: z.boolean(),
  logoUrl: z.string().url().nullable(),
  poweredBy: z.boolean(),
});

export const botCreateSchema = z.object({
  clientId: z.string().min(3),
  name: z.string().min(2).max(120),
  description: z.string().max(500).default(''),
  persona: z.string().min(10).max(8000),
  language: z.enum(['ar', 'en', 'both']).default('ar'),
  maxReplyLength: z.number().int().min(100).max(8000).default(1200),
  forbiddenTopics: z.array(z.string().max(100)).default([]),
  active: z.boolean().default(true),
});

export const knowledgeChunkSchema = z.object({
  title: z.string().min(2).max(200),
  content: z.string().min(10).max(20000),
  source: z.string().max(300).default('manual'),
});

export const routingPolicySchema = z.object({
  strategy: z.enum([
    'priority-failover',
    'weighted-round-robin',
    'least-latency',
    'cheapest-first',
    'smart-auto',
  ]),
  tiers: z
    .array(
      z.object({
        model: z.string().min(1).max(200),
        providerIds: z.array(z.string().min(3)).min(1),
        weight: z.number().min(0).max(100).default(1),
        maxTokens: z.number().int().min(50).max(32000).default(1024),
        temperature: z.number().min(0).max(2).default(0.4),
      })
    )
    .min(1)
    .max(6),
});

export const providerCreateSchema = z.object({
  name: z.string().min(2).max(80),
  kind: z.enum(['openai-compatible', 'gemini-native', 'mock']),
  baseUrl: z.string().max(300).default(''),
  apiKey: z.string().max(500).default(''),
  tier: z.enum(['free', 'paid']).default('free'),
  limits: z
    .object({
      rpm: z.number().int().positive().optional(),
      tpm: z.number().int().positive().optional(),
      dailyTokens: z.number().int().positive().optional(),
    })
    .optional()
    .nullable(),
});

export const chatRequestSchema = z.object({
  sessionToken: z.string().min(10),
  message: z.string().min(1).max(4000),
  page: z
    .object({
      path: z.string().max(500).default('/'),
      title: z.string().max(500).default(''),
      lang: z.string().max(10).default('ar'),
    })
    .default({ path: '/', title: '', lang: 'ar' }),
});

export const feedbackSchema = z.object({
  conversationId: z.string().min(3),
  messageId: z.string().min(3),
  feedback: z.enum(['up', 'down']),
});

export const playgroundSchema = z.object({
  botId: z.string().min(3),
  message: z.string().min(1).max(4000),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().max(8000),
      })
    )
    .max(40)
    .default([]),
});
