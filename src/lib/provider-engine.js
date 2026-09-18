import { generateGeminiResponse, streamGeminiResponse } from './gemini-client.js';
import { generateCompatibleResponse, streamCompatibleResponse } from './openai-compatible-client.js';
import {
  configuredProviders,
  defaultModel,
  hasConfiguredProvider,
  isFreeModel,
  providerLabel
} from './free-models.js';

const PROVIDER_ORDER = ['gemini', 'openrouter', 'groq'];

export class ProviderEngineError extends Error {
  constructor(message, { code = 'PROVIDER_ERROR', provider = '', model = '', errors = [] } = {}) {
    super(message);
    this.name = 'ProviderEngineError';
    this.code = code;
    this.provider = provider;
    this.model = model;
    this.errors = errors;
  }
}

function providerKey(settings, provider) {
  return {
    gemini: String(settings.apiKey || settings.geminiApiKey || '').trim(),
    openrouter: String(settings.openRouterApiKey || '').trim(),
    groq: String(settings.groqApiKey || '').trim()
  }[provider];
}

function providerModel(settings, provider) {
  return {
    gemini: String(settings.model || defaultModel('gemini')).trim(),
    openrouter: String(settings.openRouterModel || defaultModel('openrouter')).trim(),
    groq: String(settings.groqModel || defaultModel('groq')).trim()
  }[provider];
}

function providerCandidates(settings, dynamicOpenRouterModels = []) {
  const configured = configuredProviders(settings);
  if (!configured.length) {
    throw new ProviderEngineError('لم تتم إضافة أي مفتاح لمزود مجاني. أضف Gemini أو OpenRouter أو Groq من الإعدادات.', {
      code: 'NO_PROVIDER_KEYS'
    });
  }

  const mode = ['auto', ...PROVIDER_ORDER].includes(settings.providerMode) ? settings.providerMode : 'auto';
  const priority = Array.isArray(settings.providerPriority)
    ? settings.providerPriority.filter((provider) => PROVIDER_ORDER.includes(provider))
    : PROVIDER_ORDER;
  const order = mode === 'auto' ? [...new Set([...priority, ...PROVIDER_ORDER])] : [mode];
  const candidates = [];
  const blocked = [];
  order.forEach((provider) => {
    const key = providerKey(settings, provider);
    if (!key) return;
    const model = providerModel(settings, provider);
    // Free-tier mode is a hard safety invariant. Never send a paid model,
    // even if a stale or tampered setting tries to disable the guard.
    if (!isFreeModel(provider, model, dynamicOpenRouterModels)) {
      blocked.push(`${providerLabel(provider)}: ${model}`);
      return;
    }
    candidates.push({ provider, key, model });
  });
  if (!candidates.length) {
    throw new ProviderEngineError(
      blocked.length
        ? `تم حظر النماذج التالية لأنها ليست مثبتة كمجانية: ${blocked.join('، ')}.`
        : 'لا يوجد مزود مجاني مهيأ لهذا الاختيار.',
      { code: blocked.length ? 'PAID_MODEL_BLOCKED' : 'NO_PROVIDER_KEYS' }
    );
  }
  return candidates;
}

function isRecoverable(error) {
  return error?.code === 'RATE_LIMIT' ||
    error?.code === 'SERVICE_BUSY' ||
    error?.code === 'INVALID_MODEL' ||
    error?.code === 'PAID_MODEL' ||
    error?.code === 'INVALID_KEY' ||
    error?.code === 'NETWORK_ERROR';
}

async function callProvider({ candidate, settings, systemInstruction, messages, signal, onDelta, stream }) {
  const common = {
    apiKey: candidate.key,
    model: candidate.model,
    systemInstruction,
    messages,
    temperature: settings.temperature,
    maxOutputTokens: settings.maxOutputTokens,
    signal
  };

  let response;
  if (candidate.provider === 'gemini') {
    const geminiSettings = {
      ...settings,
      apiKey: candidate.key,
      model: candidate.model,
      fallbackModel: '',
      // Free providers other than Gemini cannot execute these tools. Gemini
      // retains the user's explicit tool preferences.
      streaming: stream
    };
    response = stream
      ? await streamGeminiResponse({ ...common, settings: geminiSettings, onDelta })
      : await generateGeminiResponse({ ...common, settings: geminiSettings });
  } else {
    response = stream
      ? await streamCompatibleResponse({ provider: candidate.provider, ...common, onDelta })
      : await generateCompatibleResponse({ provider: candidate.provider, ...common });
  }

  return {
    ...response,
    provider: candidate.provider,
    providerLabel: providerLabel(candidate.provider),
    model: candidate.model,
    freeTier: true
  };
}

async function run({ settings, systemInstruction, messages, signal, onDelta, stream }) {
  const dynamicModels = Array.isArray(settings.openRouterFreeModels) ? settings.openRouterFreeModels : [];
  const candidates = providerCandidates(settings, dynamicModels);
  const errors = [];

  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    try {
      const response = await callProvider({ candidate, settings, systemInstruction, messages, signal, onDelta, stream });
      response.fallback = index > 0;
      response.fallbackFrom = index > 0 ? candidates.slice(0, index).map((item) => item.provider) : [];
      response.providerErrors = errors.map((item) => ({ provider: item.provider, code: item.code }));
      return response;
    } catch (error) {
      if (error && typeof error === 'object') {
        if (!error.provider) error.provider = candidate.provider;
        if (!error.model) error.model = candidate.model;
      }
      errors.push({ provider: candidate.provider, model: candidate.model, code: error.code || 'API_ERROR', message: error.message });
      if (!settings.autoFallback || settings.providerMode !== 'auto' || !isRecoverable(error)) throw error;
    }
  }

  const last = errors[errors.length - 1];
  throw new ProviderEngineError(
    `تعذر استخدام مزودي النماذج المجانية. آخر خطأ من ${providerLabel(last?.provider)}: ${last?.message || 'خطأ غير معروف'}`,
    { code: last?.code || 'ALL_PROVIDERS_FAILED', provider: last?.provider || '', model: last?.model || '', errors }
  );
}

export async function generateAgentResponse({ settings = {}, systemInstruction, messages, signal }) {
  return run({ settings, systemInstruction, messages, signal, stream: false });
}

export async function streamAgentResponse({ settings = {}, systemInstruction, messages, signal, onDelta }) {
  return run({ settings, systemInstruction, messages, signal, onDelta, stream: true });
}

export { hasConfiguredProvider, providerKey, providerModel, providerCandidates };
