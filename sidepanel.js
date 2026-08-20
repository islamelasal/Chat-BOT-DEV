import { AutopilotCoordinator } from './src/agents/autopilot-coordinator.js';
import { ProfessionalProjectAgent } from './src/agents/professional-project-agent.js';
import { ProviderEngineError } from './src/lib/provider-engine.js';
import { configuredProviders, discoverOpenRouterFreeModels, hasConfiguredProvider } from './src/lib/free-models.js';
import {
  clearPendingPrompt,
  createProject,
  loadAppState,
  loadPendingPrompt,
  makeId,
  normalizeSettings,
  saveAppState
} from './src/lib/storage.js';
import {
  downloadText,
  escapeHtml,
  formatDate,
  formatTime,
  renderMarkdown,
  safeExternalUrl,
  sourceKindLabel
} from './src/lib/format.js';

const hasChrome = Boolean(globalThis.chrome?.runtime && globalThis.chrome?.tabs);
const $ = (selector) => document.querySelector(selector);

const state = {
  settings: null,
  projects: [],
  activeProjectId: null,
  scopeId: 'global',
  scopeLabel: '',
  pageContext: null,
  additionalPageContexts: [],
  aiChatState: null,
  aiChatLoading: false,
  activeTabId: null,
  contextLoading: false,
  sourcesLoading: false,
  isGenerating: false,
  abortController: null,
  autopilot: {
    running: false,
    turn: 0,
    maxTurns: 5,
    goal: '',
    controller: null
  },
  toastTimer: null,
  rateLimitUntil: 0,
  rateLimitTimer: null,
  streamFrame: null
};

function activeProject() {
  return state.projects.find((project) => project.id === state.activeProjectId) || state.projects[0];
}

function touchProject(project) {
  if (project) project.updatedAt = Date.now();
}

async function persist() {
  await saveAppState({
    settings: state.settings,
    projects: state.projects,
    activeProjectId: state.activeProjectId,
    scopeId: state.scopeId,
    scopeLabel: state.scopeLabel
  });
}

function showToast(message, { error = false } = {}) {
  const toast = $('#toast');
  if (!toast) return;
  clearTimeout(state.toastTimer);
  toast.textContent = message;
  toast.classList.toggle('error-toast', error);
  toast.classList.add('visible');
  state.toastTimer = setTimeout(() => toast.classList.remove('visible'), 3600);
}

function rateLimitRemainingMs() {
  return Math.max(0, state.rateLimitUntil - Date.now());
}

function startRateLimitCooldown(durationMs = 30000) {
  const safeDuration = Math.min(15 * 60 * 1000, Math.max(10000, Number(durationMs) || 30000));
  state.rateLimitUntil = Date.now() + safeDuration;
  clearInterval(state.rateLimitTimer);
  state.rateLimitTimer = setInterval(() => {
    if (rateLimitRemainingMs() <= 0) {
      clearInterval(state.rateLimitTimer);
      state.rateLimitTimer = null;
    }
    renderSetupNotice();
    renderComposer();
  }, 1000);
  renderSetupNotice();
  renderComposer();
}

async function refreshOpenRouterCatalog() {
  const discovered = await discoverOpenRouterFreeModels();
  if (!discovered.length) return;
  state.settings.openRouterFreeModels = discovered;
  const select = $('#openrouter-model');
  if (!select) return;
  const current = state.settings.openRouterModel;
  select.querySelectorAll('[data-dynamic-free-model]').forEach((option) => option.remove());
  discovered.slice(0, 30).forEach((model) => {
    if ([...select.options].some((option) => option.value === model.id)) return;
    const option = new Option(model.label, model.id);
    option.dataset.dynamicFreeModel = 'true';
    select.appendChild(option);
  });
  select.value = current;
}

function setSettingsLayer(open) {
  const layer = $('#settings-layer');
  if (!layer) return;
  layer.hidden = !open;
  if (open) {
    $('#api-key').value = state.settings.apiKey || state.settings.geminiApiKey || '';
    $('#api-key').type = 'password';
    $('#openrouter-api-key').value = state.settings.openRouterApiKey || '';
    $('#groq-api-key').value = state.settings.groqApiKey || '';
    $('#provider-mode').value = state.settings.providerMode;
    $('[data-action="toggle-key"]').textContent = 'إظهار';
    const modelSelect = $('#model-name');
    modelSelect.querySelector('[data-custom-model]')?.remove();
    if (![...modelSelect.options].some((option) => option.value === state.settings.model)) {
      const customOption = new Option(`${state.settings.model} · مخصص`, state.settings.model);
      customOption.dataset.customModel = 'true';
      modelSelect.appendChild(customOption);
    }
    modelSelect.value = state.settings.model;
    $('#openrouter-model').value = state.settings.openRouterModel;
    $('#groq-model').value = state.settings.groqModel;
    $('#free-only').checked = state.settings.freeOnly;
    $('#auto-fallback').checked = state.settings.autoFallback;
    $('#agent-mode').value = state.settings.agentMode;
    $('#thinking-level').value = state.settings.thinkingLevel;
    $('#temperature').value = state.settings.temperature;
    $('#temperature-value').textContent = Number(state.settings.temperature).toFixed(2);
    $('#use-web-search').checked = state.settings.webSearch;
    $('#use-url-context').checked = state.settings.urlContext;
    $('#use-code-execution').checked = state.settings.codeExecution;
    $('#use-streaming').checked = state.settings.streaming;
    $('#include-page-context').checked = state.settings.includePageContext;
    $('#include-selection').checked = state.settings.includeSelection;
    refreshOpenRouterCatalog();
    setTimeout(() => $('#api-key').focus(), 50);
  }
}

