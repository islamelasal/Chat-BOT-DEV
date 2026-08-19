/**
 * ensureProviderKeys — تثبيت مفاتيح المزودين من بيئة التشغيل (مشفرة، idempotent)
 * ─────────────────────────────────────────────────────────────
 * المعيار الأمني: المفاتيح لا تُكتب أبداً في الكود أو Git — تُقرأ من متغيرات
 * البيئة فقط، وتُخزَّن مشفرة AES-256-GCM في قاعدة البيانات عند الإقلاع إن
 * لم تكن مثبتة. المصدر الموصى به للإنتاج: شاشة "مزودو الـ AI" في اللوحة.
 */
import { Logger } from '@nestjs/common';
import { db } from '@cbd/db';
import { encryptSecret } from './crypto.js';
import { config } from './config.js';

export async function ensureProviderKeys(): Promise<void> {
  const providers = (await db.all("SELECT id, api_key_enc FROM providers WHERE id IN ('prv_openrouter', 'prv_gemini')")) as any[];

  // OpenRouter — من بيئة التشغيل إن وُجد ولم يكن مثبتاً
  if (config.OPENROUTER_API_KEY) {
    const p = providers.find((r) => r.id === 'prv_openrouter');
    if (p && !String(p.api_key_enc ?? '')) {
      await db.run('UPDATE providers SET api_key_enc = ?, enabled = 1 WHERE id = ?', encryptSecret(config.OPENROUTER_API_KEY), 'prv_openrouter');
      Logger.log('🔑 ثُبّت مفتاح OpenRouter (مشفر) من بيئة التشغيل', 'Providers');
    }
  }
}
