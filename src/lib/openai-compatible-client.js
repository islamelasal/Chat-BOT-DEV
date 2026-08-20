const PROVIDER_ENDPOINTS = Object.freeze({
  openrouter: 'https://openrouter.ai/api/v1/chat/completions',
  groq: 'https://api.groq.com/openai/v1/chat/completions'
});

export class CompatibleApiError extends Error {
  constructor(message, { provider = '', status = 0, code = 'API_ERROR', details = '', model = '', retryAfterMs = 0 } = {}) {
    super(message);
    this.name = 'CompatibleApiError';
    this.provider = provider;
    this.status = status;
    this.code = code;
    this.details = details;
    this.model = model;
    this.retryAfterMs = Number(retryAfterMs) || 0;
  }
}

function toMessages({ systemInstruction = '', messages = [] }) {
  const result = [];
  if (systemInstruction) result.push({ role: 'system', content: String(systemInstruction) });
  messages
    .filter((message) => message && ['user', 'assistant'].includes(message.role) && message.content)
    .forEach((message) => result.push({
      role: message.role,
      content: String(message.content)
    }));
  return result;
}

function classify(status) {
  if (status === 401 || status === 403) return 'INVALID_KEY';
  if (status === 402) return 'PAID_MODEL';
  if (status === 404) return 'INVALID_MODEL';
  if (status === 408 || status === 409 || status === 429) return 'RATE_LIMIT';
  if (status >= 500) return 'SERVICE_BUSY';
  return 'API_ERROR';
}

function retryAfterMs(response) {
  const value = response.headers?.get('retry-after');
  if (!value) return 0;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? Math.max(0, timestamp - Date.now()) : 0;
}

async function parseJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function providerMessage(payload) {
  return payload?.error?.message || payload?.error?.metadata?.raw || payload?.message || '';
}

function extractText(payload) {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((part) => part?.text || '').join('');
  return '';
}

function result({ text, provider, model, payload, streamed = false }) {
  const cleanText = String(text || '').trim();
  if (!cleanText) {
    throw new CompatibleApiError('وصل رد فارغ من المزود.', {
      provider,
      model,
      code: 'EMPTY_RESPONSE'
    });
  }
  return {
    text: cleanText,
    provider,
    model,
    sources: [],
    queries: [],
    tools: [],
    usage: payload?.usage || null,
    streamed,
    fallback: false
  };
}

async function fetchProvider({ provider, apiKey, model, body, signal }) {
  const endpoint = PROVIDER_ENDPOINTS[provider];
  if (!endpoint) throw new CompatibleApiError('المزود غير مدعوم.', { provider, code: 'UNKNOWN_PROVIDER' });
  let response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${String(apiKey).trim()}`,
        ...(provider === 'openrouter'
          ? { 'X-Title': 'Project Agent Chrome Extension' }
          : {})
      },
      body: JSON.stringify(body),
      signal
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    throw new CompatibleApiError('تعذر الاتصال بالمزود. تحقق من الشبكة.', {
      provider,
      model,
      code: 'NETWORK_ERROR',
      details: error?.message || ''
    });
  }
  if (!response.ok) {
    const payload = await parseJson(response);
    throw new CompatibleApiError(providerMessage(payload) || `فشل الطلب برمز ${response.status}.`, {
      provider,
      model,
      status: response.status,
      code: classify(response.status),
      details: providerMessage(payload),
      retryAfterMs: retryAfterMs(response)
    });
  }
  return response;
}

async function readSse(response, { provider, model, onDelta }) {
  if (!response.body) {
    const payload = await parseJson(response);
    return result({ text: extractText(payload), provider, model, payload, streamed: false });
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  let usage = null;

  const handleEvent = (event) => {
    const data = event.split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim())
      .join('');
    if (!data || data === '[DONE]') return;
    let payload;
    try { payload = JSON.parse(data); } catch { return; }
    usage = payload?.usage || usage;
    const incoming = payload?.choices?.[0]?.delta?.content || payload?.choices?.[0]?.message?.content || '';
    if (!incoming) return;
    const delta = incoming.startsWith(text) ? incoming.slice(text.length) : incoming;
    if (!delta) return;
    text += delta;
    if (typeof onDelta === 'function') onDelta(delta, { provider, model });
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
  return result({ text, provider, model, payload: { usage }, streamed: true });
}

export async function generateCompatibleResponse({
  provider,
  apiKey,
  model,
  systemInstruction,
  messages,
  temperature = 0.25,
  maxOutputTokens = 4096,
  signal
}) {
  const body = {
    model,
    messages: toMessages({ systemInstruction, messages }),
    temperature: Math.min(1, Math.max(0, Number(temperature) || 0.25)),
    max_tokens: Math.min(8192, Math.max(256, Number(maxOutputTokens) || 4096)),
    stream: false
  };
  const response = await fetchProvider({ provider, apiKey, model, body, signal });
  const payload = await parseJson(response);
  return result({ text: extractText(payload), provider, model, payload, streamed: false });
}

export async function streamCompatibleResponse({
  provider,
  apiKey,
  model,
  systemInstruction,
  messages,
  temperature = 0.25,
  maxOutputTokens = 4096,
  signal,
  onDelta
}) {
  const body = {
    model,
    messages: toMessages({ systemInstruction, messages }),
    temperature: Math.min(1, Math.max(0, Number(temperature) || 0.25)),
    max_tokens: Math.min(8192, Math.max(256, Number(maxOutputTokens) || 4096)),
    stream: true
  };
  const response = await fetchProvider({ provider, apiKey, model, body, signal });
  return readSse(response, { provider, model, onDelta });
}

export { PROVIDER_ENDPOINTS };
