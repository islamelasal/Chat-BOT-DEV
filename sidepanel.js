import { ProfessionalProjectAgent } from './src/agents/professional-project-agent.js';
import { GeminiApiError } from './src/lib/gemini-client.js';
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
  pageContext: null,
  additionalPageContexts: [],
  activeTabId: null,
  contextLoading: false,
  sourcesLoading: false,
  isGenerating: false,
  abortController: null,
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
    activeProjectId: state.activeProjectId
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

function setSettingsLayer(open) {
  const layer = $('#settings-layer');
  if (!layer) return;
  layer.hidden = !open;
  if (open) {
    $('#api-key').value = state.settings.apiKey || '';
    $('#api-key').type = 'password';
    $('[data-action="toggle-key"]').textContent = 'إظهار';
    const modelSelect = $('#model-name');
    modelSelect.querySelector('[data-custom-model]')?.remove();
    if (![...modelSelect.options].some((option) => option.value === state.settings.model)) {
      const customOption = new Option(`${state.settings.model} · مخصص`, state.settings.model);
      customOption.dataset.customModel = 'true';
      modelSelect.appendChild(customOption);
    }
    modelSelect.value = state.settings.model;
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
  const hasKey = Boolean(state.settings.apiKey);
  const cooldownMs = rateLimitRemainingMs();
  $('#setup-notice').hidden = hasKey;
  const status = $('#connection-status');
  const label = $('#connection-label');
  status.classList.toggle('needs-key', !hasKey || cooldownMs > 0);
  if (!hasKey) label.textContent = 'أضف المفتاح';
  else if (cooldownMs > 0) label.textContent = `انتظر ${Math.ceil(cooldownMs / 1000)}ث`;
  else label.textContent = 'مفتاح محفوظ';
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
  if (state.settings.apiKey) sendMessage();
  else {
    setSettingsLayer(true);
    showToast('أضف مفتاح Gemini أولاً، ثم أرسل السؤال المحدد.', { error: true });
  }
}

function friendlyError(error) {
  if (error?.name === 'AbortError') return 'تم إيقاف التوليد. يمكنك إعادة إرسال الرسالة في أي وقت.';
  if (error instanceof GeminiApiError) {
    if (error.code === 'INVALID_KEY') return 'مفتاح Gemini غير صالح أو لا يملك صلاحية لهذا النموذج. راجعه من الإعدادات.';
    if (error.code === 'RATE_LIMIT') {
      const wait = error.retryAfterMs ? ` انتظر تقريباً ${Math.ceil(error.retryAfterMs / 1000)} ثانية.` : '';
      const model = error.model ? ` النموذج الحالي: ${error.model}.` : '';
      return `تم بلوغ حد الحصة أو عدد الطلبات لهذا المفتاح.${model}${wait} لتقليل المشكلة اختر Flash-Lite أو عطّل البحث المباشر وقراءة الروابط من الإعدادات.`;
    }
    if (error.code === 'INVALID_MODEL') return 'اسم النموذج غير متاح لهذا المفتاح. اختر نموذجاً من القائمة أو استخدم Flash-Lite.';
    if (error.code === 'SERVICE_BUSY') return 'خدمة Gemini مشغولة حالياً. أعد المحاولة بعد لحظات.';
    if (error.code === 'BAD_REQUEST') return 'رفض Gemini الطلب. جرّب تعطيل إحدى الأدوات الحديثة أو اختر نموذجاً يدعمها.';
    if (error.code === 'NETWORK_ERROR') return error.message;
    return `تعذر توليد الرد: ${error.message}`;
  }
  return 'حدث خطأ غير متوقع. حاول مرة أخرى.';
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

  if (!state.settings.apiKey) {
    setSettingsLayer(true);
    showToast('أضف مفتاح Gemini المجاني من الإعدادات للبدء.', { error: true });
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
      signal: state.abortController.signal,
      onDelta: (delta) => {
        assistantMessage.content += delta;
        scheduleStreamRender();
      }
    });
    assistantMessage.content = response.text;
    assistantMessage.sources = response.sources || [];
    assistantMessage.meta = {
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
  showToast(state.settings.apiKey ? 'تم حفظ الإعدادات الحديثة. الوكيل جاهز.' : 'تم حفظ الإعدادات دون مفتاح API.');
}

function createNewProjectFromForm(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const project = createProject(String(form.get('name') || ''), String(form.get('brief') || ''));
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
    if (state.settings.apiKey) sendMessage();
    else {
      $('#message-input').focus();
      setSettingsLayer(true);
      showToast('أضف مفتاح Gemini أولاً لتشغيل الاقتراح.', { error: true });
    }
  }
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
    chrome.tabs.onActivated.addListener(() => refreshPageContext({ clearAdditional: true }));
    chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
      if (tabId === state.activeTabId && changeInfo.status === 'complete') refreshPageContext();
    });
    chrome.runtime.onMessage.addListener((message) => {
      if (message?.type === 'REFRESH_PAGE_CONTEXT') refreshPageContext();
    });
  }
}

async function init() {
  const saved = await loadAppState();
  state.settings = saved.settings;
  state.projects = saved.projects;
  state.activeProjectId = saved.activeProjectId;
  bindEvents();
  render();
  await refreshPageContext();

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