function setProjectLayer(open) {
  const layer = $('#project-layer');
  if (!layer) return;
  layer.hidden = !open;
  if (open) {
    $('#project-form').reset();
    setTimeout(() => $('#project-name').focus(), 50);
  }
}

function renderProjectControls() {
  const select = $('#project-select');
  if (!select) return;
  select.innerHTML = '';
  state.projects.forEach((project) => {
    const option = document.createElement('option');
    option.value = project.id;
    option.textContent = project.name;
    option.selected = project.id === state.activeProjectId;
    select.appendChild(option);
  });
  $('#project-delete').disabled = state.projects.length <= 1;
}

function renderSetupNotice() {
  const hasKey = hasConfiguredProvider(state.settings);
  const cooldownMs = rateLimitRemainingMs();
  $('#setup-notice').hidden = hasKey;
  const status = $('#connection-status');
  const label = $('#connection-label');
  status.classList.toggle('needs-key', !hasKey || cooldownMs > 0);
  if (!hasKey) label.textContent = 'أضف المفتاح';
  else if (cooldownMs > 0) label.textContent = `انتظر ${Math.ceil(cooldownMs / 1000)}ث`;
  else label.textContent = `${configuredProviders(state.settings).length} مزود مجاني`;
}

function setContextText(element, text) {
  if (element) element.textContent = text || '';
}

function availableContextCount() {
  return [state.pageContext, ...state.additionalPageContexts]
    .filter((context) => context?.available)
    .map((context) => context.url)
    .filter((url, index, urls) => url && urls.indexOf(url) === index)
    .length;
}

function renderSourceToolbar() {
  const summary = $('#source-summary');
  const collectButton = $('[data-action="collect-tabs"]');
  const clearButton = $('[data-action="clear-sources"]');
  if (!summary || !collectButton) return;
  const count = availableContextCount();
  summary.textContent = state.sourcesLoading
    ? 'نجمع الصفحات المفتوحة…'
    : count > 1
      ? `${count} مصادر مرتبطة`
      : count === 1
        ? 'المصدر الحالي جاهز'
        : 'لم يتم ربط مصدر بعد';
  collectButton.disabled = state.sourcesLoading || !hasChrome;
  collectButton.classList.toggle('loading', state.sourcesLoading);
  if (clearButton) clearButton.hidden = state.additionalPageContexts.length === 0;
}

function renderAiBridge() {
  const chat = state.aiChatState;
  const card = $('#ai-bridge-card');
  const providerBadge = $('#ai-provider-badge');
  const title = $('#ai-chat-title');
  const status = $('#ai-chat-status');
  const refresh = $('[data-action="refresh-ai-chat"]');
  const importButton = $('[data-action="import-ai-chat"]');
  const startButton = $('#autopilot-button');
  const progress = $('#autopilot-progress');
  const progressText = $('#autopilot-progress-text');
  if (!card || !providerBadge || !title || !status) return;

  refresh.classList.toggle('loading', state.aiChatLoading);
  if (state.aiChatLoading) {
    providerBadge.textContent = 'جارٍ الفحص';
    title.textContent = 'نبحث عن محادثة AI في الصفحة';
    status.textContent = 'يتم التحقق من المنصة والمحرر والرسائل الحالية…';
  } else if (!chat || !chat.available || !chat.supported) {
    providerBadge.textContent = chat?.providerLabel || 'غير مكتشفة';
    title.textContent = chat?.title || 'افتح ChatGPT أو Gemini أو Claude';
    status.textContent = chat?.available === false
      ? 'لا يمكن قراءة هذه الصفحة المحمية.'
      : 'افتح محادثة AI في تبويب نشط، ثم اضغط تحديث الحالة.';
  } else {
    providerBadge.textContent = chat.providerLabel || chat.provider;
    title.textContent = chat.title || 'محادثة AI جاهزة';
    status.textContent = `${chat.messageCount || 0} رسالة · ${chat.busy ? 'المساعد يكتب الآن' : 'جاهزة للاستكمال'}`;
  }

  const ready = Boolean(chat?.supported && !chat.busy);
  importButton.disabled = !chat?.supported || state.aiChatLoading;
  startButton.disabled = (!ready && !state.autopilot.running) || state.aiChatLoading;
  startButton.textContent = state.autopilot.running ? 'إيقاف الاستكمال' : 'بدء الاستكمال التلقائي';
  card.classList.toggle('bridge-ready', ready);
  card.classList.toggle('bridge-running', state.autopilot.running);
  progress.hidden = !state.autopilot.running;
  if (state.autopilot.running) {
    progressText.textContent = `الدورة ${state.autopilot.turn} من ${state.autopilot.maxTurns} · ${state.autopilot.goal || 'هدف المشروع'}`;
  }
}

