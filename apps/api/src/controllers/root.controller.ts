/**
 * صفحة الجذر للـ API — بدل الشاشة البيضاء (404 JSON)
 * تعرض حالة حية للمنصة + تجربة فورية لبوت الشوا داخل نفس الصفحة.
 */
import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { db, getProviderHealthRaw, now } from '@cbd/db';
import { Public } from '../auth.js';

@Public()
@Controller()
export class RootController {
  @Get()
  async root(@Res() res: Response) {
    let providersEnabled = 0;
    let providersHealthy = 0;
    let messages24h = 0;
    let conversations24h = 0;
    let heartbeats24h = 0;
    try {
      const providers = (await db.all('SELECT * FROM providers WHERE enabled = 1')) as any[];
      providersEnabled = providers.length;
      for (const p of providers) {
        const h = await getProviderHealthRaw(String(p.id));
        if (h.ok === true) providersHealthy++;
      }
      const m = (await db.get('SELECT COUNT(*) AS c FROM usage_events WHERE created_at >= ?', now() - 86_400_000)) as any;
      messages24h = Number(m?.c ?? 0);
      const cv = (await db.get('SELECT COUNT(*) AS c FROM conversations WHERE updated_at >= ?', now() - 86_400_000)) as any;
      conversations24h = Number(cv?.c ?? 0);
      const hb = (await db.get('SELECT COUNT(*) AS c FROM heartbeat_logs WHERE at >= ?', now() - 86_400_000)) as any;
      heartbeats24h = Number(hb?.c ?? 0);
    } catch {
      /* البيانات اختيارية — الصفحة تظهر دائماً */
    }

    res.status(200).type('html').send(`<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Chat Bot Dev — بوابة الذكاء الاصطناعي</title>
<style>
  body{margin:0;font-family:'Segoe UI',Tahoma,Cairo,sans-serif;background:#0b1220;color:#e2e8f0;min-height:100vh}
  .wrap{max-width:560px;margin:0 auto;padding:28px 18px}
  .badge{display:inline-flex;align-items:center;gap:8px;background:rgba(16,185,129,.12);color:#34d399;border:1px solid rgba(16,185,129,.3);padding:6px 14px;border-radius:999px;font-size:13px;font-weight:700}
  .dot{width:8px;height:8px;border-radius:50%;background:#34d399;display:inline-block;animation:pulse 1.6s ease infinite}
  @keyframes pulse{50%{opacity:.4}}
  h1{font-size:25px;margin:16px 0 6px}
  .sub{color:#94a3b8;font-size:14px;margin:0 0 22px;line-height:1.8}
  .stats{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:20px}
  .stat{background:#0d1626;border:1px solid #1e293b;border-radius:14px;padding:13px;text-align:center}
  .stat b{display:block;font-size:20px;color:#fff}
  .stat span{font-size:11px;color:#64748b}
  a.btn{display:block;text-align:center;text-decoration:none;background:#10b981;color:#04120c;font-weight:800;padding:12px;border-radius:12px;margin-bottom:9px;font-size:14px}
  a.btn.alt{background:#1e293b;color:#cbd5e1;border:1px solid #334155}
  .chat-title{color:#94a3b8;font-size:13px;font-weight:700;margin:22px 0 10px}
  iframe{width:100%;height:560px;border:none;border-radius:16px;background:#fff}
  .mono{font-family:monospace;direction:ltr;color:#475569;font-size:12px;text-align:center;margin-top:16px}
</style>
</head>
<body>
<div class="wrap">
  <span class="badge"><span class="dot"></span> الخدمة تعمل — Chat Bot Dev API</span>
  <h1>بوابة الذكاء الاصطناعي 🤖</h1>
  <p class="sub">هذه نهاية خدمة الـ API الخلفية وليست واجهة إدارة — اللوحة الإدارية على المنفذ المجاور.
  العدادات والنبضات تعمل على مدار الساعة حتى لو اللوحة مغلقة.</p>
  <div class="stats">
    <div class="stat"><b>${providersEnabled}</b><span>مزود مفعّل</span></div>
    <div class="stat"><b>${providersHealthy}</b><span>نبضات سليمة</span></div>
    <div class="stat"><b>${messages24h}</b><span>رسالة (24س)</span></div>
  </div>
  <a class="btn" id="dash-link" href="#" target="_blank">لوحة التحكم الإدارية ←</a>
  <a class="btn alt" href="/w/healthz" target="_blank">فحص الصحة /w/healthz</a>
  <div class="chat-title">▼ جرّب بوت الشوا فوراً (مساعد مجموعة الشوا التجارية)</div>
  <iframe src="/w/frame?client=clt_elshawwa" title="بوت الشوا التجريبي"></iframe>
  <div class="mono">محادثات اليوم ${conversations24h} · نبضات اليوم ${heartbeats24h} · ${new Date().toISOString()}</div>
</div>
<script>
(function(){
  var m = location.host.match(/^\\d+/);
  var dashHost = m ? location.host.replace(/^\\d+/, '3000') : location.hostname + ':3000';
  document.getElementById('dash-link').href = location.protocol + '//' + dashHost + '/login';
})();
</script>
</body>
</html>`);
  }
}
