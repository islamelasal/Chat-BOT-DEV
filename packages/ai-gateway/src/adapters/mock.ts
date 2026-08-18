/**
 * محوّل Mock — يبث ردوداً عربية جاهزة (تدفق token-by-token).
 * الغرض: تشغيل العرض/المراحل بدون مفاتيح حقيقية + محاكاة سلوك مزود في الاختبارات.
 * في الإنتاج يُعطَّل ويبقى للتجارب فقط.
 */
import type { ChatChunk, ChatParams, HealthInfo, ProviderAdapter } from '../types.js';
import type { ChatMessageLite } from '@cbd/shared';

const REPLIES: Array<{ keys: RegExp; reply: string }> = [
  {
    keys: /شحن|توصيل|توصل|delivery|shipping/i,
    reply:
      'بنوصّل لأي منطقة في مصر 🇪🇬\n\n1. تكلفة الشحن بتتحسب حسب مكان التوصيل وبتظهرلك قبل الدفع.\n2. توصيل المراتب داخل المنصورة مجاناً.\n3. تقدر تختار: توصيل لحد باب البيت، أو استلام من أقرب فرع.\n\nالدفع كاش عند الاستلام أو كريديت كارد. لو محتاج مساعدة اتصل بينا على 16959 من 9 صباحاً لـ 5 مساءً.',
  },
  {
    keys: /استرجاع|استبدال|رجوع|return|refund/i,
    reply:
      'سياسة الاستبدال والاسترجاع عندنا بسيطة 😊\n\n1. الاسترجاع: خلال 14 يوم من تاريخ الفاتورة.\n2. الاستبدال: خلال 30 يوم من تاريخ الفاتورة.\n3. المنتج يكون بحالته الأصلية ومعاك الفاتورة أو صورة واضحة منها.\n\nتقدر تروح لأقرب فرع أو تبعت عن طريق شركات الشحن (وتتحمل قيمة الشحن بس). ملحوظة: الملابس الداخلية واللانجيري غير قابلة للاستبدال أو الاسترجاع.',
  },
  {
    keys: /ضمان|عيب|خامة|guarantee|warranty/i,
    reply:
      'الضمان عند الشوا بيغطي عيوب الخامات والتصنيع ✅\n\n1. الضمان: إصلاح المنتج المعيب أو إعادة قيمته حسب حالته.\n2. مش كل المنتجات مشمولة بالضمان — تحقق من تصنيف المنتج قبل الشراء.\n3. لو المنتج غير قابل للإصلاح وضمن ضمان المُصنّع: بيتم استبداله بمنتج جديد، ولو البديل مش متوفر بنرد كامل القيمة.\n\nالضمان لا يشمل أضرار سوء الاستخدام. لو عندك مشكلة ابعتلنا رقم الأوردر ونتصرف فوراً.',
  },
  {
    keys: /فروع|فرع|عنوان|مكان|مفتوح|مواعيد|address|branch/i,
    reply:
      'فروعنا في خدمتك 🏬\n\n1. المعادي — شارع 153 — ميدان الحرية.\n2. المنصورة.\n\nمواعيد العمل: السبت للخميس، من 9 صباحاً حتى 5 مساءً.\nالخط الساخن: 16959 📞 — واتساب: 01153666660',
  },
  {
    keys: /عروض|عرض|خصومات|خصم|تخفيضات|تخفيض|اوفر|offer|sale/i,
    reply:
      'عروض الصيف شغالة دلوقتي 🔥 خصومات لحد 50% على تشكيلات مختارة:\n\n1. المفروشات: سرير، حمام، ستائر.\n2. الملابس: حريمي، رجالي، أطفال، بيبي.\n3. الأدوات المنزلية والأجهزة الكهربائية.\n4. مستلزمات الحج والعمرة والمدارس.\n\nتقدر تتصفح العروض من قسم "عروض الصيف" على الموقع.',
  },
  {
    keys: /سعر|بكام|تكلفة|ثمن|price/i,
    reply:
      'الأسعار بتتغير حسب المقاس والموديل والعرض الحالي، عشان كده الأفضل تتأكد من السعر مباشرة على صفحة المنتج في الموقع.\n\nلو بتدور على منتج معين، قولي اسمه وأنا أدلك على القسم المناسب 👌',
  },
  {
    keys: /تتبع|طلب|أوردر|وصل|order|track/i,
    reply:
      'لتتبع طلبك 📦:\n\n1. ادخل على "حسابي" من الموقع.\n2. اختار "الطلبات" وهتلاقي حالة الأوردر بالتفصيل.\n\nأو اتصل بينا على 16959 ومعاك رقم الأوردر وهنساعدك فوراً.',
  },
  {
    keys: /مقاس|قياس|size|مقاسات/i,
    reply:
      'مقاسات المفروشات المتوفرة 🛏️\n\n1. مفرد: 160×220\n2. نصف: 180×240\n3. مزدوج: 220×240\n4. ملكي: 240×260\n\nأطقم السراير بتشمل ملاية + كيس مخدة أو اتنين حسب المقاس. لو مش متأكد، قيس مرتبتك الأول وأنا أساعدك تختار.',
  },
  {
    keys: /دفع|كاش|فيزا|payment|pay/i,
    reply:
      'طرق الدفع المتاحة 💳\n\n1. كاش عند الاستلام.\n2. دفع أونلاين ببطاقات مختلفة.\n\nالدفع بيتم في خطوة إتمام الشراء بأمان كامل.',
  },
  {
    keys: /سلام|أهلا|هاي|صباح|مساء|hello|hi|ازيك/i,
    reply:
      'أهلاً بيك في مجموعة الشوا 👋\n\nإزاي أقدر أساعدك النهاردة؟ ممكن تسألني عن:\n1. المنتجات والأقسام والمقاسات.\n2. الشحن والاسترجاع والضمان.\n3. عروض الصيف والفروع.\n4. تتبع الطلبات.',
  },
];

