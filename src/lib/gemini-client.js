const GEMINI_API_ROOT = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_MODEL = 'gemini-3.7-flash';

export class GeminiApiError extends Error {
  constructor(message, { status = 0, code = 'API_ERROR', details = '', model = '' } = {}) {
    super(message);
    this.name = 'GeminiApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.model = model;
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

function buildTools(settings = {}) {
  if (settings._disableTools) return [];
  const tools = [];
  if (settings.webSearch) tools.push({ googleSearch: {} });
  if (settings.urlContext) tools.push({ urlContext: {} });
  if (settings.codeExecution) tools.push({ codeExecution: {} });
  return tools;
}

function buildThinkingConfig(model, level = 'medium') {
  const safeLevel = ['low', 'medium', 'high'].includes(level) ? level : 'medium';
  if (/^gemini-3(?:\.|-|$)/i.test(model)) {
    // Gemini 3.7 Flash supports low, medium and high. The model chooses the
    // exact token budget dynamically inside the selected level.
    return { thinkingLevel: safeLevel };
  }
  if (/^gemini-2\.5/i.test(model)) {
    // Gemini 2.5 uses a token budget instead of thinkingLevel.
    return { thinkingBudget: safeLevel === 'low' ? 512 : safeLevel === 'medium' ? 1024 : -1 };
  }
  return null;
}

function buildRequestBody({ model, systemInstruction, messages, settings = {} }) {
  const generationConfig = {
    temperature: Math.min(1, Math.max(0.1, Number(settings.temperature) || 0.35)),
    topP: 0.9,
    maxOutputTokens: Math.min(16384, Math.max(512, Number(settings.maxOutputTokens) || 4096))
  };
  const thinkingConfig = buildThinkingConfig(model, settings.thinkingLevel);
  if (thinkingConfig) generationConfig.thinkingConfig = thinkingConfig;

  const body = {
    systemInstruction: {
      parts: [{ text: String(systemInstruction || '') }]
    },
    contents: toGeminiContents(messages),
    generationConfig,
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' }
    ]
  };
  const tools = buildTools(settings);
  if (tools.length) body.tools = tools;
  return body;
}

function getErrorMessage(payload) {
  const message = payload?.error?.message || payload?.message;
  return typeof message === 'string' ? message : '';
}

function classifyError(status) {
  if (status === 400) return 'BAD_REQUEST';
  if (status === 401 || status === 403) return 'INVALID_KEY';
  if (status === 404) return 'INVALID_MODEL';
  if (status === 429) return 'RATE_LIMIT';
  if (status === 503) return 'SERVICE_BUSY';
  return 'API_ERROR';
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function fetchApi({ model, body, stream, apiKey, signal }) {
  const action = stream ? 'streamGenerateContent?alt=sse' : 'generateContent';
  const endpoint = `${GEMINI_API_ROOT}/${encodeURIComponent(model)}:${action}`;
  let response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Keep credentials out of the URL. This is the current Google API
        // convention and prevents accidental key leakage in copied URLs.
        'x-goog-api-key': String(apiKey).trim()
      },
      body: JSON.stringify(body),
      signal
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    throw new GeminiApiError('تعذر الاتصال بخدمة Gemini. تحقق من الاتصال بالإنترنت.', {
      code: 'NETWORK_ERROR',
      details: error?.message || '',
      model
    });
  }

  if (!response.ok) {
    const payload = await readJson(response);
    const providerMessage = getErrorMessage(payload);
    throw new GeminiApiError(providerMessage || `فشل الطلب برمز ${response.status}.`, {
      status: response.status,
      code: classifyError(response.status),
      details: providerMessage,
      model
    });
  }
  return response;
}

