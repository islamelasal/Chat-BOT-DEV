/**
 * بذرة بيانات العرض (Demo Seed) — تُشغَّل عند SEED_DEMO=true (الافتراضي في التطوير)
 * تنشئ: حساب المدير + عميل الشوا بثيم مؤقت + بوت مساعد الشوا بمعرفته + كتالوج المزودين.
 *
 * ⚠️ ألوان الثيم مؤقتة (أحمر/ذهبي) لحين تثبيت البراند كيت الرسمي من المرفقات.
 */
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { db, id, json, now } from './index.js';
import type { RoutingPolicy, ThemeConfig } from '@cbd/shared';

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [algo, salt, hash] = stored.split('$');
  if (algo !== 'scrypt' || !salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

const ADMIN_EMAIL = 'admin@chatbotdev.app';
const ADMIN_PASSWORD = 'Admin@1234';

const ELSHAWWA_THEME: ThemeConfig = {
  primary: '#C1272D',
  secondary: '#F2A93B',
  background: '#FFFFFF',
  bubbleText: 'أهلاً بيك في الشوا 👋 محتاج مساعدة؟',
  headerText: '#FFFFFF',
  font: 'Cairo',
  position: 'bottom-left',
  bubbleStyle: 'pill',
  windowMode: 'docked',
  welcomeTitle: 'مجموعة الشوا التجارية',
  welcomeText: 'أهلاً بيك في الشوا! إزاي نقدر نساعدك النهاردة؟',
  suggestions: ['سياسة الشحن والاسترجاع', 'فروعنا ومواعيد العمل', 'عروض الصيف', 'تتبع طلبي'],
  showBrand: true,
  logoUrl: 'https://elshawwa.com/images/logos/8/elshawwa.png',
  poweredBy: true,
};

const ELSHAWWA_KNOWLEDGE = [
  {
    title: 'سياسة الشحن والتوصيل',
    source: 'elshawwa.com/shipping (رسمي)',
    content:
      'نوصل لأي منطقة في جمهورية مصر العربية. تكلفة الشحن التقريبية بتتحسب حسب مكان التوصيل وبتظهر للعميل عند الطلب وقبل الدفع. توصيل المراتب داخل المنصورة مجاناً. طرق الاستلام: (1) عربة توصيل حتى باب المنزل، (2) استلام من أقرب فرع. طرق الدفع: كاش عند الاستلام أو كريديت كارد. المتجر فيه أكثر من 100,000 منتج. الخط الساخن: 16959.',
  },
  {
    title: 'سياسة الاستبدال والاسترجاع',
    source: 'elshawwa.com/return-policy (رسمي)',
    content:
      'الاسترجاع: خلال 14 يوماً من تاريخ الفاتورة، بشرط أن يكون المنتج بحالته الأصلية ومع فاتورة الشراء أو صورة واضحة منها. الاستبدال: خلال 30 يوماً من تاريخ الفاتورة بشرط الحالة الأصلية. الطرق: التوجه لأي فرع، أو عبر شركات الشحن مع تحمل العميل قيمة الشحن فقط. ملاحظة هامة: الملابس الداخلية واللانجيري غير قابلة للاستبدال أو الاسترجاع.',
  },
  {
    title: 'سياسة الضمان',
    source: 'elshawwa.com/warranty-policy (رسمي)',
    content:
      'الضمان يغطي فقط العيوب المتعلقة بالخامات أو التصنيع، ولا يشمل أضرار سوء الاستخدام أو الحوادث. الضمان يتمثل في إصلاح المنتج المعيب أو إعادة قيمته حسب حالة المنتج وقت الشراء. ليس كل المنتجات مشمولة بالضمان — يجب التحقق من تصنيف المنتج قبل الشراء. عند طلب استرداد المبلغ يجب إعادة جميع ملحقات المنتج (يُخصم سعر أي ملحق مفقود). إذا كان المنتج غير قابل للإصلاح وضمن ضمان المُصنّع يتم استبداله بمنتج جديد، وإذا لم يتوفر البديل نرد كامل قيمة المنتج.',
  },
  {
    title: 'عن مجموعة الشوا',
    source: 'elshawwa.com/about-us (رسمي)',
    content:
      'مجموعة الشوا التجارية مؤسسة مصرية متخصصة في بيع واستيراد وتوزيع مستلزمات المنزل والأسرة المصرية، تأسست في محافظة الدقهلية، وتمتلك أكثر من 12 فرعاً ومنافذ بيع كبرى في الدلتا والإسكندرية والقاهرة. المقر: المعادي — شارع 153 — ميدان الحرية. الخط الساخن: 16959 — البريد: info@elshwwa.com. مواعيد العمل: السبت للخميس من 9 صباحاً حتى 5 مساءً.',
  },
  {
    title: 'الأقسام الرئيسية',
    source: 'elshawwa.com (رسمي)',
    content:
      'أقسام الموقع: الملابس (حريمي/رجالي/أطفال/بيبي: ملابس داخلية، بيتي، جاهز، إسدال، عبايات، مايوهات) — المفروشات (سرير: أطقم سراير/بطاطين/كوفرته/مفارش/دفايات، حمام: فوط وبشاكير/برنس، صالة: سفرة/ستاير) — الأدوات المنزلية (المطبخ: أواني طبخ/رفايع/توزيع وتوابل، السفرة: أدوات زجاجية/شاي وجاتوه/أركوبيركس/شوك ومعالق/تقديم، المنزل: رفايع حمام/جاليري وتحف) — الأجهزة الكهربائية (شاشات/مطبخ/أجهزة منزل) — عروض الشوا — مستلزمات المدارس — الحج والعمرة.',
  },
  {
    title: 'الدفع وتتبع الطلبات',
    source: 'elshawwa.com (رسمي)',
    content:
      'طرق الدفع: كاش عند الاستلام أو كريديت كارد. لتتبع الطلب: من قائمة "حسابي" ثم "الطلبات" تظهر حالة الأوردر بالتفصيل، أو الاتصال على 16959 مع رقم الأوردر. التسجيل متاح ببريد إلكتروني أو عبر فيسبوك.',
  },
  {
    title: 'مقاسات المفروشات',
    source: 'elshawwa.com/bedding (رسمي)',
    content:
      'المفروشات متوفرة بمقاسات: مفرد (160×220)، ونصف (180×240)، ومزدوج (220×240)، وملكي (240×260). أطقم السراير بتشمل ملاية + كيس مخدة أو اتنين حسب المقاس. لو مش متأكد من المقاس، قيس مرتبتك الأول أو اسألنا هنا.',
  },
  {
    title: 'العروض والخصومات',
    source: 'elshawwa.com (رسمي)',
    content:
      'قسم "عروض الشوا" بيضم خصومات على الأدوات المنزلية والكهربائية والملابس والمفروشات، بالإضافة لعروض موسمية (عروض الشتوى، رمضان، المدارس، الحج والعمرة). الأسعار المخفضة لفترة محدودة. اتصل على 16959 أو تابع الموقع لمعرفة العروض الحالية.',
  },
];

export const ELSHAWWA_KNOWLEDGE_EXPORT = ELSHAWWA_KNOWLEDGE;

export async function seedDemo(): Promise<{ seeded: boolean }> {
  const existing = await db.get('SELECT id FROM users WHERE email = ?', ADMIN_EMAIL);
  if (existing) return { seeded: false };

  // ── المدير ──
  await db.run(
    `INSERT INTO users (id, email, name, password_hash, role, active, created_at)
     VALUES (?, ?, ?, ?, 'super_admin', 1, ?)`,
    id('usr'), ADMIN_EMAIL, 'مدير المنصة', hashPassword(ADMIN_PASSWORD), now()
  );

  // ── عميل الشوا ──
  const clientId = 'clt_elshawwa';
  await db.run(
    `INSERT INTO clients
      (id, name, site_url, email, phone, plan, status, brand_json, theme_json, monthly_limit, daily_limit, created_at)
     VALUES (?, ?, ?, ?, ?, 'pro', 'active', ?, ?, 20000, 1000, ?)`,
    clientId,
    'مجموعة الشوا التجارية',
    'https://elshawwa.com/',
    'info@elshwwa.com',
    '+201153666660',
    JSON.stringify({
      logoUrl: 'https://elshawwa.com/images/logos/8/elshawwa.png',
      colors: { primary: ELSHAWWA_THEME.primary, secondary: ELSHAWWA_THEME.secondary, accent: '#7A0E14' },
      font: 'Cairo',
    }),
    JSON.stringify(ELSHAWWA_THEME),
    now()
  );
  for (const d of ['elshawwa.com', 'www.elshawwa.com']) {
    await db.run('INSERT INTO domains (client_id, domain) VALUES (?, ?)', clientId, d);
  }

  // ── المزودون ──
  const providers = [
    { key: 'prv_mock', name: 'Mock Provider (ديمو)', kind: 'mock', baseUrl: '', tier: 'free', enabled: 1 },
    { key: 'prv_openrouter', name: 'OpenRouter', kind: 'openai-compatible', baseUrl: 'https://openrouter.ai/api/v1', tier: 'free', enabled: 1 },
    { key: 'prv_groq', name: 'Groq', kind: 'openai-compatible', baseUrl: 'https://api.groq.com/openai/v1', tier: 'free', enabled: 1 },
    { key: 'prv_gemini', name: 'Google Gemini', kind: 'gemini-native', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', tier: 'free', enabled: 1 },
    { key: 'prv_dmxapi', name: 'DMXAPI', kind: 'openai-compatible', baseUrl: '', tier: 'paid', enabled: 0 },
  ];
  for (const p of providers) {
    await db.run(
      `INSERT INTO providers (id, name, kind, base_url, api_key_enc, tier, limits_json, enabled, created_at)
       VALUES (?, ?, ?, ?, '', ?, NULL, ?, ?)`,
      p.key, p.name, p.kind, p.baseUrl, p.tier, p.enabled, now()
    );
  }

  const models: Array<[string, string, number, number, number, number]> = [
    ['prv_mock', 'mock/elshawwa-assistant', 32000, 0, 0, 1],
    ['prv_openrouter', 'meta-llama/llama-3.3-70b-instruct:free', 131072, 0, 0, 1],
    ['prv_openrouter', 'google/gemma-3-12b-it:free', 131072, 0, 0, 1],
    ['prv_openrouter', 'deepseek/deepseek-chat-v3-0324:free', 131072, 0, 0, 1],
    ['prv_openrouter', 'claude-sonnet-4-20250514', 200000, 3, 15, 0],
    ['prv_groq', 'llama-3.3-70b-versatile', 131072, 0.59, 0.79, 1],
    ['prv_gemini', 'gemini-2.0-flash', 1048576, 0, 0, 1],
    ['prv_gemini', 'gemma-3-12b-it', 131072, 0, 0, 1],
    ['prv_dmxapi', 'claude-4.1', 200000, 2.4, 12, 0],
    ['prv_dmxapi', 'gpt-4.1-mini', 200000, 0.4, 1.6, 0],
  ];
  for (const [pid, name, ctx, ci, co, free] of models) {
    await db.run(
      `INSERT INTO models (id, provider_id, name, context_window, cost_in, cost_out, free, enabled)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
      id('mdl'), pid, name, ctx, ci, co, free
    );
  }

  // ── بوت الشوا ──
  const botId = 'bot_elshawwa';
  const persona = `أنت "مساعد الشوا"، ممثل خدمة عملاء مجموعة الشوا التجارية (elshawwa.com) — متخصصة في المفروشات والملابس والأدوات المنزلية في مصر.
مهامك: الرد باحتراف ودقة على أسئلة الزوار، مساعدتهم في اختيار المنتجات، والإجابة عن الشحن والاسترجاع والضمان والفروع.
القواعد:
1. إجاباتك من قاعدة المعرفة فقط — لا تخترع أسعاراً أو عروضاً أو سياسات.
2. عند عدم معرفة إجابة: "هساعد حضرتك أتأكد من المعلومة، تقدر تتواصل معانا على 16959 من السبت للخميس 9ص-5م".
3. ردك مختصر (3-5 جمل غالباً) ومباشر، وقسّمه بنقاط عند تعدد الخيارات.
4. استخدم العامية المصرية الراقية وخاطب الزائر بـ"حضرتك".
5. لو الزائر بيسأل عن منتجات/أقسام، وجّهه لرابط القسم المناسب على الموقع.
6. لا تناقش السياسة أو الدين أو مواضيع خارج المتجر — اعتذر بلطف وحوّل للمساعدة.`;

  const routing: RoutingPolicy = {
    strategy: 'smart-auto',
    tiers: [
      { model: 'mock/elshawwa-assistant', providerIds: ['prv_mock'], weight: 3, maxTokens: 700, temperature: 0.5 },
      { model: 'meta-llama/llama-3.3-70b-instruct:free', providerIds: ['prv_openrouter', 'prv_groq'], weight: 2, maxTokens: 900, temperature: 0.4 },
      { model: 'gemini-2.0-flash', providerIds: ['prv_gemini'], weight: 1, maxTokens: 900, temperature: 0.4 },
    ],
  };

  await db.run(
    `INSERT INTO bots (id, client_id, name, description, persona, language, max_reply_len, forbidden_json, routing_json, active, created_at)
     VALUES (?, ?, ?, ?, ?, 'ar', 1200, ?, ?, 1, ?)`,
    botId, clientId, 'مساعد الشوا',
    'بوت خدمة العملاء والمبيعات لموقع مجموعة الشوا التجارية',
    persona,
    JSON.stringify(['سياسة', 'دين', 'جنس']),
    JSON.stringify(routing),
    now()
  );
  for (const k of ELSHAWWA_KNOWLEDGE) {
    await db.run(
      `INSERT INTO knowledge_chunks (id, bot_id, title, content, source, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      id('kn'), botId, k.title, k.content, k.source, now()
    );
  }

  // ── إعدادات ──
  await db.run('INSERT INTO settings (key, value) VALUES (?, ?)', 'site_name', 'Chat Bot Dev');

  console.log('✅ Seed demo: admin=' + ADMIN_EMAIL + ' / ' + ADMIN_PASSWORD);
  console.log('✅ Seed demo: client=elshawwa bot=مساعد الشوا providers=5 models=10');
  return { seeded: true };
}

export { ADMIN_EMAIL, ADMIN_PASSWORD };
