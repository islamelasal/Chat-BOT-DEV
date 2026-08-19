import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().default('file:./data/cbd.db'),
  REDIS_URL: z.string().optional().default(''),
  JWT_SECRET: z.string().min(16).default('dev-secret-change-me-please-32chars!!'),
  ENCRYPTION_KEY: z.string().min(16).default('dev-enc-key-32-chars-change-me!!'),
  SEED_DEMO: z.coerce.boolean().default(true),
  WORKER_IN_PROCESS: z.coerce.boolean().default(true),
  DEMO_MODE: z.coerce.boolean().default(true),
  RETENTION_DAYS: z.coerce.number().default(90),
  HEARTBEAT_INTERVAL_MS: z.coerce.number().default(30000),
  TELEGRAM_BOT_TOKEN: z.string().optional().default(''),
  TELEGRAM_CHAT_ID: z.string().optional().default(''),
  SMTP_URL: z.string().optional().default(''),
  ALERT_EMAIL: z.string().optional().default(''),
  CORS_ORIGINS: z.string().optional().default(''),
  // حدود المعدل — منخفضة بما يكفي لمنع الإساءة، متسامحة مع CGNAT (IP مشترك في مصر)
  RATE_LIMIT_PER_IP_MIN: z.coerce.number().default(60),
  RATE_LIMIT_PER_SESSION_MIN: z.coerce.number().default(12),
  RATE_LIMIT_PER_CLIENT_HOUR: z.coerce.number().default(1000),
  RATE_LIMIT_DISABLED: z.coerce.boolean().default(false),
  // زاحف Scrapling الجانبي (تجاوز Cloudflare) — فارغ = استخدام الزاحف المدمج فقط
  SCRAPLING_URL: z.string().optional().default(''),
  // SSRF: السماح بزحف العناوين الخاصة (true في الديمو للاختبار المحلي — false في الإنتاج)
  CRAWL_ALLOW_PRIVATE: z.coerce.boolean().default(true),
  // مزامنة كتالوجات العملاء (الفيد الحي) — كل 6 ساعات + مزامنة أولى عند الإقلاع
  CATALOG_SYNC_INTERVAL_MS: z.coerce.number().default(21600000),
  CATALOG_SYNC_ON_BOOT: z.coerce.boolean().default(true),
  // مفتاح OpenRouter (اختياري — يُثبَّت مشفراً في المزود عند الإقلاع إن لم يكن مثبتاً)
  OPENROUTER_API_KEY: z.string().optional().default(''),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('❌ إعدادات بيئة غير صالحة:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;

export const isDemo = config.DEMO_MODE;