function normalizeSource(source, kind = 'search') {
  const url = String(source?.url || source?.uri || '').trim();
  if (!/^https?:\/\//i.test(url)) return null;
  return {
    title: String(source?.title || url).slice(0, 240),
    url: url.slice(0, 2000),
    kind: ['page', 'search', 'url', 'document'].includes(kind) ? kind : 'search'
  };
}

function collectMetadata(payload, sourceMap, metadata) {
  const candidate = payload?.candidates?.[0];
  const grounding = candidate?.groundingMetadata;
  const chunks = grounding?.groundingChunks || [];
  chunks.forEach((chunk) => {
    const source = normalizeSource(chunk?.web, 'search');
    if (source) sourceMap.set(source.url, source);
  });
  (grounding?.webSearchQueries || []).forEach((query) => {
    if (query && !metadata.queries.includes(query)) metadata.queries.push(String(query));
  });

  const urlMetadata = payload?.urlContextMetadata?.urlMetadata || payload?.url_context_metadata?.url_metadata || [];
  urlMetadata.forEach((item) => {
    const source = normalizeSource({
      url: item?.retrievedUrl || item?.url,
      title: item?.title || item?.retrievedUrl || item?.url
    }, 'url');
    if (source) sourceMap.set(source.url, source);
  });

  const parts = candidate?.content?.parts || [];
  parts.forEach((part) => {
    if (part?.executableCode || part?.codeExecutionResult || part?.code_execution_call || part?.code_execution_result) {
      metadata.tools.push('code_execution');
    }
  });
  if (grounding) metadata.tools.push('google_search');
  if (urlMetadata.length) metadata.tools.push('url_context');
  if (payload?.usageMetadata) metadata.usage = payload.usageMetadata;
}

function textFromPayload(payload) {
  const parts = payload?.candidates?.[0]?.content?.parts || [];
  return parts
    .filter((part) => part?.thought !== true)
    .map((part) => part?.text || '')
    .join('');
}

function finishResult({ text, model, sourceMap, metadata, fallback = false }) {
  const cleanText = String(text || '').trim();
  if (!cleanText) {
    const reason = metadata.finishReason;
    throw new GeminiApiError(
      reason === 'SAFETY'
        ? 'حجبت خدمة Gemini هذا الرد بسبب إعدادات السلامة.'
        : 'وصل رد فارغ من Gemini. حاول صياغة الطلب بطريقة مختلفة.',
      { code: 'EMPTY_RESPONSE', details: reason || '', model }
    );
  }
  return {
    text: cleanText,
    model,
    sources: Array.from(sourceMap.values()).slice(0, 12),
    queries: metadata.queries.slice(0, 8),
    tools: [...new Set(metadata.tools)],
    usage: metadata.usage || null,
    fallback
  };
}

function modelsToTry({ model, fallbackModel, autoFallback = true }) {
  const values = [String(model || DEFAULT_MODEL).trim()];
  if (autoFallback && fallbackModel) values.push(String(fallbackModel).trim());
  return [...new Set(values.filter(Boolean))];
}

function canRetryWithoutTools(error, settings) {
  return error instanceof GeminiApiError &&
    error.code === 'BAD_REQUEST' &&
    !settings?._disableTools &&
    buildTools(settings).length > 0;
}

async function requestOnce({ apiKey, model, systemInstruction, messages, settings, signal }) {
  const response = await fetchApi({
    model,
    body: buildRequestBody({ model, systemInstruction, messages, settings }),
    stream: false,
    apiKey,
    signal
  });
  const payload = await readJson(response);
  const sourceMap = new Map();
  const metadata = {
    queries: [],
    tools: [],
    usage: null,
    finishReason: payload?.candidates?.[0]?.finishReason
  };
  collectMetadata(payload, sourceMap, metadata);
  return finishResult({
    text: textFromPayload(payload),
    model,
    sourceMap,
    metadata
  });
}

async function streamOnce({ apiKey, model, systemInstruction, messages, settings, signal, onDelta }) {
  const response = await fetchApi({
    model,
    body: buildRequestBody({ model, systemInstruction, messages, settings }),
    stream: true,
    apiKey,
    signal
  });

  if (!response.body) return requestOnce({ apiKey, model, systemInstruction, messages, settings, signal });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const sourceMap = new Map();
  const metadata = { queries: [], tools: [], usage: null, finishReason: '' };
  let buffer = '';
  let text = '';

  const handleEvent = (eventText) => {
    const data = eventText
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim())
      .join('');
    if (!data || data === '[DONE]') return;
    let payload;
    try {
      payload = JSON.parse(data);
    } catch {
      return;
    }
    collectMetadata(payload, sourceMap, metadata);
    metadata.finishReason = payload?.candidates?.[0]?.finishReason || metadata.finishReason;
    const incoming = textFromPayload(payload);
    if (!incoming) return;
    // Some proxies return cumulative text, while the native endpoint returns
    // deltas. Support both without duplicating the visible answer.
    const delta = incoming.startsWith(text) ? incoming.slice(text.length) : incoming;
    if (!delta) return;
    text += delta;
    if (typeof onDelta === 'function') onDelta(delta, { model });
  };

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const events = buffer.split(/\r?\n\r?\n/);
    buffer = events.pop() || '';
    events.forEach(handleEvent);
    if (done) break;
  }
  if (buffer.trim()) handleEvent(buffer);

  return finishResult({ text, model, sourceMap, metadata });
}

