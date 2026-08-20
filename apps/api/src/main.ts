import 'dotenv/config'; // تحميل .env من apps/api (مفاتيح المزودين وغيرها)
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import helmet from 'helmet';
import cors from 'cors';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import { migrate, db } from '@cbd/db';
import { seedDemo } from '@cbd/db/seed';
import { ensureKanzBot } from './kanz-install.js';
import { ensureProviderKeys } from './provider-keys.js';
import { startWorkerAll } from '@cbd/worker-core';
import { AppModule } from './app.module.js';
import { config } from './config.js';
import { GatewayService } from './gateway.service.js';

async function bootstrap() {
  // 1) قاعدة البيانات + البذرة
  await migrate();
  if (config.SEED_DEMO) await seedDemo();
  await ensureKanzBot(); // تثبيت/تحديث شخصية كنز الشوا (idempotent)
  await ensureProviderKeys(); // تثبيت مفاتيح المزودين من بيئة التشغيل (مشفرة)

  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
    bodyParser: false, // نتحكم في حدود الحجم بأنفسنا (فيدات كبيرة حتى 64MB)
  });
  // حدود الأجسام: فيدات كتالوج كبيرة + رفع يدوي حتى 64MB
  app.use(express.json({ limit: '64mb' }));
  app.use(express.urlencoded({ extended: true, limit: '64mb' }));

  // 2) حماية الرؤوس + CORS (اللوحة تُدار عبر كعكات httpOnly على نفس النطاق عبر البروكسي)
  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: false, frameguard: false }));
  const expressInstance = app.getHttpAdapter().getInstance() as express.Express;
  expressInstance.set('trust proxy', true); // خلف بروكسي TLS (e2b/Traefik) — لقراءة IP وبروتوكول صحيحين
  const corsOrigins = config.CORS_ORIGINS ? config.CORS_ORIGINS.split(',').map((s) => s.trim()) : true;
  app.use(cors({ origin: corsOrigins, credentials: true }));

  // 3) ملفات ثابتة: محمّل الودجت w.js + حزمة الودجت المبنية
  const publicDir = [
    join(__dirname, 'public'),
    join(process.cwd(), 'public'),
    join(process.cwd(), 'apps/api/src/public'),
    join(process.cwd(), 'src/public'),
  ].find((p) => existsSync(join(p, 'w.js')));
  if (publicDir) {
    app.use('/w.js', express.static(join(publicDir, 'w.js')));
    app.use('/assets', express.static(join(publicDir, 'assets'), { maxAge: '7d' }));
    Logger.log('🟢 محمّل الودجت w.js + الأصول (/assets) جاهزان', 'Widget');
  } else {
    Logger.warn('⚠️ لم يُعثر على w.js — تأكد من وجود public/w.js', 'Widget');
  }
  const widgetDistCandidates = [
    process.env.WIDGET_DIST,
    join(process.cwd(), 'apps/widget/dist'),
    join(process.cwd(), '../widget/dist'),
    join(process.cwd(), '..', '..', 'apps/widget/dist'),
  ].filter((p): p is string => Boolean(p));
  const widgetDist = widgetDistCandidates.find((p) => existsSync(p));
  if (widgetDist) {
    app.use('/w-assets', express.static(widgetDist, { maxAge: '1h' }));
    Logger.log(`📦 ودجت مبني يُخدم من ${widgetDist}`, 'Widget');
  } else {
    Logger.warn('⚠️ لم يُعثر على بناء الودجت (apps/widget/dist) — ابنِ الودجت أولاً', 'Widget');
  }

  // 4) كعكات المصادقة (اللوحة تمررها عبر البروكسي)
  app.use((req: Request, res: Response, next: NextFunction) => {
    const cookie = req.headers.cookie ?? '';
    const parsed: Record<string, string> = {};
    for (const part of cookie.split(';')) {
      const idx = part.indexOf('=');
      if (idx > 0) parsed[part.slice(0, idx).trim()] = part.slice(idx + 1).trim();
    }
    (req as any).cookies = parsed;
    next();
  });

  // 4) العامل 24/7 داخل العملية (التطوير/الديمو) — في الإنتاج يُشغَّل كعملية مستقلة
  let workerRuntime: { stop(): void } | null = null;
  if (config.WORKER_IN_PROCESS) {
    const gateway = app.get(GatewayService);
    workerRuntime = startWorkerAll({
      intervalMs: config.HEARTBEAT_INTERVAL_MS,
      retentionDays: config.RETENTION_DAYS,
      decrypt: (enc: string) => {
        // فك التشفير عبر نفس أداة الـ API
        const { decryptSecret } = require('./crypto.js') as typeof import('./crypto.js');
        return decryptSecret(enc);
      },
      health: gateway.health,
      breakers: gateway.breakers,
      targets: {
        telegram: config.TELEGRAM_BOT_TOKEN
          ? { botToken: config.TELEGRAM_BOT_TOKEN, chatId: config.TELEGRAM_CHAT_ID }
          : undefined,
      },
    });
    Logger.log('👷 العامل الخلفي يعمل داخل العملية (نبضات + Dead-Man Switch + تنظيف)', 'Worker');
  }

  // 5) جدولة مزامنة كتالوجات العملاء (الفيد الحي) — تعمل دائماً حتى واللوحة مغلقة
  const { CatalogService } = require('./catalog.service.js') as typeof import('./catalog.service.js');
  const catalogService = app.get(CatalogService);
  if (config.CATALOG_SYNC_ON_BOOT) {
    setTimeout(() => {
      catalogService.syncAll().catch((err: Error) => Logger.warn(`مزامنة الكتالوج عند الإقلاع فشلت: ${err.message}`, 'Catalog'));
    }, 8_000); // ننتظر اكتمال الإقلاع
  }
  if (config.CATALOG_SYNC_INTERVAL_MS > 0) {
    const catalogTimer = setInterval(() => {
      catalogService.syncAll().catch(() => {});
    }, config.CATALOG_SYNC_INTERVAL_MS);
    catalogTimer.unref?.();
    Logger.log(`🛒 جدولة كتالوجات العملاء: كل ${Math.round(config.CATALOG_SYNC_INTERVAL_MS / 60000)} دقيقة`, 'Catalog');
  }

  // 6) الإغلاق النظيف
  const shutdown = async () => {
    workerRuntime?.stop();
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());

  await app.listen(config.PORT, '0.0.0.0');
  Logger.log(`🚀 Chat Bot Dev API يعمل على المنفذ ${config.PORT}`, 'Bootstrap');
  Logger.log(`🟢 وضع الديمو: ${config.DEMO_MODE ? 'مفعل' : 'معطل'} — قاعدة: ${config.DATABASE_URL.slice(0, 30)}`, 'Bootstrap');
}

void bootstrap();
