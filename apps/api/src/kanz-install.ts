/**
 * ensureKanzBot — تثبيت/تحديث شخصية "كنز الشوا" بشكل idempotent
 * ─────────────────────────────────────────────────────────────
 * يعمل عند كل إقلاع (بعد migrate/seed) — لذلك أي تحديث في packages/db/src/kanz.ts
 * ينعكس تلقائياً على أي قاعدة بيانات (جديدة أو قائمة) دون فقد بيانات.
 */
import { Logger } from '@nestjs/common';
import { db, id, json, now } from '@cbd/db';
import {
  KANZ_BOT_ID,
  KANZ_CLIENT_ID,
  KANZ_DESCRIPTION,
  KANZ_FALLBACK,
  KANZ_MODEL,
  KANZ_NAME,
  KANZ_ROUTING,
  KANZ_SUGGESTIONS,
  KANZ_SYSTEM_PROMPT,
  KANZ_WELCOME,
} from '@cbd/db/seed-kanz';

export async function ensureKanzBot(): Promise<void> {
  const client = await db.get('SELECT id FROM clients WHERE id = ?', KANZ_CLIENT_ID);
  if (!client) return; // عميل الشوا غير موجود — البذرة ستتولى الأمر عند أول تشغيل

  // 1) التأكد من وجود النموذج المعتمد لدى Google
  const model = await db.get('SELECT id FROM models WHERE provider_id = ? AND name = ?', 'prv_gemini', KANZ_MODEL);
  if (!model) {
    await db.run(
      `INSERT INTO models (id, provider_id, name, context_window, cost_in, cost_out, free, enabled)
       VALUES (?, 'prv_gemini', ?, 1048576, 0, 0, 1, 1)`,
      id('mdl'), KANZ_MODEL
    );
  }

  // 2) إلغاء الافتراضية عن باقي بوتات العميل (كنز الشوا هو الافتراضي)
  await db.run('UPDATE bots SET is_default = 0 WHERE client_id = ? AND id != ?', KANZ_CLIENT_ID, KANZ_BOT_ID);

  // 3) Upsert البوت
  const existing = await db.get('SELECT id FROM bots WHERE id = ?', KANZ_BOT_ID);
  if (!existing) {
    await db.run(
      `INSERT INTO bots (id, client_id, name, description, persona, language, max_reply_len, forbidden_json, routing_json, active, is_default, welcome_msg, suggestions_json, fallback_msg, created_at)
       VALUES (?, ?, ?, ?, ?, 'ar', 1400, ?, ?, 1, 1, ?, ?, ?, ?)`,
      KANZ_BOT_ID, KANZ_CLIENT_ID, KANZ_NAME, KANZ_DESCRIPTION, KANZ_SYSTEM_PROMPT,
      JSON.stringify(['سياسة', 'دين', 'جنس']),
      JSON.stringify(KANZ_ROUTING),
      KANZ_WELCOME, JSON.stringify(KANZ_SUGGESTIONS), KANZ_FALLBACK,
      now()
    );
    Logger.log('🆕 أُنشئ بوت "كنز الشوا"', 'Kanz');
  } else {
    await db.run(
      `UPDATE bots SET name = ?, description = ?, persona = ?, routing_json = ?, is_default = 1, welcome_msg = ?, suggestions_json = ?, fallback_msg = ?, active = 1
       WHERE id = ?`,
      KANZ_NAME, KANZ_DESCRIPTION, KANZ_SYSTEM_PROMPT, JSON.stringify(KANZ_ROUTING),
      KANZ_WELCOME, JSON.stringify(KANZ_SUGGESTIONS), KANZ_FALLBACK,
      KANZ_BOT_ID
    );
    Logger.log('🔁 حُدّثت شخصية "كنز الشوا" لأحدث نسخة', 'Kanz');
  }

  // 4) المعرفة: إن لم تكن للبوت معرفة، انسخها من بوت الدعم (أو أضف الحد الأدنى)
  const count = await db.get('SELECT COUNT(*) AS c FROM knowledge_chunks WHERE bot_id = ?', KANZ_BOT_ID) as any;
  if (Number(count?.c ?? 0) === 0) {
    const source = (await db.all(
      "SELECT title, content, source FROM knowledge_chunks WHERE bot_id = 'bot_elshawwa' ORDER BY created_at ASC LIMIT 20"
    )) as any[];
    if (source.length) {
      for (const k of source) {
        await db.run(
          `INSERT INTO knowledge_chunks (id, bot_id, title, content, source, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
          id('kn'), KANZ_BOT_ID, k.title, k.content, k.source, now()
        );
      }
      Logger.log(`📚 نُسخت ${source.length} شظية معرفة لبوت كنز الشوا`, 'Kanz');
    }
  }
}
