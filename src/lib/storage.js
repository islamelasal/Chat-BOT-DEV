const SETTINGS_KEY = 'project-agent.settings';
const PROJECTS_KEY = 'project-agent.projects';
const ACTIVE_PROJECT_KEY = 'project-agent.active-project';
const TAB_SESSIONS_KEY = 'project-agent.tab-sessions';
const PENDING_PROMPT_KEY = 'project-agent.pending-prompt';

export const DEFAULT_SETTINGS = Object.freeze({
  settingsVersion: 3,
  apiKey: '',
  geminiApiKey: '',
  openRouterApiKey: '',
  groqApiKey: '',
  providerMode: 'auto',
  autoFallback: true,
  freeOnly: true,
  providerPriority: ['gemini', 'openrouter', 'groq'],
  model: 'gemini-3.7-flash',
  fallbackModel: 'gemini-3.5-flash-lite',
  openRouterModel: 'meta-llama/llama-3.3-70b-instruct:free',
  groqModel: 'llama-3.3-70b-versatile',
  openRouterFreeModels: [],
  temperature: 0.35,
  thinkingLevel: 'medium',
  webSearch: false,
  urlContext: false,
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

export function createProject(name = 'مشروعي الجديد', brief = '', scopeId = '') {
  return {
    id: makeId('project'),
    scopeId: String(scopeId || ''),
    name: String(name).trim() || 'مشروعي الجديد',
    brief: String(brief).trim(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    externalChat: null,
    messages: []
  };
}

export function normalizeSettings(settings = {}) {
  const temperature = Number(settings.temperature);
  const version = Number(settings.settingsVersion || 0);
  const isLegacySettings = version < DEFAULT_SETTINGS.settingsVersion;
  const thinkingLevel = ['low', 'medium', 'high'].includes(settings.thinkingLevel)
    ? settings.thinkingLevel
    : DEFAULT_SETTINGS.thinkingLevel;
  const apiKey = typeof settings.apiKey === 'string' ? settings.apiKey.trim() : '';
  const geminiApiKey = typeof settings.geminiApiKey === 'string' ? settings.geminiApiKey.trim() : '';
  const fallbackModel = typeof settings.fallbackModel === 'string' && settings.fallbackModel.trim()
    ? settings.fallbackModel.trim()
    : DEFAULT_SETTINGS.fallbackModel;
  const providerPriority = Array.isArray(settings.providerPriority)
    ? settings.providerPriority.filter((provider) => ['gemini', 'openrouter', 'groq'].includes(provider))
    : DEFAULT_SETTINGS.providerPriority;
  const freeModels = Array.isArray(settings.openRouterFreeModels)
    ? settings.openRouterFreeModels
      .filter((model) => model && typeof model.id === 'string' && model.free === true)
      .map((model) => ({ id: model.id.slice(0, 200), label: String(model.label || model.id).slice(0, 240), free: true }))
      .slice(0, 60)
    : [];

  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    settingsVersion: DEFAULT_SETTINGS.settingsVersion,
    apiKey: apiKey || geminiApiKey,
    geminiApiKey: geminiApiKey || apiKey,
    openRouterApiKey: typeof settings.openRouterApiKey === 'string' ? settings.openRouterApiKey.trim() : '',
    groqApiKey: typeof settings.groqApiKey === 'string' ? settings.groqApiKey.trim() : '',
    providerMode: ['auto', 'gemini', 'openrouter', 'groq'].includes(settings.providerMode)
      ? settings.providerMode
      : DEFAULT_SETTINGS.providerMode,
    autoFallback: settings.autoFallback !== false,
    freeOnly: true,
    providerPriority: providerPriority.length ? providerPriority : DEFAULT_SETTINGS.providerPriority,
    model: typeof settings.model === 'string' && settings.model.trim() ? settings.model.trim() : DEFAULT_SETTINGS.model,
    fallbackModel: isLegacySettings && fallbackModel === 'gemini-3.5-flash'
      ? DEFAULT_SETTINGS.fallbackModel
      : fallbackModel,
    openRouterModel: typeof settings.openRouterModel === 'string' && settings.openRouterModel.trim()
      ? settings.openRouterModel.trim()
      : DEFAULT_SETTINGS.openRouterModel,
    groqModel: typeof settings.groqModel === 'string' && settings.groqModel.trim()
      ? settings.groqModel.trim()
      : DEFAULT_SETTINGS.groqModel,
    openRouterFreeModels: freeModels,
    temperature: Number.isFinite(temperature) ? Math.min(1, Math.max(0.1, temperature)) : DEFAULT_SETTINGS.temperature,
    thinkingLevel,
    // Previous builds only had Gemini and enabled tools by default. Migrate
    // once to an explicit provider/free-tier-safe configuration.
    webSearch: isLegacySettings ? false : settings.webSearch === true,
    urlContext: isLegacySettings ? false : settings.urlContext === true,
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
  const sources = Array.isArray(message.sources) ? message.sources.map(normalizeSource).filter(Boolean).slice(0, 12) : [];
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
        provider: String(message.meta.provider || '').slice(0, 40),
        providerLabel: String(message.meta.providerLabel || '').slice(0, 100),
        model: String(message.meta.model || '').slice(0, 160),
        tools: Array.isArray(message.meta.tools) ? message.meta.tools.map(String).slice(0, 8) : [],
        queries: Array.isArray(message.meta.queries) ? message.meta.queries.map(String).slice(0, 8) : [],
        streamed: Boolean(message.meta.streamed),
        fallback: Boolean(message.meta.fallback),
        toolFallback: Boolean(message.meta.toolFallback)
      }
      : null
  };
}

function normalizeExternalChat(chat) {
  if (!chat || typeof chat !== 'object') return null;
  const messages = Array.isArray(chat.messages)
    ? chat.messages
      .filter((message) => message && ['user', 'assistant'].includes(message.role))
      .map((message) => ({ role: message.role, content: String(message.content || '').slice(0, 10000) }))
      .filter((message) => message.content)
      .slice(-40)
    : [];
  if (!messages.length && !chat.provider) return null;
  return {
    provider: String(chat.provider || 'generic').slice(0, 40),
    providerLabel: String(chat.providerLabel || chat.provider || 'AI').slice(0, 100),
    url: String(chat.url || '').slice(0, 2000),
    title: String(chat.title || '').slice(0, 240),
    messages,
    updatedAt: Number(chat.updatedAt || chat.observedAt) || Date.now()
  };
}

function normalizeProject(project) {
  if (!project || typeof project !== 'object') return null;
  return {
    id: String(project.id || makeId('project')),
    scopeId: String(project.scopeId || ''),
    name: String(project.name || 'مشروع بلا اسم').slice(0, 100),
    brief: String(project.brief || '').slice(0, 3000),
    createdAt: Number(project.createdAt) || Date.now(),
    updatedAt: Number(project.updatedAt) || Date.now(),
    externalChat: normalizeExternalChat(project.externalChat),
    messages: Array.isArray(project.messages)
      ? project.messages.map(normalizeMessage).filter(Boolean).slice(-100)
      : []
  };
}

function cloneProjectForScope(seed, scopeId, scopeLabel = '') {
  const clone = normalizeProject(JSON.parse(JSON.stringify(seed || createProject(scopeLabel, '', scopeId))));
  clone.id = makeId('project');
  clone.scopeId = scopeId;
  clone.name = clone.name || (scopeLabel ? `مشروع ${scopeLabel}` : 'مشروعي الجديد');
  clone.createdAt = Date.now();
  clone.updatedAt = Date.now();
  return clone;
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
    Object.entries(entries).forEach(([key, value]) => globalThis.localStorage?.setItem(key, JSON.stringify(value)));
  } catch {
    // A private browsing context may disallow localStorage.
  }
}

