/**
 * نقطة تشغيل العامل الخلفي كعملية مستقلة (الإنتاج):
 * node dist/worker-main.js
 * — النبضات وDead-Man Switch والتنظيف تعمل حتى بدون عملية الـ API.
 */
import 'reflect-metadata';
import { migrate } from '@cbd/db';
import { CircuitBreaker, HealthRegistry } from '@cbd/gateway';
import { startWorkerAll } from '@cbd/worker-core';
import { decryptSecret } from './crypto.js';
import { config } from './config.js';
import { WebhooksService } from './webhooks.service.js';

migrate();

// معالج Webhooks الصادرة — يعمل هنا أيضاً في الوضع المستقل (ادّعاء متفائل يمنع التكرار)
new WebhooksService().startPolling();

const breakers = new CircuitBreaker({
  baseCooldownMs: 15_000,
  maxCooldownMs: 120_000,
  onStateChange: (key, state) => console.log(`🔌 Circuit ${key} → ${state}`),
});
const health = new HealthRegistry();

const runtime = startWorkerAll({
  intervalMs: config.HEARTBEAT_INTERVAL_MS,
  retentionDays: config.RETENTION_DAYS,
  decrypt: (enc: string) => decryptSecret(enc),
  health,
  breakers,
  targets: {
    telegram: config.TELEGRAM_BOT_TOKEN
      ? { botToken: config.TELEGRAM_BOT_TOKEN, chatId: config.TELEGRAM_CHAT_ID }
      : undefined,
  },
});

console.log('👷 Chat Bot Dev Worker يعمل (نبضات + Dead-Man Switch + تنظيف)');
const shutdown = () => {
  runtime.stop();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
