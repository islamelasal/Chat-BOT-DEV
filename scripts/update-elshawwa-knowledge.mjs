#!/usr/bin/env node
/**
 * تحديث قاعدة معرفة بوت الشوا في قاعدة البيانات الحية بأحدث النصوص
 * (بدون إعادة تشغيل الخادم أو مسح المحادثات/العدادات).
 *
 * الاستخدام: DATABASE_URL=file:./data/cbd.db node scripts/update-elshawwa-knowledge.mjs
 */
import { randomUUID } from 'node:crypto';
import { db } from '../packages/db/dist/index.js';
import { ELSHAWWA_KNOWLEDGE_EXPORT } from '../packages/db/dist/seed.js';

const BOT_ID = process.env.BOT_ID || 'bot_elshawwa';

async function main() {
  await db.run('DELETE FROM knowledge_chunks WHERE bot_id = ?', BOT_ID);
  let n = 0;
  for (const k of ELSHAWWA_KNOWLEDGE_EXPORT) {
    const chunkId = 'kn_' + randomUUID().replace(/-/g, '').slice(0, 20);
    await db.run(
      'INSERT INTO knowledge_chunks (id, bot_id, title, content, source, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      chunkId, BOT_ID, k.title, k.content, k.source, Date.now()
    );
    n++;
  }
  const count = await db.get('SELECT COUNT(*) AS c FROM knowledge_chunks WHERE bot_id = ?', BOT_ID);
  console.log(`✅ تم تحديث قاعدة المعرفة: ${n} شظية — الإجمالي الآن: ${count.c} (البوت: ${BOT_ID})`);
}

main().catch((err) => {
  console.error('فشل التحديث:', err);
  process.exit(1);
});
