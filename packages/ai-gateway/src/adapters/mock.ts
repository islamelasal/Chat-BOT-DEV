/**
 * محوّل Mock — يبث ردوداً عربية جاهزة (تدفق token-by-token).
 * الغرض: تشغيل العرض/المراحل بدون مفاتيح حقيقية + محاكاة سلوك مزود في الاختبارات.
 * في الإنتاج يُعطَّل ويبقى للتجارب فقط.
 */
import type { ChatChunk, ChatParams, HealthInfo, ProviderAdapter } from '../types.js';

const REPLIES: Array<{ keys: RegExp; reply: string }> = [
  {
    keys: /شحن|توصيل|توصل|delivery|shipping/i,
    reply:
      'بنوصّل لكل محافظات مصر 🇪🇬\n\n1. الطلب بيتأكد تليفونياً قبل الشحن.\n2. مدة التوصيل من 2 لـ 5 أيام عمل حسب المحافظة.\n3. تكلفة الشحن بتتحدد حسب منطقتك وبتظهر في صفحة إتمام الشراء.\n\nتقدر تكمل طلبك وتتابع حالة الشحن من حسابك، ولو محتاج أي مساعدة اتصل بينا على 16959 من 9 صباحاً لـ 5 مساءً.',
  },
  {
    keys: /استرجاع|استبدال|رجوع|return|refund/i,
    reply:
      'سياسة الاسترجاع عندنا بسيطة 😊\n\n1. الاسترجاع أو الاستبدال خلال 14 يوم من الاستلام.\n2. المنتج يكون بحالته الأصلية ومعاه الفاتورة.\n3. المبلغ بيرجع خلال 5-7 أيام عمل على نفس وسيلة الدفع.\n\nملحوظة: الملابس الداخلية لا تُسترجع إلا في حالة عيوب صناعة.',
  },
  {
    keys: /ضمان|عيب|خامة|guarantee|warranty/i,
    reply:
      'كل منتجات الشوا مضمونة ✅\n\n- الأجهزة الكهربائية ليها ضمان معتمد من الوكيل.\n- أي عيب صناعة في المفروشات بيتم استبداله فوراً خلال 14 يوم.\n- كمان ملتزمين بأقل الأسعار: لو لقيت نفس المنتج أرخص، بنطابقلك السعر.\n\nلو عندك مشكلة في منتج وصلّك، ابعتلنا رقم الأوردر ونتصرف فوراً.',
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

  private pickReply(text: string): string {
    for (const entry of REPLIES) {
      if (entry.keys.test(text)) return entry.reply;
    }
    return FALLBACK;
  }

  async *chat(params: ChatParams): AsyncIterable<ChatChunk> {
    const lastUser = [...params.messages].reverse().find((m) => m.role === 'user');
    const reply = this.pickReply(lastUser?.content ?? '');
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