function renderPageContext() {
  const context = state.pageContext;
  const card = $('#page-context-card');
  const refresh = $('[data-action="refresh-context"]');
  const stateLabel = $('#context-state');
  const title = $('#context-title');
  const url = $('#context-url');
  const badge = $('#selection-badge');

  refresh.classList.toggle('loading', state.contextLoading);
  if (state.contextLoading) {
    setContextText(stateLabel, 'جارٍ القراءة…');
    setContextText(title, 'نحضر الصفحة الحالية');
    setContextText(url, 'لحظة واحدة…');
    badge.hidden = true;
    renderSourceToolbar();
    return;
  }

  if (!context) {
    setContextText(stateLabel, 'غير متاح');
    setContextText(title, 'افتح صفحة ويب للبدء');
    setContextText(url, 'يمكن تشغيل الوكيل دون سياق صفحة أيضاً.');
    badge.hidden = true;
    renderSourceToolbar();
    return;
  }

  if (context.available === false) {
    setContextText(stateLabel, 'محدود');
    setContextText(title, context.title || 'هذه الصفحة');
    setContextText(url, 'لا يسمح Chrome بقراءة صفحات النظام أو الصفحات المحمية.');
    badge.hidden = true;
    renderSourceToolbar();
    return;
  }

  setContextText(stateLabel, context.pageType === 'technical' ? 'تقنية · جاهز' : 'جاهز');
  setContextText(title, context.title || 'صفحة بلا عنوان');
  setContextText(url, context.canonicalUrl || context.url || '');
  badge.hidden = !(state.settings.includeSelection && context.selection);
  if (context.selection) badge.textContent = `نص محدد: ${context.selection.length} حرف`;
  card.title = context.description || context.title || '';
  renderSourceToolbar();
}

function toolDisplayName(tool) {
  return {
    google_search: 'بحث مباشر',
    url_context: 'قراءة الروابط',
    code_execution: 'تحقق حسابي'
  }[tool] || tool;
}

function sourceHostname(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function createSourcesMarkup(sources = []) {
  const validSources = sources
    .map((source) => ({ ...source, url: safeExternalUrl(source.url) }))
    .filter((source) => source.url)
    .slice(0, 8);
  if (!validSources.length) return '';

  return `<div class="sources-panel">
    <div class="sources-heading"><span>مصادر ومراجع</span><span class="sources-count">${validSources.length}</span></div>
    <div class="sources-list">${validSources.map((source) => `<a class="source-link" href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">
      <span class="source-favicon">↗</span><span class="source-link-copy"><strong>${escapeHtml(source.title || sourceHostname(source.url))}</strong><small>${escapeHtml(sourceKindLabel(source.kind))} · ${escapeHtml(sourceHostname(source.url))}</small></span>
    </a>`).join('')}</div>
  </div>`;
}

function createResponseMetaMarkup(message) {
  const meta = message.meta;
  const tools = meta?.tools || [];
  const labels = tools.map(toolDisplayName).filter(Boolean);
  const badges = [];
  if (meta?.providerLabel) badges.push(meta.providerLabel);
  if (meta?.model) badges.push(meta.model);
  if (meta?.streamed) badges.push('رد متدفق');
  if (meta?.fallback) badges.push('نموذج احتياطي');
  if (meta?.toolFallback) badges.push('أدوات احتياطية');
  labels.forEach((label) => badges.push(label));
  if (meta?.queries?.length) badges.push(`${meta.queries.length} استعلامات`);
  if (!badges.length) return '';
  return `<div class="response-meta">${badges.map((badge) => `<span>${escapeHtml(badge)}</span>`).join('')}</div>`;
}

function createMessageMarkup(message) {
  const isUser = message.role === 'user';
  const label = isUser ? 'أنت' : 'Project Agent';
  const avatar = isUser
    ? '<div class="user-avatar" aria-hidden="true">أ</div>'
    : '<div class="assistant-avatar" aria-hidden="true">✦</div>';
  const streamingClass = message.streaming ? ' streaming-card' : '';
  const body = message.kind === 'error'
    ? `<div class="message-card error-card"><p>${escapeHtml(message.content)}</p></div>`
    : `<div class="message-card${streamingClass}">${isUser
      ? `<p>${escapeHtml(message.content).replace(/\n/g, '<br>')}</p>`
      : `${renderMarkdown(message.content)}${message.streaming ? '<span class="streaming-cursor" aria-label="جارٍ توليد الرد"></span>' : ''}`}</div>`;
  const contextLabel = message.hasContext ? '<span class="message-context-label">• سياق الصفحة مرفق</span>' : '';
  const copyButton = !isUser && message.kind !== 'error' && message.content
    ? `<button class="copy-message" type="button" data-action="copy-message" data-message-id="${escapeHtml(message.id)}">نسخ الرد</button>`
    : '';
  const sources = !isUser ? createSourcesMarkup(message.sources) : '';
  const responseMeta = !isUser ? createResponseMetaMarkup(message) : '';

  return `<article class="message-row ${isUser ? 'user' : 'assistant'}" data-message-id="${escapeHtml(message.id)}">
    ${avatar}
    <div class="message-content-wrap">
      ${body}
      ${sources}
      ${responseMeta}
      <div class="message-footer"><span>${label} · ${formatTime(message.createdAt)}</span>${contextLabel}${copyButton}</div>
    </div>
  </article>`;
}

function renderChat({ scroll = false } = {}) {
  const project = activeProject();
  const empty = $('#empty-state');
  const list = $('#messages-list');
  const messages = project?.messages || [];
  empty.hidden = messages.length > 0;
  list.hidden = messages.length === 0;

  if (messages.length) {
    list.innerHTML = messages.map(createMessageMarkup).join('');
    if (scroll) {
      requestAnimationFrame(() => {
        list.scrollTop = list.scrollHeight;
      });
    }
  } else {
    list.innerHTML = '';
  }
}

function renderComposer() {
  const input = $('#message-input');
  const sendButton = $('#send-button');
  const sendLabel = $('#send-label');
  const typing = $('#typing-row');
  input.disabled = state.isGenerating;
  sendButton.classList.toggle('stop-button', state.isGenerating);
  sendButton.setAttribute('aria-label', state.isGenerating ? 'إيقاف التوليد' : 'إرسال الرسالة');
  sendLabel.textContent = state.isGenerating ? 'إيقاف' : 'إرسال';
  typing.hidden = !state.isGenerating;
  sendButton.disabled = !state.isGenerating && rateLimitRemainingMs() > 0;
}

function render() {
  renderProjectControls();
  renderSetupNotice();
  renderPageContext();
  renderAiBridge();
  renderChat();
  renderComposer();
}

function resizeInput() {
  const input = $('#message-input');
  input.style.height = 'auto';
  input.style.height = `${Math.min(input.scrollHeight, 150)}px`;
}

async function getTabContext(tab) {
  if (!tab?.id) return null;
  try {
    return await chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_CONTEXT' });
  } catch {
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
      return await chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_CONTEXT' });
    } catch {
      return {
        available: false,
        title: tab.title || 'الصفحة الحالية',
        url: tab.url || '',
        reason: 'protected-page'
      };
    }
  }
}

