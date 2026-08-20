import { generateGeminiResponse } from '../lib/gemini-client.js';
import { truncateText } from './context-builder.js';

const MAX_TRANSCRIPT_LENGTH = 24000;

function transcriptText(chatState) {
  return (chatState?.messages || [])
    .slice(-36)
    .map((message) => `${message.role === 'user' ? 'المستخدم' : 'المساعد'}: ${truncateText(message.content, 4000)}`)
    .join('\n\n');
}

function parseCoordinatorJson(text) {
  const raw = String(text || '').trim();
  const candidates = [raw, raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1], raw.match(/\{[\s\S]*\}/)?.[0]];
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const parsed = JSON.parse(candidate.trim());
      if (!parsed || typeof parsed !== 'object') continue;
      const status = ['continue', 'done', 'blocked'].includes(parsed.status) ? parsed.status : 'continue';
      return {
        status,
        nextPrompt: String(parsed.nextPrompt || parsed.next_prompt || '').trim().slice(0, 7000),
        summary: String(parsed.summary || '').trim().slice(0, 1000),
        blocker: String(parsed.blocker || '').trim().slice(0, 1000),
        acceptance: Array.isArray(parsed.acceptance)
          ? parsed.acceptance.map(String).slice(0, 8)
          : []
      };
    } catch {
      // Try the next extraction strategy.
    }
  }
  return null;
}

function coordinatorInstruction() {
  return `أنت منسق تسليم (Delivery Orchestrator) يعمل بين Project Agent ومحادثة AI مفتوحة في متصفح المستخدم.
مهمتك ليست إعطاء جواب عام، بل فحص سجل محادثة المساعد العامل، ثم تحديد أفضل رسالة تنفيذية واحدة ترسلها له ليكمل المشروع.

قواعد صارمة:
- افترض أن المساعد العامل يستطيع تنفيذ أو شرح ما تسمح به منصته، لكنه لا يستطيع تعديل جهاز المستخدم دون أن ينسخ المستخدم الملفات أو يطبقها.
- لا تطلب من المساعد العامل أن ينتظر أو يسأل أسئلة غير ضرورية. اجعله ينفذ أصغر خطوة مكتملة قابلة للتحقق الآن.
- حافظ على متطلبات المستخدم ولا تغيّر نطاق المشروع من نفسك.
- اطلب في كل دورة نتيجة قابلة للمراجعة: ملف، كود، قرار، اختبار، أو تقرير فجوات.
- إذا كان هناك نقص حقيقي يمنع التقدم، أعد الحالة blocked مع سؤال واحد محدد.
- إذا تحققت متطلبات المشروع أو أعلن المساعد العامل اكتمالها مع وجود تحقق مناسب، أعد done.
- لا تعرض chain-of-thought. استخدم ملخصاً قصيراً فقط.
- أخرج JSON صالحاً فقط، بلا Markdown ولا نص قبله أو بعده، وفق الشكل:
{"status":"continue|done|blocked","nextPrompt":"رسالة تنفيذية للمساعد العامل","summary":"ملخص قصير","blocker":"سبب التوقف إن وجد","acceptance":["معيار تحقق"]}`;
}

export class AutopilotCoordinator {
  constructor(settings = {}) {
    this.settings = settings;
  }

  async nextStep({ project, chatState, goal = '', turn = 1, maxTurns = 10, signal } = {}) {
    const transcript = truncateText(transcriptText(chatState), MAX_TRANSCRIPT_LENGTH);
    const prompt = `الهدف العام للمشروع:
${truncateText(goal || project?.brief || 'أكمل المشروع الحالي بأفضل نتيجة قابلة للتسليم.', 3000)}

ملخص المشروع:
${truncateText(project?.brief || 'غير متوفر', 3000)}

الدورة الحالية: ${turn} من ${maxTurns}

حالة محادثة AI المفتوحة (${chatState?.providerLabel || chatState?.provider || 'AI'}):
${transcript || 'لا توجد رسائل مقروءة بعد.'}

حلّل التقدم واختر الخطوة التالية. إذا كانت المحادثة تتطلب من المستخدم إجراءً خارجياً، اجعل ذلك blocker واضحاً بدلاً من الادعاء بأن المشروع اكتمل.`;

    const response = await generateGeminiResponse({
      apiKey: this.settings.apiKey,
      model: this.settings.model,
      fallbackModel: this.settings.fallbackModel,
      systemInstruction: coordinatorInstruction(),
      messages: [{ role: 'user', content: prompt }],
      settings: {
        ...this.settings,
        webSearch: false,
        urlContext: false,
        codeExecution: false,
        streaming: false,
        temperature: 0.15,
        maxOutputTokens: 1800
      },
      signal
    });

    const parsed = parseCoordinatorJson(response.text);
    if (parsed) return { ...parsed, model: response.model, fallback: response.fallback };

    return {
      status: 'continue',
      nextPrompt: `استمر في تنفيذ المشروع الحالي من آخر نقطة، ونفّذ خطوة واحدة مكتملة الآن. اذكر ما تم إنجازه والاختبار أو الدليل المطلوب قبل الانتقال للخطوة التالية.\n\nملخص المنسق: ${truncateText(response.text, 1800)}`,
      summary: 'تعذر قراءة تنسيق المنسق، فتم تحويل الرد إلى تعليمات تنفيذية آمنة.',
      blocker: '',
      acceptance: [],
      model: response.model,
      fallback: response.fallback
    };
  }
}

export { parseCoordinatorJson };
