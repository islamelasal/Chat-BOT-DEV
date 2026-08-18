#!/usr/bin/env node
/**
 * اختبار حمل خفيف (بدون تبعيات) — يحاكي زواراً متزامنين يتحدثون مع البوت.
 * يقيس: أول توكن (TTFT)، زمن المحادثة الكامل، ونسبة النجاح.
 *
 * الاستخدام:
 *   node scripts/load-test.mjs
 *   CONCURRENCY=50 MESSAGES=5 BASE_URL=http://127.0.0.1:3000 node scripts/load-test.mjs
 */
const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:3000';
const CONCURRENCY = Number(process.env.CONCURRENCY || 30);
const MESSAGES = Number(process.env.MESSAGES || 3);

const QUESTIONS = [
  'ايه سياسة الشحن عندكم؟',
  'عندكم عروض دلوقتي؟',
  'فين فروعكم ومواعيد العمل؟',
  'سياسة الاسترجاع ايه؟',
  'مقاسات المفروشات المتوفرة ايه؟',
];

async function createSession() {
  const res = await fetch(`${BASE_URL}/w/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ clientId: 'clt_elshawwa', visitorId: 'lt_' + Math.random().toString(36).slice(2, 12) }),
  });
  if (!res.ok) throw new Error(`session ${res.status}`);
  return (await res.json()).token;
}

async function chatOnce(token, message, pagePath) {
  const started = Date.now();
  let firstTokenAt = null;
  let tokens = 0;
  const res = await fetch(`${BASE_URL}/w/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionToken: token, message, page: { path: pagePath, title: '', lang: 'ar' } }),
  });
  if (!res.ok) throw new Error(`chat ${res.status}`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split('\n\n');
    buffer = blocks.pop() ?? '';
    for (const block of blocks) {
      const line = block.trim();
      if (!line.startsWith('data:')) continue;
      try {
        const d = JSON.parse(line.slice(5).trim());
        if (d.type === 'delta') {
          tokens++;
          if (firstTokenAt == null) firstTokenAt = Date.now() - started;
        }
        if (d.type === 'error') throw new Error(d.message);
      } catch (e) {
        if (e instanceof Error && !e.message.startsWith('Unexpected')) throw e;
      }
    }
  }
  return { ttft: firstTokenAt ?? Date.now() - started, total: Date.now() - started, tokens };
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

async function runVisitor(id) {
  const token = await createSession();
  const ttfts = [];
  const totals = [];
  let outTokens = 0;
  for (let m = 0; m < MESSAGES; m++) {
    const q = QUESTIONS[(id + m) % QUESTIONS.length];
    const path = ['/shipping/', '/mega-offers/', '/branch/', '/return-policy/', '/bedding/'][(id + m) % 5];
    const r = await chatOnce(token, q, path);
    ttfts.push(r.ttft);
    totals.push(r.total);
    outTokens += r.tokens;
  }
  return { ttfts, totals, outTokens };
}

console.log(`🚀 اختبار حمل: ${CONCURRENCY} زائر متزامن × ${MESSAGES} رسائل — ${BASE_URL}`);
const started = Date.now();
const results = await Promise.allSettled(
  Array.from({ length: CONCURRENCY }, (_, i) => runVisitor(i))
);
const elapsed = Date.now() - started;

const allTtft = [];
const allTotals = [];
let okVisitors = 0;
let failedVisitors = 0;
let totalOutTokens = 0;

for (const r of results) {
  if (r.status === 'fulfilled') {
    okVisitors++;
    allTtft.push(...r.value.ttfts);
    allTotals.push(...r.value.totals);
    totalOutTokens += r.value.outTokens;
  } else {
    failedVisitors++;
    console.log('  ✗ زائر فشل:', r.reason?.message ?? r.reason);
  }
}

allTtft.sort((a, b) => a - b);
allTotals.sort((a, b) => a - b);

const msgs = CONCURRENCY * MESSAGES;
console.log('\n📊 النتائج');
console.log('──────────────────────────────────────────');
console.log(`الزوار الناجحون:      ${okVisitors}/${CONCURRENCY} (${((okVisitors / CONCURRENCY) * 100).toFixed(0)}%)`);
console.log(`إجمالي الرسائل:       ${msgs}`);
console.log(`إجمالي الوقت:         ${(elapsed / 1000).toFixed(1)} ثانية`);
console.log(`الإنتاجية:            ${(msgs / (elapsed / 1000)).toFixed(1)} رسالة/ثانية`);
console.log(`توكنز الخرج:          ${totalOutTokens.toLocaleString('en')}`);
console.log('──────────────────────────────────────────');
console.log(`TTFT (أول توكن):      P50=${percentile(allTtft, 50)}ms · P95=${percentile(allTtft, 95)}ms · Max=${allTtft[allTtft.length - 1] ?? 0}ms`);
console.log(`المحادثة الكاملة:     P50=${percentile(allTotals, 50)}ms · P95=${percentile(allTotals, 95)}ms`);
console.log('──────────────────────────────────────────');
if (failedVisitors === 0 && percentile(allTtft, 95) <= 800) {
  console.log('✅ ضمن الهدف: نجاح 100% وTTFT P95 ≤ 800ms');
} else {
  console.log('⚠️ خارج الهدف — راجع لوحة الحالة والتنبيهات');
}
