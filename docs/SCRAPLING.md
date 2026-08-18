# 🕷️ تكامل Scrapling — تجاوز الحماية في زحف الروابط

> **بحث (أغسطس 2026):** [D4Vinci/Scrapling](https://github.com/D4Vinci/Scrapling) — ★75,000 · Python · BSD-3 · محدّث يومياً.

## ما هو؟
إطار زحف متكيّف (Adaptive) يحل بالضبط المشكلة التي واجهناها مع **elshawwa.com** (محمي بـ Cloudflare):

| الإمكانية | الفائدة لنا |
|---|---|
| **StealthyFetcher** | يتجاوز Cloudflare Turnstile/Interstitial — المواقع المحمية أصبحت قابلة للتدريب |
| **Fetcher (HTTPX)** | طلبات ببصمة TLS متصفح + HTTP/3 — سريع بلا متصفح للمواقع العادية |
| **adaptive=True / auto_save** | العناصر تتبع نفسها عند تغيّر تصميم الموقع — زحفنا المستقبلي للكتالوجات يبقى سليماً بعد تحديثات عملاء CS-Cart |
| **Spiders** | زحف كامل متزامن مع throttle تلقائي + روبوتات txt + SitemapSpider + ShopifySpider |
| **MCP Server + Agent Skill** | جاهز للذكاء الاصطناعي |
| **Docker جاهز** | `pyd4vinci/scrapling` بكل المتصفحات |

## التكامل المنفَّذ عندنا (سلسلة تدرّج بلا انقطاع)

```
طلب زحف (من محرر المعرفة)
  → 1) خدمة Scrapling الجانبية: StealthyFetcher → Fetcher → urllib
  → 2) الزاحف المدمج في NestJS (fetch عادي)      [لو الخدمة مش متاحة/فشلت]
```

- الخدمة: `services/scrapling-crawler/` (Python stdlib server — صفر تبعيات خادم إضافية)
- الربط: `SCRAPLING_URL` في بيئة الـ API — فارغ = الزاحف المدمج فقط (التطوير)
- الإنتاج: `docker compose --profile scrapling up -d` — الخدمة داخلية فقط

## الأمان (معايير دقيقة)

1. **حارس SSRF**: `isPrivateHost()` يمنع زحف `localhost/10.x/172.16-31.x/192.168.x/169.254.x`
   — `CRAWL_ALLOW_PRIVATE=true` في الديمو فقط (لاختبارنا المحلي)، **`false` في الإنتاج**.
2. حدود: 10 روابط/طلب · مهلة 30 ثانية/صفحة · سقف 2MB للـ HTML · مخصص للمشرفين (RBAC).
3. الخدمة الجانبية غير مكشوفة للإنترنت (expose داخلي فقط).

## الاختبار الفعلي

- ✅ الزحف عبر خدمة Scrapling (محرك HTTPX — المتصفح غير متاح في بيئة الاختبار الرملية)
- ✅ التدرّج للزاحف المدمج عند تعطيل الخدمة
- ✅ حارس SSRF يرفض العناوين الخاصة في وضع الإنتاج

## خارطة استخدام مستقبلي

- **زحف كتالوج عملاء CS-Cart** عبر `SitemapSpider` + `adaptive` (التحديث التلقائي للمعرفة)
- **ShopifySpider** لعملاء Shopify المستقبليين (منتجات JSON مباشرة)
- **capture_xhr**: التقاط بيانات المواقع التي تجلب كتالوجها عبر XHR بدل HTML
