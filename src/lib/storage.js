const SETTINGS_KEY = 'project-agent.settings';
const PROJECTS_KEY = 'project-agent.projects';
const ACTIVE_PROJECT_KEY = 'project-agent.active-project';
const PENDING_PROMPT_KEY = 'project-agent.pending-prompt';

export const DEFAULT_SETTINGS = Object.freeze({
  apiKey: '',
  model: 'gemini-3.7-flash',
  fallbackModel: 'gemini-3.5-flash',
  temperature: 0.35,
  thinkingLevel: 'medium',
  webSearch: true,
  urlContext: true,
  codeExecution: false,
  streaming: true,
  includePageContext: true,
  includeSelection: true,
  agentMode: 'project'
});

function hasChromeStorage() {
  return Boolean(globalThis.chrome?.storage?.local);
}

function makeId(prefix = 'id') {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function createProject(name = 'مشروعي الجديد', brief = '') {
  return {
    id: makeId('project'),
    name: String(name).trim() || 'مشروعي الجديد',
    brief: String(brief).trim(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    messages: []
  };
}

export function normalizeSettings(settings = {}) {
  const temperature = Number(settings.temperature);
  const thinkingLevel = ['low', 'medium', 'high'].includes(settings.thinkingLevel)
    ? settings.thinkingLevel
    : DEFAULT_SETTINGS.thinkingLevel;

  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    apiKey: typeof settings.apiKey === 'string' ? settings.apiKey.trim() : '',
    model: typeof settings.model === 'string' && settings.model.trim()
      ? settings.model.trim()
      : DEFAULT_SETTINGS.model,
    fallbackModel: typeof settings.fallbackModel === 'string' && settings.fallbackModel.trim()
      ? settings.fallbackModel.trim()
      : DEFAULT_SETTINGS.fallbackModel,
    temperature: Number.isFinite(temperature)
      ? Math.min(1, Math.max(0.1, temperature))
      : DEFAULT_SETTINGS.temperature,
    thinkingLevel,
    webSearch: settings.webSearch !== false,
    urlContext: settings.urlContext !== false,
    codeExecution: settings.codeExecution === true,
    streaming: settings.streaming !== false,
    includePageContext: settings.includePageContext !== false,
    includeSelection: settings.includeSelection !== false,
    agentMode: ['project', 'developer', 'reviewer', 'content'].includes(settings.agentMode)
      ? settings.agentMode
      : DEFAULT_SETTINGS.agentMode
  };
}

function normalizeSource(source) {
  if (!source || typeof source !== 'object') return null;
  const url = String(source.url || source.uri || '').trim();
  if (!/^https?:\/\//i.test(url)) return null;
  return {
    title: String(source.title || url).slice(0, 240),
    url: url.slice(0, 2000),
    kind: ['page', 'search', 'url', 'document'].includes(source.kind) ? source.kind : 'search'
  };
}

function normalizeMessage(message) {
  if (!message || !['user', 'assistant'].includes(message.role)) return null;
  const sources = Array.isArray(message.sources)
    ? message.sources.map(normalizeSource).filter(Boolean).slice(0, 12)
    : [];

  return {
    id: message.id || makeId('message'),
    role: message.role,
    content: String(message.content || '').slice(0, 24000),
    createdAt: Number(message.createdAt) || Date.now(),
    kind: ['error', 'partial'].includes(message.kind) ? message.kind : 'normal',
    hasContext: Boolean(message.hasContext),
    sources,
    meta: message.meta && typeof message.meta === 'object'
      ? {
        model: String(message.meta.model || '').slice(0, 120),
        tools: Array.isArray(message.meta.tools) ? message.meta.tools.map(String).slice(0, 8) : [],
        queries: Array.isArray(message.meta.queries) ? message.meta.queries.map(String).slice(0, 8) : [],
        streamed: Boolean(message.meta.streamed),
        fallback: Boolean(message.meta.fallback),
        toolFallback: Boolean(message.meta.toolFallback)
      }
      : null
  };
}

function normalizeProject(project) {
  if (!project || typeof project !== 'object') return null;
  const messages = Array.isArray(project.messages)
    ? project.messages.map(normalizeMessage).filter(Boolean).slice(-100)
    : [];

  return {
    id: String(project.id || makeId('project')),
    name: String(project.name || 'مشروع بلا اسم').slice(0, 100),
    brief: String(project.brief || '').slice(0, 3000),
    createdAt: Number(project.createdAt) || Date.now(),
    updatedAt: Number(project.updatedAt) || Date.now(),
    messages
  };
}

function readFallback(key, fallback) {
  try {
    const value = globalThis.localStorage?.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function writeFallback(entries) {
  try {
    Object.entries(entries).forEach(([key, value]) => {
      globalThis.localStorage?.setItem(key, JSON.stringify(value));
    });
  } catch {
    // A private browsing context may disallow localStorage. The extension still works in memory.
  }
}

export async function loadAppState() {
  let raw;
  if (hasChromeStorage()) {
    raw = await chrome.storage.local.get([
      SETTINGS_KEY,
      PROJECTS_KEY,
      ACTIVE_PROJECT_KEY
    ]);
  } else {
    raw = {
      [SETTINGS_KEY]: readFallback(SETTINGS_KEY, null),
      [PROJECTS_KEY]: readFallback(PROJECTS_KEY, null),
      [ACTIVE_PROJECT_KEY]: readFallback(ACTIVE_PROJECT_KEY, null)
    };
  }

  let projects = Array.isArray(raw[PROJECTS_KEY])
    ? raw[PROJECTS_KEY].map(normalizeProject).filter(Boolean)
    : [];
  if (!projects.length) projects = [createProject()];

  const requestedActiveId = raw[ACTIVE_PROJECT_KEY];
  const activeProjectId = projects.some((project) => project.id === requestedActiveId)
    ? requestedActiveId
    : projects[0].id;

  return {
    settings: normalizeSettings(raw[SETTINGS_KEY] || {}),
    projects,
    activeProjectId
  };
}

export async function saveAppState({ settings, projects, activeProjectId }) {
  const values = {
    [SETTINGS_KEY]: normalizeSettings(settings),
    [PROJECTS_KEY]: projects,
    [ACTIVE_PROJECT_KEY]: activeProjectId
  };

  if (hasChromeStorage()) {
    await chrome.storage.local.set(values);
  } else {
    writeFallback(values);
  }
}

export async function loadPendingPrompt() {
  if (hasChromeStorage()) {
    const result = await chrome.storage.local.get(PENDING_PROMPT_KEY);
    return result[PENDING_PROMPT_KEY] || null;
  }
  return readFallback(PENDING_PROMPT_KEY, null);
}

export async function clearPendingPrompt() {
  if (hasChromeStorage()) {
    await chrome.storage.local.remove(PENDING_PROMPT_KEY);
  } else {
    try {
      globalThis.localStorage?.removeItem(PENDING_PROMPT_KEY);
    } catch {
      // Ignore storage errors in preview mode.
    }
  }
}

export { makeId };
