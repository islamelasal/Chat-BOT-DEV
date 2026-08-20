# 🚀 قرار النشر — Chat Bot Dev (حسم الـ MVP Launch Decision)

> هذه الوثيقة تحسم نقاط القرار المطلوبة في مراجعة المشروع، مع مصفوفة خيارات ومسار موصى به.

## 1. مصفوفة الخيارات

| الخيار | التكلفة | الجاهزية | العيوب | ملائم لـ |
|---|---|---|---|---|
| **أ) Docker Compose محلي (VPS)** | ~25$/شهر (VPS واحد 4GB) | ✅ جاهز الآن (`infra/docker-compose.yml` كامل: Postgres+Redis+API+Worker+Dashboard+Traefik+HTTPS) | تحتاج سيرفر وخبرة نشر أساسية | **القرار الموصى به للإنتاج** |
| **ب) PaaS (Railway/Render)** | 5-25$/خدمة/شهر | ✅ ملفات جاهزة (`railway.json` + `render.yaml`) | 3 خدمات منفصلة = فواتير متعددة + حدود زمن استجابة | تجربة سريعة/عروض |
| **ج) Vercel + Neon + Upstash** | 0-30$ | ⚠️ جزئي | الـ API وWorker يحتاجان خادم مستمر — Vercel Serverless لا يناسب العامل 24/7 | غير موصى به |
| **د) معاينة Arena الحالية** | 0$ | ✅ شغالة الآن | بيئة معاينة فقط — تعيد ضبط نفسها (غير دائمة) | **العرض والتطوير** ✅ (ما نستخدمه الآن) |

## 2. القرار الموصى به (حسم)

**المسار: (د) الآن للعرض الحي → (أ) VPS+Docker عند توقيع أول عميل فعلي.**

الأسباب:
1. **العامل 24/7 (نبضات+عدادات+مزامنة فيد كل 6 ساعات) يتطلب عملية دائمة** — PaaS الـ Serverless لا يناسبه؛ VPS واحد بـ Docker هو الأرخص والأوثق.
2. البنية جاهزة: `docker compose up -d` يشغّل كل شيء (Postgres+Redis+API+Worker+لوحة+Traefik بشهادة HTTPS تلقائية).
3. رابط الودجت الإنتاجي سيكون `https://widget.<دومينك>/w.js?id=clt_elshawwa` — مستقر بعكس نطاقات المعاينة.

## 3. خطوات النشر على VPS (15 دقيقة)

```bash
# 1) على السيرفر (Ubuntu 22.04+): Docker + Docker Compose
curl -fsSL https://get.docker.com | sh

# 2) استنساخ المشروع (الفرع الإنتاجي)
git clone https://github.com/islamelasal/Chat-BOT-DEV.git
cd Chat-BOT-DEV

# 3) إعدادات البيئة (أسرار حقيقية!)
cp .env.example infra/.env
nano infra/.env   # DB_PASSWORD + JWT_SECRET + ENCRYPTION_KEY + ACME_EMAIL + CORS_ORIGINS

# 4) تشغيل الإنتاج
docker compose -f infra/docker-compose.yml up -d --build

# 5) تفعيل زاحف Scrapling (تجاوز Cloudflare للفيد)
docker compose -f infra/docker-compose.yml --profile scrapling up -d

# 6) فتح لوحة الإدارة على https://app.<دومينك> — تسجيل الدخول وتغيير كلمة مرور المدير فوراً
```

## 4. آلية الودجت (حسم Gap: Snippet)

**القرار: اعتماد الـ Snippet البسيط** — `<script src="https://widget.<دومينك>/w.js?id=clt_elshawwa" async defer></script>`
- في CS-Cart/Unitheme2: إضافة جاهزة (`integrations/cs-cart/`) تنجو من تحديثات الثيم، أو Block HTML في Design→Layouts.
- الودجت معزول (iframe+Shadow DOM) — لا يمس سرعة الموقع (واجهته تُحمَّل عند أول نقرة فقط).

## 5. حالة مفاتيح الـ API (حسم سؤال التحقق)

| المفتاح | الحالة |
|---|---|
| **OpenRouter** | ✅ جاهز — في `apps/api/.env` (يُثبَّت مشفراً AES-256-GCM عند الإقلاع عبر `ensureProviderKeys`؛ **دوّره قبل الإنتاج** لأنه ظهر في محادثة) |
| **CS-Cart API Key** (لتتبع الطلبات) | ⏳ مطلوب من العميل: `Customers→Administrators→API access` لحساب بوت مخصص |
| Gemini/Groq/DeepSeek (بدائل مجانية) | ✅ أُضيفت من شاشة "مزودو الـ AI" عند الحاجة — التوجيه يتحول تلقائياً |

## 6. استقرار الـ Free LLM APIs (حسم Gap 2)

الآليات المبنية والمختبَرة:
- **5 استراتيجيات توجيه + سلاسل Fallback** (نفس الطلب ينتقل تلقائياً لنموذج بديل عند الفشل/429/مهلة)
- **دوائر كسر** بتبريد تصاعدي لكل (مزود×نموذج) + نبضات 24/7 + Dead-Man Switch
- **اختبار حمل فعلي مسجل**: 50 زائر متزامن × 5 رسائل = 100% نجاح، TTFT P95=207ms
- **جديد**: `node scripts/check-providers.mjs` — فحص جاهزية كل المزودين في دقيقة قبل الإطلاق وبشكل دوري

## 7. قائمة إطلاق MVP النهائية (Go/No-Go)

- [x] البنية كاملة (4 خدمات + بوابة AI + عامل 24/7)
- [x] عميل الشوا (شخصية كنز الشوا v2 + فيد حقيقي + حاسبة عرائس + تتبع طلبات)
- [x] الودجت + إضافة CS-Cart + رفع فيد من الجهاز
- [ ] تدوير مفتاح OpenRouter (ظهر في محادثة) + إدخال مفتاح CS-Cart API للشوا
- [ ] نشر VPS/دومين فعلي + ربط https
- [ ] تثبيت ألوان اللوجو النهائية من المرفق (أو رفع اللوجو من اللوحة — يستخرج الألوان تلقائياً)
- [ ] اختبار 72 ساعة حية ثم التسليم
