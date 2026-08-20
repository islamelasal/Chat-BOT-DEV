#!/usr/bin/env node
/**
 * فحص جاهزية المزودين والنماذج (Stability Check)
 * ─────────────────────────────────────────────────────────────
 * يختبر كل مزود نشط عبر الـ API المحلي: ping + عدد النماذج + الحالة.
 * مفيد قبل الإطلاق وفي الإنتاج للتأكد من سلاسل Failover.
 *
 * الاستخدام:
 *   node scripts/check-providers.mjs
 *   API_URL=http://127.0.0.1:4000 node scripts/check-providers.mjs
 */
const API = process.env.API_URL || 'http://127.0.0.1:4000';

async function main() {
  console.log('🔌 فحص المزودين —', API);
  console.log('─'.repeat(60));
  let failures = 0;

  // دخول
  let token = '';
  try {
    const res = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'admin@chatbotdev.app', password: 'Admin@1234' }),
    });
    const j = await res.json();
    token = j?.token ?? '';
  } catch {
    console.log('✗ تعذر الدخول للـ API — هل هو يعمل؟');
    process.exit(1);
  }
  if (!token) {
    console.log('✗ فشل الدخول (بيانات الديمو)');
    process.exit(1);
  }

  const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
  const providers = await (await fetch(`${API}/providers`, { headers })).json();

  for (const p of providers) {
    const name = p.name;
    const enabled = p.enabled;
    if (!enabled) {
      console.log(`⏸  ${name} — معطل (تخطي)`);
      continue;
    }
    try {
      const res = await fetch(`${API}/providers/${p.id}/test`, { method: 'POST', headers });
      const t = await res.json();
      const status = t.ok ? '✅ سليم' : '❌ فشل';
      const latency = t.latencyMs != null ? `${t.latencyMs}ms` : '—';
      const models = t.modelsFound?.length ? `${t.modelsFound.length} نموذج` : 'بدون نماذج';
      console.log(`${status} ${name} — ${latency} — ${models}${t.message && !t.ok ? ` (${t.message})` : ''}`);
      if (!t.ok) failures++;
    } catch (err) {
      console.log(`❌ ${name} — تعذر الفحص: ${err.message}`);
      failures++;
    }
  }

  // حالة النظام العامة
  try {
    const overview = await (await fetch(`${API}/status/overview`, { headers })).json();
    const alive = overview.worker?.alive ? 'حي' : 'متوقف!';
    console.log('─'.repeat(60));
    console.log(`👷 العامل 24/7: ${alive} | مزودون نشطون: ${overview.providers?.length ?? 0}`);
    for (const p of overview.providers ?? []) {
      const pulse = p.ok === true ? '🟢' : p.ok === false ? '🔴' : '⚪';
      console.log(`  ${pulse} ${p.providerName}: ${p.ewmaLatencyMs != null ? p.ewmaLatencyMs + 'ms' : '—'} | دوائر مفتوحة: ${p.circuits?.filter((c) => c.state === 'open').length ?? 0}`);
    }
  } catch {
    /* تجاهل */
  }

  console.log('─'.repeat(60));
  console.log(failures === 0 ? '✅ كل المزودين النشطين سليمون' : `⚠️ ${failures} مزود يحتاج انتباه — سلسلة Failover ستتولى الأمر`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
