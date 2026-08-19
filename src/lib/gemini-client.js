const GEMINI_API_ROOT = 'https://generativelanguage.googleapis.com/v1beta/models';

export class GeminiApiError extends Error {
  constructor(message, { status = 0, code = 'API_ERROR', details = '' } = {}) {
    super(message);
    this.name = 'GeminiApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function toGeminiContents(messages) {
  return messages
    .filter((message) => message && ['user', 'assistant'].includes(message.role))
    .map((message) => ({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: String(message.content || '') }]
    }))
    .filter((message) => message.parts[0].text.trim());
}

function getErrorMessage(payload) {
  const message = payload?.error?.message || payload?.message;
  return typeof message === 'string' ? message : '';
}

export async function generateGeminiResponse({
  apiKey,
  model = 'gemini-2.5-flash',
  systemInstruction,
  messages,
  temperature = 0.35,
  maxOutputTokens = 4096,
  signal
}) {
  const cleanKey = String(apiKey || '').trim();
  const cleanModel = String(model || '').trim();
  if (!cleanKey) {
    throw new GeminiApiError('لم تتم إضافة مفتاح Gemini بعد.', {
      code: 'MISSING_KEY'
    });
  }
  if (!cleanModel) {
    throw new GeminiApiError('اسم النموذج غير صحيح.', { code: 'INVALID_MODEL' });
  }

  const endpoint = `${GEMINI_API_ROOT}/${encodeURIComponent(cleanModel)}:generateContent?key=${encodeURIComponent(cleanKey)}`;
  const body = {
    systemInstruction: {
      parts: [{ text: String(systemInstruction || '') }]
    },
    contents: toGeminiContents(messages),
    generationConfig: {
      temperature: Math.min(1, Math.max(0.1, Number(temperature) || 0.35)),
      topP: 0.9,
      maxOutputTokens
    },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' }
    ]
  };

  let response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    throw new GeminiApiError('تعذر الاتصال بخدمة Gemini. تحقق من الاتصال بالإنترنت.', {
      code: 'NETWORK_ERROR',
      details: error?.message || ''
    });
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    // The status below is enough to provide a useful error to the user.
  }

  if (!response.ok) {
    const providerMessage = getErrorMessage(payload);
    let code = 'API_ERROR';
    if (response.status === 400) code = 'BAD_REQUEST';
    if (response.status === 401 || response.status === 403) code = 'INVALID_KEY';
    if (response.status === 404) code = 'INVALID_MODEL';
    if (response.status === 429) code = 'RATE_LIMIT';

    throw new GeminiApiError(providerMessage || `فشل الطلب برمز ${response.status}.`, {
      status: response.status,
      code,
      details: providerMessage
    });
  }

  const parts = payload?.candidates?.[0]?.content?.parts || [];
  const text = parts
    .filter((part) => part?.thought !== true)
    .map((part) => part?.text || '')
    .join('')
    .trim();
  if (!text) {
    const finishReason = payload?.candidates?.[0]?.finishReason;
    throw new GeminiApiError(
      finishReason === 'SAFETY'
        ? 'حجبت خدمة Gemini هذا الرد بسبب إعدادات السلامة.'
        : 'وصل رد فارغ من Gemini. حاول صياغة الطلب بطريقة مختلفة.',
      { code: 'EMPTY_RESPONSE', details: finishReason || '' }
    );
  }

  return text;
}