async function refreshAiChat({ silent = false } = {}) {
  if (!hasChrome) {
    state.aiChatState = {
      available: true,
      supported: false,
      provider: 'preview',
      providerLabel: 'معاينة',
      title: 'المعاينة المحلية لا تحتوي على محادثة AI خارجية',
      messages: [],
      messageCount: 0,
      busy: false
    };
    renderAiBridge();
    return state.aiChatState;
  }

  state.aiChatLoading = true;
  renderAiBridge();
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    if (!tab?.id) throw new Error('لا يوجد تبويب نشط');
    state.activeTabId = tab.id;
    let chat;
    try {
      chat = await chrome.tabs.sendMessage(tab.id, { type: 'AI_CHAT_GET_STATE' });
    } catch {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
      chat = await chrome.tabs.sendMessage(tab.id, { type: 'AI_CHAT_GET_STATE' });
    }
    state.aiChatState = chat;
    if (!silent && chat?.supported) showToast(`تم اكتشاف ${chat.providerLabel || 'محادثة AI'} بنجاح.`);
  } catch (error) {
    state.aiChatState = {
      available: false,
      supported: false,
      provider: 'unknown',
      providerLabel: 'غير متاحة',
      title: 'لا يمكن الوصول إلى محادثة AI في هذا التبويب',
      messages: [],
      messageCount: 0,
      reason: error.message
    };
    if (!silent) showToast('افتح تبويب ChatGPT أو Gemini أو Claude ثم اضغط تحديث الحالة.', { error: true });
  } finally {
    state.aiChatLoading = false;
    renderAiBridge();
  }
  return state.aiChatState;
}

async function importAiChat({ silent = false } = {}) {
  const chat = await refreshAiChat({ silent });
  if (!chat?.supported) return false;
  const project = activeProject();
  project.externalChat = {
    provider: chat.provider,
    providerLabel: chat.providerLabel,
    url: chat.url,
    title: chat.title,
    messages: chat.messages,
    updatedAt: Date.now()
  };
  touchProject(project);
  await persist();
  if (!silent) showToast(`تم استيراد ${chat.messageCount} رسالة إلى المشروع الحالي.`);
  return true;
}

async function sendAiChatPrompt(prompt) {
  if (!hasChrome || !state.activeTabId) throw new Error('لا يوجد تبويب AI نشط.');
  const result = await chrome.tabs.sendMessage(state.activeTabId, {
    type: 'AI_CHAT_SEND_PROMPT',
    prompt
  });
  if (!result?.ok) throw new Error(result?.reason || 'تعذر إرسال الرسالة إلى محادثة AI.');
  return result.state;
}

async function waitForAiChatResponse(baseline, timeoutMs = 90000) {
  if (!hasChrome || !state.activeTabId) throw new Error('لا يوجد تبويب AI نشط.');
  return chrome.tabs.sendMessage(state.activeTabId, {
    type: 'AI_CHAT_WAIT_FOR_RESPONSE',
    baselineCount: baseline?.messageCount || 0,
    baselineAssistant: baseline?.lastAssistant || '',
    timeoutMs
  });
}

function pauseAutopilot(message = 'تم إيقاف الاستكمال التلقائي.', options = {}) {
  if (!state.autopilot.running) return;
  state.autopilot.running = false;
  state.autopilot.controller?.abort();
  state.autopilot.controller = null;
  renderAiBridge();
  showToast(message, options);
}

