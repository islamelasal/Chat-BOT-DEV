# 🕷️ زاحف Scrapling — خدمة جانبية لـ Chat Bot Dev

## لماذا؟
مواقع عديدة (مثل **elshawwa.com**) محمية بـ Cloudflare ضد السحب المباشر —
الزاحف المدمج في العقدة (fetch عادي) يُحظر عندها. هذه الخدمة تستخدم
[Scrapling](https://github.com/D4Vinci/Scrapling) (★75K، BSD-3) الذي يتجاوز
Cloudflare Turnstile/Interstitial بمتصفح خفي، مع بصمات TLS وHTTP/3.

## التشغيل المحلي
```bash
cd services/scrapling-crawler
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
scrapling install          # تثبيت المتصفحات (مرة واحدة)
python main.py 4100
```

## التشغيل بـ Docker
```bash
docker compose -f infra/docker-compose.yml --profile scrapling up -d scrapling
```

## الربط مع المنصة
في بيئة الـ API:
```env
SCRAPLING_URL=http://127.0.0.1:4100     # في الإنتاج: http://scrapling:4100
```
سلسلة التدرّج في الزحف تصبح: **StealthyFetcher → Fetcher(HTTPX) → urllib → الزاحف المدمج في NestJS**
(إن لم تكن الخدمة متاحة أو فشلت، يعمل الزاحف المدمج تلقائياً — لا انقطاع).

## الأمان
- الخدمة داخلية فقط (شبكة Docker) — لا تُكشف للإنترنت.
- حارس SSRF في الـ API يمنع زحف العناوين الخاصة (`CRAWL_ALLOW_PRIVATE=false` في الإنتاج؛ true في الديمو للاختبار المحلي).
- الحد: 10 روابط لكل طلب زحف + مهلة 30 ثانية لكل صفحة.
