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
import { downloadText, escapeHtml, formatDate, formatTime, renderMarkdown } from './src/lib/format.js';

const hasChrome = Boolean(globalThis.chrome?.runtime && globalThis.chrome?.tabs);
const $ = (selector) => document.querySelector(selector);

const state = {
  settings: null,
  projects: [],
  activeProjectId: null,
  pageContext: null,
  activeTabId: null,
  contextLoading: false,
  isGenerating: false,
  abortController: null,
  toastTimer: null
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
  state.toastTimer = setTimeout(() => toast.classList.remove('visible'), 3200);
}

function setSettingsLayer(open) {
  const layer = $('#settings-layer');
  if (!layer) return;
  layer.hidden = !open;
  if (open) {
    $('#api-key').value = state.settings.apiKey || '';
    $('#api-key').type = 'password';
    $('[data-action="toggle-key"]').textContent = 'إظهار';
    $('#model-name').value = state.settings.model;
    $('#agent-mode').value = state.settings.agentMode;
    $('#temperature').value = state.settings.temperature;
    $('#temperature-value').value = state.settings.temperature;
    $('#temperature-value').textContent = Number(state.settings.temperature).toFixed(2);
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
  $('#setup-notice').hidden = Boolean(state.settings.apiKey);
  const status = $('#connection-status');
  const label = $('#connection-label');
  status.classList.toggle('needs-key', !state.settings.apiKey);
  label.textContent = state.settings.apiKey ? 'مفتاح محفوظ' : 'أضف المفتاح';
}

function setContextText(element, text) {
  if (element) element.textContent = text || '';
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
    return;
  }

  if (!context) {
    setContextText(stateLabel, 'غير متاح');
    setContextText(title, 'افتح صفحة ويب للبدء');
    setContextText(url, 'يمكن تشغيل الوكيل دون سياق صفحة أيضاً.');
    badge.hidden = true;
    return;
  }

  if (context.available === false) {
    setContextText(stateLabel, 'محدود');
    setContextText(title, context.title || 'هذه الصفحة');
    setContextText(url, 'لا يسمح Chrome بقراءة صفحات النظام أو الصفحات المحمية.');
    badge.hidden = true;
    return;
  }

  setContextText(stateLabel, 'جاهز');
  setContextText(title, context.title || 'صفحة بلا عنوان');
  setContextText(url, context.url || '');
  badge.hidden = !(state.settings.includeSelection && context.selection);
  if (context.selection) badge.textContent = `نص محدد: ${context.selection.length} حرف`;
  card.title = context.description || context.title || '';
}