async function startAutopilot() {
  if (state.autopilot.running) {
    pauseAutopilot();
    return;
  }
  if (state.isGenerating) {
    showToast('انتظر انتهاء رد Project Agent الحالي قبل تشغيل الاستكمال التلقائي.', { error: true });
    return;
  }
  if (!hasConfiguredProvider(state.settings)) {
    setSettingsLayer(true);
    showToast('أضف مفتاحاً لمزود مجاني ليقوم المنسق بإدارة دورات الاستكمال.', { error: true });
    return;
  }

  const chat = await refreshAiChat();
  if (!chat?.supported) {
    showToast('لم يتم اكتشاف محرر محادثة AI قابل للإرسال في التبويب الحالي.', { error: true });
    return;
  }
  if (chat.busy) {
    showToast('محادثة AI ما زالت تولّد رداً. انتظر حتى تنتهي ثم ابدأ الاستكمال.', { error: true });
    return;
  }

  const project = activeProject();
  const goal = ($('#autopilot-goal').value || project?.brief || '').trim();
  const maxTurns = Math.min(20, Math.max(1, Number($('#autopilot-max-turns').value) || 5));
  state.autopilot = {
    running: true,
    turn: 0,
    maxTurns,
    goal,
    controller: new AbortController()
  };
  renderAiBridge();
  showToast('بدأ الوكيل تنسيق الاستكمال. يمكنك إيقافه في أي وقت.');
  runAutopilotLoop().catch((error) => {
    if (state.autopilot.running) showToast(`توقف الاستكمال: ${error.message}`, { error: true });
    state.autopilot.running = false;
    state.autopilot.controller = null;
    renderAiBridge();
  });
}

async function runAutopilotLoop() {
  const coordinator = new AutopilotCoordinator(state.settings);
  const project = activeProject();
  let chat = state.aiChatState;

  while (state.autopilot.running && state.autopilot.turn < state.autopilot.maxTurns) {
    state.autopilot.turn += 1;
    renderAiBridge();
    chat = await refreshAiChat({ silent: true });
    if (!state.autopilot.running) break;
    if (!chat?.supported) throw new Error('فقدت الإضافة اتصالها بمحرر محادثة AI.');
    if (chat.busy) {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      state.autopilot.turn -= 1;
      continue;
    }

    const plan = await coordinator.nextStep({
      project,
      chatState: chat,
      goal: state.autopilot.goal,
      turn: state.autopilot.turn,
      maxTurns: state.autopilot.maxTurns,
      signal: state.autopilot.controller.signal
    });
    if (!state.autopilot.running) break;

    if (plan.status === 'done') {
      pauseAutopilot(`أعلن المنسق اكتمال المشروع بعد ${state.autopilot.turn} دورات.`);
      return;
    }
    if (plan.status === 'blocked') {
      pauseAutopilot(`توقف الوكيل بسبب عائق: ${plan.blocker || 'يحتاج قراراً من المستخدم.'}`);
      return;
    }
    if (!plan.nextPrompt) {
      pauseAutopilot('لم ينتج المنسق خطوة تالية قابلة للإرسال.');
      return;
    }

    const baseline = chat;
    const prompt = `${plan.nextPrompt}\n\nتعليمات Project Agent: نفّذ هذه الخطوة الآن داخل مشروعنا، ثم اذكر النتيجة والدليل أو الاختبار. لا تعلن اكتمال المشروع إلا بعد تحقق واضح.`;
    await sendAiChatPrompt(prompt);
    renderAiBridge();
    const waited = await waitForAiChatResponse(baseline, 120000);
    if (!state.autopilot.running) break;
    state.aiChatState = waited?.state || await refreshAiChat({ silent: true });
    if (waited?.timedOut) {
      pauseAutopilot('انتهى وقت انتظار رد محادثة AI. تحقق من التبويب ثم أعد التشغيل.', { error: true });
      return;
    }
    await importAiChat({ silent: true });
  }

  if (state.autopilot.running) {
    state.autopilot.running = false;
    state.autopilot.controller = null;
    renderAiBridge();
    showToast('تم الوصول إلى الحد الآمن للدورات. راجع النتيجة ثم شغّل دورة جديدة عند الحاجة.');
  }
}

async function refreshPageContext({ clearAdditional = false } = {}) {
  if (clearAdditional) state.additionalPageContexts = [];
  if (!hasChrome) {
    state.pageContext = {
      available: true,
      title: 'وضع المعاينة',
      url: 'preview://project-agent',
      canonicalUrl: 'preview://project-agent',
      description: 'هذه معاينة محلية لواجهة الإضافة.',
      headings: [],
      links: [],
      codeBlocks: [],
      content: 'يمكن تحميل الإضافة من chrome://extensions لاستخدام سياق الصفحات الحقيقي.',
      selection: '',
      pageType: 'webpage'
    };
    state.contextLoading = false;
    renderPageContext();
    return;
  }

  state.contextLoading = true;
  renderPageContext();
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    const previousTabId = state.activeTabId;
    state.activeTabId = tab?.id || null;
    if (previousTabId && previousTabId !== state.activeTabId) state.additionalPageContexts = [];
    if (!tab?.id) throw new Error('No active tab');
    state.pageContext = await getTabContext(tab);
  } catch {
    state.activeTabId = null;
    state.pageContext = null;
  } finally {
    state.contextLoading = false;
    renderPageContext();
  }
}

