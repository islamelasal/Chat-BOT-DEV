# 🤖 Chat Bot Dev

**منصة إدارة وتوزيع بوتات الذكاء الاصطناعي على مواقع العملاء** — عميلك يضع سطر كود واحداً في موقعه، والبوت يظهر بهوية موقعه داخل إطار آمن (iframe sandbox + Shadow DOM)، بسياق ذكي حسب الصفحة، ومدعوم ببوابة AI موحّدة بمحرك توزيع أحمال، تنقّل تلقائي بين المزودين، نبضات مراقبة 24/7، وعدادات استهلاك دقيقة.

**الحالة:** ✅ النواة مبنية وتعمل — لوحة تحكم عربية RTL + بوابة AI + عامل نبضات 24/7 + ودجت الشوا + 2FA + تكاملات CS-Cart/WordPress + اختبار حمل 50 زائر متزامن (TTFT P95=207ms).

---

## 🚀 التشغيل السريع (Quickstart)

```bash
# 1) التثبيت (Node 22+ و pnpm 9)
pnpm install

# 2) بناء الحزم المشتركة
pnpm --filter '@cbd/shared' --filter '@cbd/db' --filter '@cbd/gateway' --filter '@cbd/worker-core' build

# 3) بناء التطبيقات
pnpm --filter '@cbd/widget' build
pnpm --filter '@cbd/api' build
pnpm --filter '@cbd/dashboard' build

# 4) تشغيل الـ API (مع بيانات العرض + العامل داخل العملية)
cd apps/api
DATABASE_URL=file:./data/cbd.db SEED_DEMO=true DEMO_MODE=true WORKER_IN_PROCESS=true node dist/main.js

# 5) تشغيل اللوحة (نافذة أخرى)
cd apps/dashboard
API_INTERNAL_URL=http://127.0.0.1:4000 npx next start -p 3000
```

**الدخول:** `http://localhost:3000/login` — `admin@chatbotdev.app` / `Admin@1234` (جلسة برمز محفوظ في المتصفح — تعمل في كل البيئات)

**صفحة حالة الـ API:** `http://localhost:4000/` (بدل شاشة بيضاء — حالة حية + تجربة فورية لبوت الشوا)

**جمع بيانات العملاء المحتملين (Lead Capture):** زر «📞 اطلب التواصل معاك» داخل بوت الشوا → صفحة `/leads` + تصدير CSV

**معاينة بوت الشوا:** `http://localhost:3000/demo-store` (متجر يحاكي موقع العميل والودجت الفعلي)

**الإنتاج:** `infra/docker-compose.yml` (Postgres + Redis + API + Worker مستقل + Dashboard + Traefik/HTTPS).

---

## 📚 الوثائق

| الوثيقة | المحتوى |
|---|---|
| [📘 PRD](./docs/PRD.md) | المتطلبات الكاملة (110 متطلباً مرقّماً) والأمان وKPIs |
| [🏗️ المعمارية](./docs/ARCHITECTURE.md) | المكدس، تصميم البوابة والودجت، النموذج، النشر |
| [🗺️ خطة العمل](./docs/ROADMAP.md) | 6 مراحل — التقدم الحالي لكل مرحلة |
| [🔌 كتالوج المزودين](./docs/PROVIDERS.md) | 30+ مزوداً بعناوين دقيقة + وضع الاقتصاد |
| [👤 عميل الشوا](./docs/CLIENTS/elshawwa.md) | الشخصية، المعرفة، خطة CS-Cart/Unitheme2 |
| [🔬 البحث التنافسي](./docs/COMPETITIVE_RESEARCH.md) | 15+ منصة منافسة: الأسعار، الميزات، التقنيات، خطة التفوّق |

## 🧰 المكدس المنفَّذ

TypeScript بالكامل · pnpm Monorepo (Turborepo) · **Next.js 15** لوحة تحكم RTL عربية · **NestJS 11** API · **عامل 24/7** (نبضات + Dead-Man Switch + تنظيف) · **PostgreSQL** (إنتاج) / node:sqlite (تطوير) + Redis (اختياري) · **Preact Widget** معزول (~8KB gz) · اختبارات Vitest للمحرك (9/9 ✅)