async function readStorage(keys) {
  if (hasChromeStorage()) return chrome.storage.local.get(keys);
  return Object.fromEntries(keys.map((key) => [key, readFallback(key, null)]));
}

async function writeStorage(values) {
  if (hasChromeStorage()) return chrome.storage.local.set(values);
  writeFallback(values);
}

export async function loadAppState({ scopeId = '', scopeLabel = '' } = {}) {
  const raw = await readStorage([SETTINGS_KEY, PROJECTS_KEY, ACTIVE_PROJECT_KEY, TAB_SESSIONS_KEY]);
  let allProjects = Array.isArray(raw[PROJECTS_KEY]) ? raw[PROJECTS_KEY].map(normalizeProject).filter(Boolean) : [];
  if (!allProjects.length) allProjects = [createProject('مشروعي الجديد', '', scopeId)];

  let projects = allProjects;
  let activeProjectId = raw[ACTIVE_PROJECT_KEY];
  const sessions = raw[TAB_SESSIONS_KEY] && typeof raw[TAB_SESSIONS_KEY] === 'object' ? raw[TAB_SESSIONS_KEY] : {};

  // Every tab receives its own project copy and active selection. Existing
  // legacy projects are used as a seed but are never mutated by another tab.
  if (scopeId && scopeId !== 'global') {
    projects = allProjects.filter((project) => project.scopeId === scopeId);
    if (!projects.length) {
      const seed = allProjects.find((project) => !project.scopeId) || allProjects[0] || createProject(scopeLabel);
      const scopedProject = cloneProjectForScope(seed, scopeId, scopeLabel);
      projects = [scopedProject];
      allProjects.push(scopedProject);
      sessions[scopeId] = { activeProjectId: scopedProject.id, label: scopeLabel, projectIds: [scopedProject.id] };
      await writeStorage({ [PROJECTS_KEY]: allProjects, [TAB_SESSIONS_KEY]: sessions });
    }
    const session = sessions[scopeId];
    activeProjectId = session?.activeProjectId;
    if (!projects.some((project) => project.id === activeProjectId)) activeProjectId = projects[0].id;
  } else {
    if (!projects.length) projects = [createProject()];
    if (!projects.some((project) => project.id === activeProjectId)) activeProjectId = projects[0].id;
  }

  return {
    settings: normalizeSettings(raw[SETTINGS_KEY] || {}),
    projects,
    activeProjectId,
    scopeId,
    scopeLabel
  };
}