async function collectOpenTabContexts() {
  if (!hasChrome || state.sourcesLoading) return;
  state.sourcesLoading = true;
  renderSourceToolbar();
  try {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    const candidates = tabs
      .filter((tab) => /^https?:\/\//i.test(tab.url || ''))
      .slice(0, 7);
    const contexts = await Promise.all(candidates.map((tab) => getTabContext(tab)));
    const currentUrl = state.pageContext?.url;
    state.additionalPageContexts = contexts
      .filter((context) => context?.available && context.url && context.url !== currentUrl)
      .filter((context, index, list) => list.findIndex((item) => item.url === context.url) === index)
      .slice(0, 5);
    showToast(state.additionalPageContexts.length
      ? `تم ربط ${state.additionalPageContexts.length + (state.pageContext?.available ? 1 : 0)} صفحات بالمحادثة.`
      : 'لم نجد صفحات ويب إضافية قابلة للقراءة.', { error: !state.additionalPageContexts.length });
  } finally {
    state.sourcesLoading = false;
    renderSourceToolbar();
  }
}

function clearAdditionalContexts() {
  state.additionalPageContexts = [];
  renderSourceToolbar();
  showToast('تمت إزالة المصادر الإضافية.');
}

function consumePendingPrompt(pending) {
  if (!pending || Date.now() - Number(pending.createdAt) > 10 * 60 * 1000) return;
  if (pending.tabId && state.activeTabId && pending.tabId !== state.activeTabId) return;
  const input = $('#message-input');
  input.value = pending.prompt || '';
  resizeInput();
  input.focus();
  if (hasConfiguredProvider(state.settings)) sendMessage();
  else {
    setSettingsLayer(true);
    showToast('أضف مفتاحاً لمزود مجاني أولاً، ثم أرسل السؤال المحدد.', { error: true });
  }
}

function friendlyError(error) {
  if (error?.name === 'AbortError') return 'تم إيقاف التوليد. يمكنك إعادة إرسال الرسالة في أي وقت.';
  if (error?.code === 'NO_PROVIDER_KEYS') return 'أضف مفتاحاً واحداً على الأقل من Gemini أو OpenRouter أو Groq من الإعدادات.';
  if (error?.code === 'PAID_MODEL_BLOCKED') return 'تم حظر النموذج لأنه ليس مثبتاً كمجاني. اختر نموذجاً عليه :free في OpenRouter أو نموذج Groq من القائمة.';
  if (error?.code === 'INVALID_KEY') return `مفتاح ${error.provider || 'المزود'} غير صالح أو لا يملك صلاحية لهذا النموذج. راجعه من الإعدادات.`;
  if (error?.code === 'RATE_LIMIT') {
    const wait = error.retryAfterMs ? ` انتظر تقريباً ${Math.ceil(error.retryAfterMs / 1000)} ثانية.` : '';
    const model = error.model ? ` النموذج الحالي: ${error.model}.` : '';
    return `تم بلوغ حد الحصة أو عدد الطلبات للمزود ${error.provider || ''}.${model}${wait} سيحاول المحرك مزوداً مجانياً آخر تلقائياً عند تفعيل Auto Fallback.`;
  }
  if (error?.code === 'INVALID_MODEL') return 'اسم النموذج غير متاح لهذا المزود. اختر نموذجاً من القائمة المجانية.';
  if (error?.code === 'SERVICE_BUSY') return 'المزود مشغول حالياً. سيحاول المحرك مزوداً مجانياً آخر أو أعد المحاولة بعد لحظات.';
  if (error?.code === 'BAD_REQUEST') return 'رفض المزود الطلب. تحقق من النموذج أو عطّل الأدوات التي لا يدعمها المزود.';
  if (error?.code === 'NETWORK_ERROR') return error.message;
  if (error instanceof ProviderEngineError) return error.message;
  return error?.message ? `تعذر توليد الرد: ${error.message}` : 'حدث خطأ غير متوقع. حاول مرة أخرى.';
}

function scheduleStreamRender() {
  if (state.streamFrame) return;
  state.streamFrame = requestAnimationFrame(() => {
    state.streamFrame = null;
    renderChat({ scroll: true });
  });
}

async function sendMessage(value) {
  if (state.isGenerating) return;
  const cooldownMs = rateLimitRemainingMs();
  if (cooldownMs > 0) {
    showToast(`انتظر ${Math.ceil(cooldownMs / 1000)} ثانية قبل إعادة الطلب.`, { error: true });
    return;
  }
  const input = $('#message-input');
  const content = String(value ?? input.value).trim();
  if (!content) return;

  if (!hasConfiguredProvider(state.settings)) {
    setSettingsLayer(true);
    showToast('أضف مفتاحاً لمزود مجاني واحد على الأقل من الإعدادات للبدء.', { error: true });
    return;
  }

  const project = activeProject();
  if (!project) return;
  const hasContext = Boolean(
    state.settings.includePageContext && state.pageContext?.available &&
    (state.pageContext.content || state.pageContext.title)
  );
  const userMessage = {
    id: makeId('message'),
    role: 'user',
    content,
    createdAt: Date.now(),
    kind: 'normal',
    hasContext,
    sources: [],
    meta: null
  };
  const assistantMessage = {
    id: makeId('message'),
    role: 'assistant',
    content: '',
    createdAt: Date.now(),
    kind: 'normal',
    sources: [],
    meta: null,
    streaming: state.settings.streaming !== false
  };
  project.messages.push(userMessage);
  project.messages.push(assistantMessage);
  touchProject(project);
  input.value = '';
  resizeInput();
  state.isGenerating = true;
  state.abortController = new AbortController();
  await persist();
  renderChat({ scroll: true });
  renderComposer();

  try {
    const agent = new ProfessionalProjectAgent(state.settings);
    const response = await agent.reply({
      messages: project.messages.filter((message) => message.id !== assistantMessage.id),
      project,
      pageContext: state.pageContext,
      additionalPageContexts: state.additionalPageContexts,
      aiChatContext: state.aiChatState?.supported ? state.aiChatState : project.externalChat,
      signal: state.abortController.signal,
      onDelta: (delta) => {
        assistantMessage.content += delta;
        scheduleStreamRender();
      }
    });
    assistantMessage.content = response.text;
    assistantMessage.sources = response.sources || [];
    assistantMessage.meta = {
      provider: response.provider || '',
      providerLabel: response.providerLabel || '',
      model: response.model,
      tools: response.tools || [],
      queries: response.queries || [],
      streamed: state.settings.streaming !== false,
      fallback: Boolean(response.fallback),
      toolFallback: Boolean(response.toolFallback)
    };
    assistantMessage.streaming = false;
  } catch (error) {
    if (error?.code === 'RATE_LIMIT') startRateLimitCooldown(error.retryAfterMs || 30000);
    const partialContent = assistantMessage.content.trim();
    if (partialContent && error?.name === 'AbortError') {
      assistantMessage.kind = 'partial';
      assistantMessage.streaming = false;
      showToast('تم إيقاف الرد مع الاحتفاظ بالجزء الناتج.');
    } else if (partialContent) {
      assistantMessage.kind = 'partial';
      assistantMessage.streaming = false;
      showToast(friendlyError(error), { error: true });
    } else {
      assistantMessage.kind = 'error';
      assistantMessage.content = friendlyError(error);
      assistantMessage.streaming = false;
    }
  } finally {
    touchProject(project);
    state.isGenerating = false;
    state.abortController = null;
    await persist();
    renderChat({ scroll: true });
    renderComposer();
    input.focus();
  }
}

function stopGeneration() {
  if (state.abortController) state.abortController.abort();
}

async function saveSettingsFromForm() {
  state.settings = normalizeSettings({
    ...state.settings,
    apiKey: $('#api-key').value,
    geminiApiKey: $('#api-key').value,
    openRouterApiKey: $('#openrouter-api-key').value,
    groqApiKey: $('#groq-api-key').value,
    providerMode: $('#provider-mode').value,
    openRouterModel: $('#openrouter-model').value,
    groqModel: $('#groq-model').value,
    freeOnly: $('#free-only').checked,
    autoFallback: $('#auto-fallback').checked,
    model: $('#model-name').value,
    agentMode: $('#agent-mode').value,
    thinkingLevel: $('#thinking-level').value,
    temperature: Number($('#temperature').value),
    webSearch: $('#use-web-search').checked,
    urlContext: $('#use-url-context').checked,
    codeExecution: $('#use-code-execution').checked,
    streaming: $('#use-streaming').checked,
    includePageContext: $('#include-page-context').checked,
    includeSelection: $('#include-selection').checked
  });
  await persist();
  setSettingsLayer(false);
  renderSetupNotice();
  renderPageContext();
  showToast(hasConfiguredProvider(state.settings) ? 'تم حفظ إعدادات المزودين المجانيين. الوكيل جاهز.' : 'تم حفظ الإعدادات دون مفاتيح API.');
}

function createNewProjectFromForm(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const project = createProject(String(form.get('name') || ''), String(form.get('brief') || ''), state.scopeId);
  state.projects.unshift(project);
  state.activeProjectId = project.id;
  setProjectLayer(false);
  persist();
  renderProjectControls();
  renderChat();
  showToast(`تم إنشاء مشروع «${project.name}»`);
}

async function deleteCurrentProject() {
  if (state.projects.length <= 1) {
    showToast('لا يمكن حذف المشروع الوحيد. أنشئ مشروعاً جديداً أولاً.', { error: true });
    return;
  }
  const project = activeProject();
  if (!project || !window.confirm(`حذف مشروع «${project.name}» وكل محادثته؟`)) return;
  state.projects = state.projects.filter((item) => item.id !== project.id);
  state.activeProjectId = state.projects[0].id;
  await persist();
  render();
  showToast('تم حذف المشروع.');
}

async function clearCurrentChat() {
  const project = activeProject();
  if (!project?.messages.length) {
    showToast('المحادثة فارغة بالفعل.');
    return;
  }
  if (!window.confirm('مسح كل رسائل المشروع الحالي؟')) return;
  project.messages = [];
  touchProject(project);
  await persist();
  renderChat();
  showToast('تم مسح المحادثة الحالية.');
}

function exportCurrentProject() {
  const project = activeProject();
  if (!project) return;
  if (!project.messages.length) {
    showToast('أضف رسالة واحدة على الأقل قبل التصدير.', { error: true });
    return;
  }
  const lines = [
    `# ${project.name}`,
    '',
    project.brief ? `> ${project.brief.replace(/\n/g, '\n> ')}` : '',
    `\n_تاريخ التصدير: ${formatDate(Date.now())}_`,
    ''
  ];
  project.messages.forEach((message) => {
    lines.push(`## ${message.role === 'user' ? 'المستخدم' : 'Project Agent'} — ${formatTime(message.createdAt)}`);
    lines.push('');
    lines.push(message.content);
    if (message.meta?.queries?.length) {
      lines.push('');
      lines.push(`استعلامات البحث: ${message.meta.queries.join(' | ')}`);
    }
    if (message.sources?.length) {
      lines.push('');
      lines.push('المصادر:');
      message.sources.forEach((source) => lines.push(`- [${source.title}](${source.url})`));
    }
    lines.push('');
  });
  const safeName = project.name.replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-|-$/g, '') || 'project-agent';
  downloadText(`${safeName}.md`, lines.join('\n'), 'text/markdown;charset=utf-8');
  showToast('تم تصدير المحادثة مع المصادر بصيغة Markdown.');
}