## 🗂️ الهيكل

```
apps/
  dashboard/   لوحة التحكم (Next.js) — 15 صفحة
  api/         خدمة API + البوابة (NestJS) — 45+ مساراً (بما فيها 2FA/TOTP)
  widget/      ودجت موقع العميل (Preact + Vite) — frame.js + w.js
integrations/
  cs-cart/     إضافة CS-Cart 4.20.1 جاهزة (خطاف index:scripts بدون تعديل ثيم)
  wordpress/   إضافة WordPress (إعداد من اللوحة + wp_footer)
scripts/
  load-test.mjs  اختبار حمل بدون تبعيات (زوار متزامنون + TTFT/إنتاجية)
packages/
  shared/      الأنواع + مخططات zod
  db/          طبقة البيانات (SQLite/Postgres) + كاش TTL + البذرة
  ai-gateway/  المحوّلات + الراوتر (5 استراتيجيات) + دوائر الكسر + الصحة
  worker-core/ النبضات + Dead-Man Switch + التنبيهات + الاحتفاظ
infra/         Docker Compose + Dockerfiles + نسخ احتياطي
docs/          الوثائق الكاملة
```

## 🛡️ الأمان المنفَّذ

**مصادقة اللوحة بالرمز أولاً (Bearer token في المتصفح)** — لا تعتمد على الكعكات إطلاقاً (تعمل حتى لو حجب المتصفح كعكات الطرف الثالث في بيئات المعاينة) + **جلسة منزلقة (Sliding Session)**: الرمز المنتهي حديثاً يُجدد تلقائياً قبل أي عرض (فترة سماح 12 ساعة، توقيع مُتحقق دائماً، الصلاحيات تُقرأ من قاعدة البيانات عند كل تجديد) — لا وميض قوائم ولا خروج مفاجئ. مفاتيح المزودين AES-256-GCM · جلسات ودجت موقّعة HMAC · تحقق Origin ضد allowlist العميل · حدود معدل ثلاثية الطبقات (جلسة زائر + IP متسامح مع CGNAT + عميل/ساعة) · **2FA/TOTP** (Google Authenticator) بمسار كامل · فلترة حقن البرومبت · RBAC + سجل تدقيق · حدود يومية وشهرية للعميل.

## 🆕 ميزات العميل الكاملة (بعد البحث التنافسي)

- 📞 **جمع بيانات العملاء المحتملين (Lead Capture)**: زر داخل البوت يجمع الاسم/البريد/التليفون → صفحة `/leads` + تصدير CSV لـ Excel.
- 🕸️ **التدريب التلقائي من روابط الموقع**: ألصق روابط العميل → استخراج نص وتقسيم تلقائي لشظايا معرفة (من صفحة البوت → قاعدة المعرفة) + **زاحف Scrapling جانبي** (★75K) يتجاوز Cloudflare بسلاسل تدرّج StealthyFetcher→HTTPX→urllib→الزاحف المدمج، مع **حارس SSRF بالـ DNS Pinning**.
- 👨‍💼 **التحويل لمندوب بشري**: لوحة "تواصل معانا" (واتساب/اتصال/بريد) لكل عميل — تُحصى في العدادات.

## 🏋️ اختبار الحمل

```bash
# نسخة اختبار بحدود معطلة (لأن الحمل يأتي من IP واحد):
# PORT=4001 RATE_LIMIT_DISABLED=true node apps/api/dist/main.js
BASE_URL=http://127.0.0.1:4001 CONCURRENCY=50 MESSAGES=5 node scripts/load-test.mjs
```
النتيجة المسجلة: 50/50 زائراً (100%) · 250 رسالة · TTFT P50=70ms / P95=207ms (الهدف ≤ 800ms) ✅

## ⏳ مدخلات معلّقة

ملفات البراند الرسمية لعميل الشوا (لوجو عالي الدقة + الألوان المعتمدة + كود الـ Feed + نماذج أسلوب الرد) — بمجرد إرفاقها تُثبَّت في الثيم والمعرفة (الألوان الحالية أحمر/ذهبي مؤقتة).
