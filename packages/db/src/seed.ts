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
  logoUrl: null,
  poweredBy: true,
};

const ELSHAWWA_KNOWLEDGE = [
  {
    title: 'سياسة الشحن',
    source: 'elshawwa.com/shipping',
    content:
      'بنوصل لكل محافظات مصر. الطلب بيتأكد تليفونياً قبل الشحن، ومدة التوصيل من 2 لـ 5 أيام عمل حسب المحافظة. الشحن متاح من السبت للخميس. تكلفة الشحن بتتحدد حسب المنطقة وبتظهر في صفحة إتمام الشراء. للمساعدة: الخط الساخن 16959 من 9 صباحاً لـ 5 مساءً.',
  },
  {
    title: 'سياسة الاسترجاع',
    source: 'elshawwa.com/return-policy',
    content:
      'يمكنك طلب الاسترجاع أو الاستبدال خلال 14 يوم من الاستلام، بشرط أن يكون المنتج بحالته الأصلية وبدون استخدام مع الفاتورة. يتم فحص المنتج أولاً ثم إرجاع المبلغ خلال 5-7 أيام عمل على نفس وسيلة الدفع. المنتجات الداخلية (الملابس الداخلية) لا تُسترجع إلا لعيوب صناعة.',
  },
  {
    title: 'سياسة الضمان وأقل سعر',
    source: 'elshawwa.com/low-price-guarantee',
    content:
      'نلتزم بأقل الأسعار: لو لقيت نفس المنتج بسعر أقل، بنطابقلك السعر. الأجهزة الكهربائية ليها ضمان معتمد من الوكيل. العيوب الصناعية في المفروشات يتم استبدالها فوراً خلال 14 يوم من الاستلام.',
  },
  {
    title: 'الفروع ومواعيد العمل',
    source: 'elshawwa.com/branch',
    content:
      'فروعنا: المعادي — شارع 153 — ميدان الحرية، والمنصورة. مواعيد العمل: السبت للخميس من 9 صباحاً حتى 5 مساءً. الخط الساخن: 16959 — واتساب/تليفون: +201153666660 — البريد: info@elshwwa.com',
  },
  {
    title: 'عروض الصيف (Mega Offers)',
    source: 'elshawwa.com/mega-offers',
    content:
      'عروض الصيف تشمل: المفروشات (سرير، حمام، ستائر)، الملابس (حريمي، رجالي، أطفال، بيبي)، الأدوات المنزلية (أواني طبخ، أطقم سفرة)، الأجهزة الكهربائية، مستلزمات الحج والعمرة، ومستلزمات مدرسية. الخصومات تصل لـ 50% على تشكيلات مختارة ولفترة محدودة.',
  },
  {
    title: 'الأقسام الرئيسية',
    source: 'elshawwa.com',
    content:
      'أقسام الموقع: المفروشات (لحاف، بطاطين، كوفرتة، أطقم سراير، مفارش، فوط وبشاكير، ستائر) — الملابس (مايوهات، ملابس داخلية، لانجيري، عبايات، جلاليب، ملابس بيتي وخروج) — الأدوات المنزلية (أطقم سفرة وتقديم، شوك ومعالق وسكاكين، أواني طبخ) — الأجهزة الكهربائية — مستلزمات البيبي — مستلزمات الحج والعمرة — مستلزمات مدرسية.',
  },
  {
    title: 'الدفع وتتبع الطلبات',
    source: 'elshawwa.com',
    content:
      'الدفع متاح كاش عند الاستلام أو أونلاين. لتتبع طلبك: من قائمة "حسابي" ثم "الطلبات" هتلاقي حالة الطلب بالتفصيل، أو اتصل بينا على 16959 ومعاك رقم الأوردر.',
  },
  {
    title: 'مقاسات المفروشات',
    source: 'elshawwa.com/bedding',
    content:
      'المفروشات متوفرة بمقاسات: مفرد (160×220)، ونصف (180×240)، ومزدوج (220×240)، وملكي (240×260). أطقم السراير بتشمل ملاية + كيس مخدة أو اتنين حسب المقاس. لو مش متأكد من المقاس، قيس مرتبتك الأول أو اسألنا هنا.',
  },
];

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
      logoUrl: null,
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
