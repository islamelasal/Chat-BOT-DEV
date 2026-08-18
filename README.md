# 🤖 Chat Bot Dev

**منصة إدارة وتوزيع بوتات الذكاء الاصطناعي على مواقع العملاء** — عميلك يضع سطر كود واحداً في موقعه، والبوت يظهر بهوية موقعه داخل إطار آمن (iframe sandbox + Shadow DOM)، بسياق ذكي حسب الصفحة، ومدعوم ببوابة AI موحّدة بمحرك توزيع أحمال، تنقّل تلقائي بين المزودين، نبضات مراقبة 24/7، وعدادات استهلاك دقيقة.

**الحالة:** ✅ النواة مبنية وتعمل — لوحة تحكم عربية RTL + بوابة AI + عامل نبضات + ودجت الشوا التجريبي.

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

**الدخول:** `http://localhost:3000/login` — `admin@chatbotdev.app` / `Admin@1234`

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

## 🧰 المكدس المنفَّذ

TypeScript بالكامل · pnpm Monorepo (Turborepo) · **Next.js 15** لوحة تحكم RTL عربية · **NestJS 11** API · **عامل 24/7** (نبضات + Dead-Man Switch + تنظيف) · **PostgreSQL** (إنتاج) / node:sqlite (تطوير) + Redis (اختياري) · **Preact Widget** معزول (~8KB gz) · اختبارات Vitest للمحرك (9/9 ✅)

## 🗂️ الهيكل

```
apps/
  dashboard/   لوحة التحكم (Next.js) — 13 صفحة
  api/         خدمة API + البوابة (NestJS) — 40+ مساراً
  widget/      ودجت موقع العميل (Preact + Vite) — frame.js + w.js
packages/
  shared/      الأنواع + مخططات zod
  db/          طبقة البيانات (SQLite/Postgres) + كاش TTL + البذرة
  ai-gateway/  المحوّلات + الراوتر (5 استراتيجيات) + دوائر الكسر + الصحة
  worker-core/ النبضات + Dead-Man Switch + التنبيهات + الاحتفاظ
infra/         Docker Compose + Dockerfiles + نسخ احتياطي
docs/          الوثائق الكاملة
```

## 🛡️ الأمان المنفَّذ

مفاتيح المزودين AES-256-GCM · جلسات ودجت موقّعة HMAC · تحقق Origin ضد allowlist العميل · حدود معدل (زائر/عميل) · فلترة حقن البرومبت · RBAC بأدوار + سجل تدقيق · كعكات httpOnly · حدود يومية وشهرية للعميل.

## ⏳ مدخلات معلّقة

ملفات البراند الرسمية لعميل الشوا (لوجو عالي الدقة + الألوان المعتمدة + كود الـ Feed + نماذج أسلوب الرد) — بمجرد إرفاقها تُثبَّت في الثيم والمعرفة (الألوان الحالية أحمر/ذهبي مؤقتة).