export async function saveAppState({ settings, projects, activeProjectId, scopeId = '', scopeLabel = '' }) {
  const normalizedSettings = normalizeSettings(settings);
  if (!scopeId || scopeId === 'global') {
    await writeStorage({
      [SETTINGS_KEY]: normalizedSettings,
      [PROJECTS_KEY]: projects,
      [ACTIVE_PROJECT_KEY]: activeProjectId
    });
    return;
  }

  const raw = await readStorage([PROJECTS_KEY, TAB_SESSIONS_KEY]);
  const allProjects = Array.isArray(raw[PROJECTS_KEY]) ? raw[PROJECTS_KEY].map(normalizeProject).filter(Boolean) : [];
  const preserved = allProjects.filter((project) => project.scopeId !== scopeId);
  const scoped = projects.map((project) => ({ ...project, scopeId }));
  const sessions = raw[TAB_SESSIONS_KEY] && typeof raw[TAB_SESSIONS_KEY] === 'object' ? raw[TAB_SESSIONS_KEY] : {};
  sessions[scopeId] = { activeProjectId, label: scopeLabel, projectIds: scoped.map((project) => project.id) };

  await writeStorage({
    [SETTINGS_KEY]: normalizedSettings,
    [PROJECTS_KEY]: [...preserved, ...scoped],
    [TAB_SESSIONS_KEY]: sessions
  });
}

export async function loadPendingPrompt() {
  const result = await readStorage([PENDING_PROMPT_KEY]);
  return result[PENDING_PROMPT_KEY] || null;
}

export async function clearPendingPrompt() {
  if (hasChromeStorage()) await chrome.storage.local.remove(PENDING_PROMPT_KEY);
  else {
    try { globalThis.localStorage?.removeItem(PENDING_PROMPT_KEY); } catch { /* ignore */ }
  }
}

export { makeId };