function createMessageMarkup(message) {
  const isUser = message.role === 'user';
  const label = isUser ? 'أنت' : 'Project Agent';
  const avatar = isUser ? '<div class="user-avatar" aria-hidden="true">أ</div>' : '<div class="assistant-avatar" aria-hidden="true">✦</div>';
  const body = message.kind === 'error'
    ? `<div class="message-card error-card"><p>${escapeHtml(message.content)}</p></div>`
    : `<div class="message-card">${isUser ? `<p>${escapeHtml(message.content).replace(/\n/g, '<br>')}</p>` : renderMarkdown(message.content)}</div>`;
  const contextLabel = message.hasContext ? '<span class="message-context-label">• سياق الصفحة مرفق</span>' : '';
  const copyButton = !isUser && message.kind !== 'error'
    ? `<button class="copy-message" type="button" data-action="copy-message" data-message-id="${escapeHtml(message.id)}">نسخ الرد</button>`
    : '';

  return `<article class="message-row ${isUser ? 'user' : 'assistant'}" data-message-id="${escapeHtml(message.id)}">
    ${avatar}
    <div class="message-content-wrap">
      ${body}
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
  if (state.isGenerating) {
    sendButton.disabled = false;
  }
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

async function refreshPageContext() {
  if (!hasChrome) {
    state.pageContext = {
      available: true,
      title: 'وضع المعاينة',
      url: 'preview://project-agent',
      description: 'هذه معاينة محلية لواجهة الإضافة.',
      headings: [],
      content: 'يمكن تحميل الإضافة من chrome://extensions لاستخدام سياق الصفحات الحقيقي.',
      selection: ''
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
    state.activeTabId = tab?.id || null;
    if (!tab?.id) throw new Error('No active tab');

    let context;
    try {
      context = await chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_CONTEXT' });
    } catch {
      // Tabs that were already open before installation may not have the content script yet.
      try {
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
        context = await chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_CONTEXT' });
      } catch {
        // A protected page may reject both content scripts and script injection.
        context = {
          available: false,
          title: tab.title || 'الصفحة الحالية',
          url: tab.url || '',
          reason: 'protected-page'
        };
      }
    }
    state.pageContext = context;
  } catch {
    state.activeTabId = null;
    state.pageContext = null;
  } finally {
    state.contextLoading = false;
    renderPageContext();
  }
}

function consumePendingPrompt(pending) {
  if (!pending || Date.now() - Number(pending.createdAt) > 10 * 60 * 1000) return;
  if (pending.tabId && state.activeTabId && pending.tabId !== state.activeTabId) return;
  const input = $('#message-input');
  input.value = pending.prompt || '';
  resizeInput();
  input.focus();
  if (state.settings.apiKey) {
    sendMessage();
  } else {
    setSettingsLayer(true);
    showToast('أضف مفتاح Gemini أولاً، ثم أرسل السؤال المحدد.', { error: true });
  }
}

function friendlyError(error) {
  if (error?.name === 'AbortError') return 'تم إيقاف التوليد. يمكنك إعادة إرسال الرسالة في أي وقت.';
  if (error instanceof GeminiApiError) {
    if (error.code === 'INVALID_KEY') return 'مفتاح Gemini غير صالح أو لا يملك صلاحية لهذا النموذج. راجعه من الإعدادات.';
    if (error.code === 'RATE_LIMIT') return 'تم الوصول إلى حد الاستخدام المؤقت. انتظر قليلاً أو راجع حصة الخطة المجانية.';
    if (error.code === 'INVALID_MODEL') return 'اسم النموذج غير متاح لهذا المفتاح. اختر نموذجاً متاحاً من Google AI Studio.';
    if (error.code === 'NETWORK_ERROR') return error.message;
    return `تعذر توليد الرد: ${error.message}`;
  }
  return 'حدث خطأ غير متوقع. حاول مرة أخرى.';
}

async function sendMessage(value) {
  if (state.isGenerating) return;
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
    hasContext
  };
  project.messages.push(userMessage);
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
      messages: project.messages,
      project,
      pageContext: state.pageContext,
      signal: state.abortController.signal
    });
    project.messages.push({
      id: makeId('message'),
      role: 'assistant',
      content: response,
      createdAt: Date.now(),
      kind: 'normal'
    });
  } catch (error) {
    project.messages.push({
      id: makeId('message'),
      role: 'assistant',
      content: friendlyError(error),
      createdAt: Date.now(),
      kind: 'error'
    });
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
    temperature: Number($('#temperature').value),
    includePageContext: $('#include-page-context').checked,
    includeSelection: $('#include-selection').checked
  });
  await persist();
  setSettingsLayer(false);
  renderSetupNotice();
  renderPageContext();
  showToast(state.settings.apiKey ? 'تم حفظ الإعدادات. الوكيل جاهز.' : 'تم حفظ الإعدادات دون مفتاح API.');
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
    lines.push('');
  });
  const safeName = project.name.replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-|-$/g, '') || 'project-agent';
  downloadText(`${safeName}.md`, lines.join('\n'), 'text/markdown;charset=utf-8');
  showToast('تم تصدير المحادثة بصيغة Markdown.');
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
      sendMessage();
    }
  });
  $('#temperature').addEventListener('input', (event) => {
    $('#temperature-value').textContent = Number(event.target.value).toFixed(2);
  });

  if (hasChrome) {
    chrome.tabs.onActivated.addListener(() => refreshPageContext());
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
لوحة وحاول مرة أخرى.', { error: true });
});