async function copyMessage(messageId) {
  const message = activeProject()?.messages.find((item) => item.id === messageId);
  if (!message) return;
  try {
    await navigator.clipboard.writeText(message.content);
    showToast('تم نسخ الرد.');
  } catch {
    showToast('لم يتمكن المتصفح من النسخ تلقائياً.', { error: true });
  }
}

function handleClick(event) {
  const actionElement = event.target.closest('[data-action]');
  if (!actionElement) return;
  const action = actionElement.dataset.action;

  if (action === 'settings-open') setSettingsLayer(true);
  if (action === 'settings-close') setSettingsLayer(false);
  if (action === 'settings-save') saveSettingsFromForm();
  if (action === 'toggle-key') {
    const input = $('#api-key');
    const visible = input.type === 'text';
    input.type = visible ? 'password' : 'text';
    actionElement.textContent = visible ? 'إظهار' : 'إخفاء';
  }
  if (action === 'project-new') setProjectLayer(true);
  if (action === 'project-close') setProjectLayer(false);
  if (action === 'project-delete') deleteCurrentProject();
  if (action === 'refresh-context') refreshPageContext();
  if (action === 'refresh-ai-chat') refreshAiChat();
  if (action === 'import-ai-chat') importAiChat();
  if (action === 'autopilot-start') startAutopilot();
  if (action === 'autopilot-pause') pauseAutopilot();
  if (action === 'collect-tabs') collectOpenTabContexts();
  if (action === 'clear-sources') clearAdditionalContexts();
  if (action === 'clear-chat') clearCurrentChat();
  if (action === 'export') exportCurrentProject();
  if (action === 'copy-message') copyMessage(actionElement.dataset.messageId);
  if (action === 'send') {
    if (state.isGenerating) stopGeneration();
    else sendMessage();
  }
  if (action === 'stop') stopGeneration();
  if (action === 'quick-prompt') {
    $('#message-input').value = actionElement.dataset.prompt || '';
    resizeInput();
    if (hasConfiguredProvider(state.settings)) sendMessage();
    else {
      $('#message-input').focus();
      setSettingsLayer(true);
      showToast('أضف مفتاحاً لمزود مجاني أولاً لتشغيل الاقتراح.', { error: true });
    }
  }
}

