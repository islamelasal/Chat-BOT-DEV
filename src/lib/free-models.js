export const FREE_MODEL_CATALOG = Object.freeze({
  gemini: [
    { id: 'gemini-3.7-flash', label: 'Gemini 3.7 Flash · حديث', free: true },
    { id: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash', free: true },
    { id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash', free: true },
    { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite', free: true },
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', free: true },
    { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite · اقتصادي', free: true }
  ],
  openrouter: [
    { id: 'meta-llama/llama-3.3-70b-instruct:free', label: 'Llama 3.3 70B · مجاني', free: true },
    { id: 'meta-llama/llama-3.1-8b-instruct:free', label: 'Llama 3.1 8B · مجاني', free: true },
    { id: 'google/gemma-3-27b-it:free', label: 'Gemma 3 27B · مجاني', free: true },
    { id: 'mistralai/mistral-7b-instruct:free', label: 'Mistral 7B · مجاني', free: true }
  ],
  groq: [
    { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B · Groq Free Tier', free: true },
    { id: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B · Groq Free Tier', free: true },
    { id: 'gemma2-9b-it', label: 'Gemma 2 9B · Groq Free Tier', free: true }
  ]
});

export const PROVIDER_LABELS = Object.freeze({
  gemini: 'Google AI Studio',
  openrouter: 'OpenRouter',
  groq: 'Groq'
});

export function providerModels(provider) {
  return FREE_MODEL_CATALOG[provider] || [];
}

export function providerLabel(provider) {
  return PROVIDER_LABELS[provider] || provider;
}

export function defaultModel(provider) {
  return providerModels(provider)[0]?.id || '';
}

export function isFreeModel(provider, model, dynamicOpenRouterModels = []) {
  const id = String(model || '').trim();
  if (!id) return false;
  if (provider === 'openrouter') {
    if (id.endsWith(':free')) return true;
    return dynamicOpenRouterModels.some((item) => item.id === id && item.free === true);
  }
  return providerModels(provider).some((item) => item.id === id && item.free);
}

export function assertFreeModel(provider, model, dynamicOpenRouterModels = []) {
  if (!isFreeModel(provider, model, dynamicOpenRouterModels)) {
    const error = new Error(`تم حظر النموذج ${model} لأنه غير موجود في قائمة النماذج المجانية للمزود ${providerLabel(provider)}.`);
    error.name = 'PaidModelBlockedError';
    error.code = 'PAID_MODEL_BLOCKED';
    error.provider = provider;
    error.model = model;
    throw error;
  }
  return true;
}

export async function discoverOpenRouterFreeModels({ signal } = {}) {
  try {
    const response = await fetch('https://openrouter.ai/api/v1/models', { signal });
    if (!response.ok) return [];
    const payload = await response.json();
    return (payload?.data || [])
      .filter((model) => {
        const prompt = Number(model?.pricing?.prompt);
        const completion = Number(model?.pricing?.completion);
        return model?.id?.endsWith(':free') || (prompt === 0 && completion === 0);
      })
      .map((model) => ({
        id: String(model.id),
        label: `${String(model.name || model.id)} · مجاني الآن`,
        free: true,
        contextLength: Number(model.context_length) || 0
      }))
      .filter((model, index, list) => list.findIndex((item) => item.id === model.id) === index)
      .slice(0, 60);
  } catch {
    return [];
  }
}

export function configuredProviders(settings = {}) {
  const keys = {
    gemini: String(settings.apiKey || settings.geminiApiKey || '').trim(),
    openrouter: String(settings.openRouterApiKey || '').trim(),
    groq: String(settings.groqApiKey || '').trim()
  };
  return Object.keys(keys).filter((provider) => keys[provider]);
}

export function hasConfiguredProvider(settings = {}) {
  return configuredProviders(settings).length > 0;
}