const FALLBACK =
  'شكراً لسؤالك 🙏\n\nمعلش النقطة دي محتاجة تأكيد من فريقنا، تقدر تتواصل معانا مباشرة على 16959 من السبت للخميس 9 صباحاً لـ 5 مساءً، أو تكتبلي سؤالك بطريقة تانية وأحاول أساعدك.\n\nأقدر أجاوبك فوراً عن: الشحن، الاسترجاع، الضمان، الفروع، العروض، والمقاسات.';

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class MockAdapter implements ProviderAdapter {
  readonly id: string;
  readonly name: string;
  readonly kind = 'mock' as const;
  private wordsPerMin: number;

  constructor(opts: { id: string; name: string; wordsPerMin?: number }) {
    this.id = opts.id;
    this.name = opts.name;
    this.wordsPerMin = opts.wordsPerMin ?? 900;
  }

  /** يحلل كتلة 【CATALOG】 المحقونة في رسالة النظام ويعيد منتجات مطابقة لرسالة الزائر */
  private catalogReply(messages: ChatMessageLite[], userText: string): string | null {
    const system = messages.find((m) => m.role === 'system')?.content ?? '';
    const idx = system.indexOf('【CATALOG】');
    if (idx < 0) return null;
    const block = system.slice(idx).split('\n').slice(1, 8);
    const products = block
      .map((line) => line.trim())
      .filter((l) => l.startsWith('- '))
      .map((l) => {
        const [name, price, currency, category, url, stock] = l.slice(2).split('|');
        return { name: name ?? '', price: price ?? '', currency: currency ?? 'EGP', category: category ?? '', url: url ?? '', stock: stock ?? 'متوفر' };
      })
      .filter((p) => p.name);
    if (!products.length) return null;
    // اختر المنتج الأكثر تطابقاً مع نص الزائر
    const words = userText.split(/[\s،,؟?]+/).filter((w) => w.length > 2);
    const scored = products
      .map((p) => ({
        p,
        score: words.reduce((acc, w) => acc + (p.name.includes(w) ? 2 : p.category.includes(w) ? 1 : 0), 0),
      }))
      .sort((a, b) => b.score - a.score);
    const best = scored[0]!;
    if (best.score <= 0) return null;
    const { p } = best;
    const lines = [
      `متوفر عندنا ✅`,
      ``,
      `▎${p.name}`,
      p.category ? `القسم: ${p.category}` : '',
      `السعر: ${p.price} ${p.currency}${p.stock !== 'متوفر' ? ' (متوفر حالياً بكمية محدودة)' : ''}`,
      ``,
      p.url ? `تقدر تشوف تفاصيله وتطلبه من هنا 👇\n${p.url}` : `تقدر تطلبه من الموقع أو تتصل بينا على 16959.`,
      ``,
      `تحب أقولك عن منتجات مشابهة أو أساعدك بحاجة تانية؟ 😊`,
    ].filter((l) => l !== '');
    return lines.join('\n');
  }

  private pickReply(text: string): string {
    for (const entry of REPLIES) {
      if (entry.keys.test(text)) return entry.reply;
    }
    return FALLBACK;
  }

  async *chat(params: ChatParams): AsyncIterable<ChatChunk> {
    const lastUser = [...params.messages].reverse().find((m) => m.role === 'user');
    const userText = lastUser?.content ?? '';
    // الأولوية للكتالوج الحي (منتجات حقيقية من الفيد) إن وُجد تطابق
    const catalog = this.catalogReply(params.messages, userText);
    const reply = catalog ?? this.pickReply(userText);
    const words = reply.split(/(\s+)/);
    const msPerWord = 60_000 / this.wordsPerMin;
    for (const w of words) {
      if (params.signal?.aborted) {
        yield { type: 'error', message: 'انتهت مهلة الطلب', code: 'timeout' };
        return;
      }
      await delay(msPerWord);
      yield { type: 'delta', text: w };
    }
    const inputChars = params.messages.reduce((a, m) => a + m.content.length, 0);
    yield {
      type: 'done',
      usage: { input: Math.ceil(inputChars / 4), output: Math.ceil(reply.length / 4) },
    };
  }

  async ping(): Promise<HealthInfo> {
    const start = Date.now();
    await delay(15);
    return {
      ok: true,
      latencyMs: Date.now() - start,
      message: 'OK (mock)',
      quota: { remaining: null, limit: null, resetAt: null },
    };
  }

  async listModels(): Promise<string[]> {
    return ['mock/elshawwa-assistant'];
  }
}