export async function generateGeminiResponse({
  apiKey,
  model = DEFAULT_MODEL,
  fallbackModel = '',
  autoFallback = true,
  systemInstruction,
  messages,
  settings = {},
  signal
}) {
  const cleanKey = String(apiKey || '').trim();
  if (!cleanKey) throw new GeminiApiError('لم تتم إضافة مفتاح Gemini بعد.', { code: 'MISSING_KEY' });

  let lastError;
  const candidates = modelsToTry({ model, fallbackModel, autoFallback });
  for (let index = 0; index < candidates.length; index += 1) {
    const currentModel = candidates[index];
    try {
      const result = await requestOnce({
        apiKey: cleanKey,
        model: currentModel,
        systemInstruction,
        messages,
        settings,
        signal
      });
      result.fallback = index > 0;
      return result;
    } catch (error) {
      if (canRetryWithoutTools(error, settings)) {
        const result = await requestOnce({
          apiKey: cleanKey,
          model: currentModel,
          systemInstruction,
          messages,
          settings: { ...settings, _disableTools: true },
          signal
        });
        result.fallback = index > 0;
        result.toolFallback = true;
        return result;
      }
      lastError = error;
      if (!(error instanceof GeminiApiError) || error.code !== 'INVALID_MODEL' || index === candidates.length - 1) throw error;
    }
  }
  throw lastError;
}

export async function streamGeminiResponse({
  apiKey,
  model = DEFAULT_MODEL,
  fallbackModel = '',
  autoFallback = true,
  systemInstruction,
  messages,
  settings = {},
  signal,
  onDelta
}) {
  const cleanKey = String(apiKey || '').trim();
  if (!cleanKey) throw new GeminiApiError('لم تتم إضافة مفتاح Gemini بعد.', { code: 'MISSING_KEY' });

  let lastError;
  const candidates = modelsToTry({ model, fallbackModel, autoFallback });
  for (let index = 0; index < candidates.length; index += 1) {
    try {
      const result = await streamOnce({
        apiKey: cleanKey,
        model: candidates[index],
        systemInstruction,
        messages,
        settings,
        signal,
        onDelta
      });
      result.fallback = index > 0;
      return result;
    } catch (error) {
      if (canRetryWithoutTools(error, settings)) {
        const result = await streamOnce({
          apiKey: cleanKey,
          model: candidates[index],
          systemInstruction,
          messages,
          settings: { ...settings, _disableTools: true },
          signal,
          onDelta
        });
        result.fallback = index > 0;
        result.toolFallback = true;
        return result;
      }
      lastError = error;
      if (!(error instanceof GeminiApiError) || error.code !== 'INVALID_MODEL' || index === candidates.length - 1) throw error;
    }
  }
  throw lastError;
}

export { buildTools, buildThinkingConfig };