async function switchTabScope() {
  const scope = await resolveTabScope();
  if (scope.id === state.scopeId) {
    refreshPageContext({ clearAdditional: true });
    refreshAiChat({ silent: true });
    return;
  }
  await persist();
  const saved = await loadAppState({ scopeId: scope.id, scopeLabel: scope.label });
  state.scopeId = saved.scopeId || scope.id;
  state.scopeLabel = saved.scopeLabel || scope.label;
  state.settings = saved.settings;
  state.projects = saved.projects;
  state.activeProjectId = saved.activeProjectId;
  state.additionalPageContexts = [];
  state.aiChatState = null;
  render();
  await refreshPageContext();
  await refreshAiChat({ silent: true });
}

function bindEvents() {
  document.addEventListener('click', handleClick);
  $('#project-form').addEventListener('submit', createNewProjectFromForm);
  $('#project-select').addEventListener('change', async (event) => {
    state.activeProjectId = event.target.value;
    await persist();
    renderChat();
  });
  $('#message-input').addEventListener('input', resizeInput);
  $('#message-input').addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      if (state.isGenerating) stopGeneration();
      else sendMessage();
    }
  });
  $('#temperature').addEventListener('input', (event) => {
    $('#temperature-value').textContent = Number(event.target.value).toFixed(2);
  });

  if (hasChrome) {
    chrome.tabs.onActivated.addListener(() => switchTabScope());
    chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
      if (tabId === state.activeTabId && changeInfo.status === 'complete') {
        refreshPageContext();
        refreshAiChat({ silent: true });
      }
    });
    chrome.runtime.onMessage.addListener((message) => {
      if (message?.type === 'REFRESH_PAGE_CONTEXT') refreshPageContext();
      if (message?.type === 'REFRESH_AI_CHAT') refreshAiChat({ silent: true });
    });
  }
}

async function resolveTabScope() {
  if (!hasChrome) return { id: 'global', label: 'المعاينة' };
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return { id: 'global', label: 'المتصفح' };
    let label = tab.title || tab.url || `تبويب ${tab.id}`;
    try { label = new URL(tab.url || '').hostname || label; } catch { /* keep title */ }
    return { id: `tab-${tab.id}`, label: String(label).slice(0, 120) };
  } catch {
    return { id: 'global', label: 'المتصفح' };
  }
}

async function init() {
  const scope = await resolveTabScope();
  const saved = await loadAppState({ scopeId: scope.id, scopeLabel: scope.label });
  state.scopeId = saved.scopeId || scope.id;
  state.scopeLabel = saved.scopeLabel || scope.label;
  state.settings = saved.settings;
  state.projects = saved.projects;
  state.activeProjectId = saved.activeProjectId;
  bindEvents();
  render();
  await refreshPageContext();
  await refreshAiChat({ silent: true });

  const pending = await loadPendingPrompt();
  if (pending) {
    await clearPendingPrompt();
    consumePendingPrompt(pending);
  }
}

init().catch((error) => {
  console.error('Project Agent failed to initialize.', error);
  showToast('تعذر تحميل الإضافة. أعد فتح اللوحة وحاول مرة أخرى.', { error: true });
});
