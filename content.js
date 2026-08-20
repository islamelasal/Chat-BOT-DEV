(() => {
  const MAX_CONTENT_LENGTH = 14000;
  const MAX_HEADINGS = 22;
  const MAX_LINKS = 24;
  const MAX_CODE_BLOCKS = 6;
  const MAX_CHAT_MESSAGES = 40;
  const MAX_CHAT_MESSAGE_LENGTH = 10000;
  let lastSelection = '';

  function cleanText(value) {
    return String(value || '')
      .replace(/\u00a0/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function limit(value, maxLength) {
    const text = cleanText(value);
    if (text.length <= maxLength) return text;
    return `${text.slice(0, maxLength)}\n[…تم اختصار النص]`;
  }

  function publicUrl(value) {
    try {
      const url = new URL(value, window.location.href);
      return /^https?:$/.test(url.protocol) ? url.href : '';
    } catch {
      return '';
    }
  }

  function getDescription() {
    const description = document.querySelector(
      'meta[name="description"], meta[property="og:description"], meta[name="twitter:description"]'
    );
    return cleanText(description?.getAttribute('content'));
  }

  function getCanonicalUrl() {
    const canonical = document.querySelector('link[rel="canonical"]')?.href;
    return publicUrl(canonical) || window.location.href;
  }

  function getMainText() {
    const candidates = [
      document.querySelector('article'),
      document.querySelector('main'),
      document.querySelector('[role="main"]'),
      document.body
    ].filter(Boolean);
    const source = candidates[0]?.cloneNode(true);
    if (!source) return '';

    source.querySelectorAll(
      'script, style, noscript, template, svg, canvas, nav, footer, header, aside, form, dialog, iframe, [aria-hidden="true"], [hidden]'
    ).forEach((element) => element.remove());

    return limit(source.innerText || source.textContent || '', MAX_CONTENT_LENGTH);
  }

  function extractLinks() {
    const seen = new Set();
    return Array.from(document.querySelectorAll('a[href]'))
      .map((anchor) => ({
        url: publicUrl(anchor.href),
        text: cleanText(anchor.innerText || anchor.textContent || '')
      }))
      .filter((link) => {
        if (!link.url || seen.has(link.url)) return false;
        seen.add(link.url);
        return link.text.length > 1 || link.url !== window.location.href;
      })
      .slice(0, MAX_LINKS);
  }

  function extractCodeBlocks() {
    return Array.from(document.querySelectorAll('pre'))
      .map((element) => {
        const codeElement = element.querySelector('code') || element;
        const code = cleanText(codeElement.innerText || codeElement.textContent || '');
        if (!code) return null;
        const className = `${element.className || ''} ${codeElement.className || ''}`;
        const language = String(className).match(/language-([\w-]+)/i)?.[1] || '';
        return { language, code: code.slice(0, 2600) };
      })
      .filter(Boolean)
      .slice(0, MAX_CODE_BLOCKS);
  }

  function detectPageType() {
    if (document.querySelector('article, [itemtype*="Article"], [property="articleBody"]')) return 'article';
    if (document.querySelector('form[action*="login"], input[type="password"]')) return 'account';
    if (document.querySelector('pre code, .repository-content, [class*="documentation"]')) return 'technical';
    return 'webpage';
  }

  function collectPageContext() {
    const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4'))
      .map((heading) => cleanText(heading.innerText || heading.textContent))
      .filter(Boolean)
      .slice(0, MAX_HEADINGS);
    const content = getMainText();

    return {
      available: true,
      title: cleanText(document.title) || 'صفحة بلا عنوان',
      url: window.location.href,
      canonicalUrl: getCanonicalUrl(),
      description: getDescription(),
      language: document.documentElement.lang || navigator.language || '',
      pageType: detectPageType(),
      headings,
      links: extractLinks(),
      codeBlocks: extractCodeBlocks(),
      content,
      wordCount: content ? content.split(/\s+/).length : 0,
      selection: lastSelection || cleanText(window.getSelection?.()?.toString()),
      capturedAt: Date.now()
    };
  }

  function detectAiProvider() {
    const host = window.location.hostname.toLowerCase();
    if (host === 'chatgpt.com' || host.endsWith('.chatgpt.com') || host === 'chat.openai.com') {
      return { id: 'chatgpt', label: 'ChatGPT' };
    }
    if (host === 'gemini.google.com' || host.endsWith('.gemini.google.com')) {
      return { id: 'gemini', label: 'Google Gemini' };
    }
    if (host === 'claude.ai' || host.endsWith('.claude.ai')) {
      return { id: 'claude', label: 'Claude' };
    }
    if (host === 'perplexity.ai' || host.endsWith('.perplexity.ai')) {
      return { id: 'perplexity', label: 'Perplexity' };
    }
    return { id: 'generic', label: 'AI chat' };
  }

  function visible(element) {
    if (!element) return false;
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  }

  function firstVisible(selectors) {
    for (const selector of selectors) {
      try {
        const element = document.querySelector(selector);
        if (visible(element)) return element;
      } catch {
        // Ignore a selector unsupported by an older page implementation.
      }
    }
    return null;
  }

  function providerMessageSelectors(provider) {
    const selectors = {
      chatgpt: [
        '[data-message-author-role="user"]',
        '[data-message-author-role="assistant"]'
      ],
      gemini: ['user-query', 'model-response', '[data-message-author-role]'],
      claude: [
        '[data-testid="user-message"]',
        '[data-testid="assistant-message"]',
        '.font-user-message',
        '.font-claude-message'
      ],
      perplexity: ['[data-testid*="message"]', '[class*="prose"]'],
      generic: ['[data-message-author-role]', '[data-testid*="message"]']
    };
    return selectors[provider] || selectors.generic;
  }

  function roleForElement(element, provider) {
    const explicit = element.getAttribute('data-message-author-role');
    if (explicit === 'user' || explicit === 'assistant') return explicit;
    const testId = `${element.getAttribute('data-testid') || ''} ${element.className || ''}`.toLowerCase();
    const tag = element.tagName.toLowerCase();
    if (tag === 'user-query' || testId.includes('user-message') || testId.includes('font-user')) return 'user';
    if (tag === 'model-response' || testId.includes('assistant-message') || testId.includes('font-claude')) return 'assistant';
    if (provider === 'gemini' && tag.includes('user')) return 'user';
    if (provider === 'gemini' && tag.includes('model')) return 'assistant';
    return null;
  }

  function collectAiMessages(provider) {
    const elements = [];
    const seen = new Set();
    providerMessageSelectors(provider).forEach((selector) => {
      let matches = [];
      try { matches = Array.from(document.querySelectorAll(selector)); } catch { matches = []; }
      matches.forEach((element) => {
        if (seen.has(element)) return;
        const role = roleForElement(element, provider);
        const content = cleanText(element.innerText || element.textContent || '');
        if (!role || !content || content.length < 1) return;
        seen.add(element);
        elements.push({ element, role, content });
      });
    });

    // DOM order is usually the conversation order. Remove nested duplicates,
    // which are common when a provider renders a message in two wrappers.
    const messages = elements
      .sort((a, b) => a.element.compareDocumentPosition(b.element) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1)
      .filter((message, index, list) => {
        const previous = list[index - 1];
        return !previous || previous.role !== message.role || previous.content !== message.content;
      })
      .map(({ role, content }) => ({ role, content: content.slice(0, MAX_CHAT_MESSAGE_LENGTH) }))
      .slice(-MAX_CHAT_MESSAGES);
    return messages;
  }

  function findComposer(provider) {
    const selectors = {
      chatgpt: [
        '#prompt-textarea',
        'textarea[data-id="root"]',
        'textarea[placeholder*="Message"]',
        'div[contenteditable="true"][data-placeholder]'
      ],
      gemini: [
        'rich-textarea [contenteditable="true"]',
        'rich-textarea textarea',
        'textarea[placeholder*="Enter"]',
        'div[contenteditable="true"]'
      ],
      claude: [
        'div[contenteditable="true"]',
        'textarea[placeholder*="Reply"]',
        'textarea[placeholder*="message"]'
      ],
      perplexity: ['textarea[placeholder*="Ask"]', 'textarea', 'div[contenteditable="true"]'],
      generic: ['textarea:not([disabled])', 'div[contenteditable="true"]']
    };
    return firstVisible(selectors[provider] || selectors.generic);
  }

  function findSendButton(provider) {
    const common = [
      'button[data-testid="send-button"]',
      'button[aria-label*="Send"]',
      'button[aria-label*="send"]',
      'button[aria-label*="إرسال"]',
      'button[type="submit"]'
    ];
    const providerSelectors = {
      chatgpt: ['button[data-testid="send-button"]', ...common],
      gemini: ['button[aria-label*="Send"]', 'button[aria-label*="إرسال"]', ...common],
      claude: ['button[aria-label*="Send Message"]', ...common],
      perplexity: common,
      generic: common
    };
    return firstVisible(providerSelectors[provider] || common);
  }

  function isAiBusy(provider) {
    const selectors = {
      chatgpt: ['button[data-testid="stop-button"]', 'button[aria-label*="Stop"]'],
      gemini: ['button[aria-label*="Stop"]', 'button[aria-label*="إيقاف"]'],
      claude: ['button[aria-label*="Stop"]'],
      perplexity: ['button[aria-label*="Stop"]'],
      generic: ['button[aria-label*="Stop"]', 'button[aria-label*="إيقاف"]']
    };
    return Boolean(firstVisible(selectors[provider] || selectors.generic));
  }

  function collectAiChatState() {
    const provider = detectAiProvider();
    const composer = findComposer(provider.id);
    const messages = collectAiMessages(provider.id);
    const lastAssistant = [...messages].reverse().find((message) => message.role === 'assistant');
    const supported = Boolean(composer) && (messages.length > 0 || provider.id !== 'generic');
    return {
      available: true,
      supported,
      provider: provider.id,
      providerLabel: provider.label,
      title: cleanText(document.title),
      url: window.location.href,
      messages,
      messageCount: messages.length,
      lastAssistant: lastAssistant?.content || '',
      composerAvailable: Boolean(composer),
      composerKind: composer?.isContentEditable ? 'contenteditable' : composer ? 'textarea' : '',
      busy: isAiBusy(provider.id),
      observedAt: Date.now()
    };
  }

  function dispatchInput(element) {
    element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: null }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function setComposerValue(composer, value) {
    composer.focus();
    if (composer.isContentEditable) {
      document.execCommand('selectAll', false);
      document.execCommand('insertText', false, value);
      if (cleanText(composer.innerText) !== value) composer.textContent = value;
      dispatchInput(composer);
      return;
    }
    const prototype = composer instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
    if (setter) setter.call(composer, value);
    else composer.value = value;
    dispatchInput(composer);
  }

  async function sendAiPrompt(prompt) {
    const provider = detectAiProvider();
    const composer = findComposer(provider.id);
    if (!composer) return { ok: false, reason: 'composer-not-found', state: collectAiChatState() };
    if (isAiBusy(provider.id)) return { ok: false, reason: 'ai-is-busy', state: collectAiChatState() };
    setComposerValue(composer, String(prompt || '').slice(0, 12000));
    await new Promise((resolve) => setTimeout(resolve, 120));
    const button = findSendButton(provider.id);
    if (button && !button.disabled) button.click();
    else {
      composer.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
      composer.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
    }
    return { ok: true, state: collectAiChatState() };
  }

  async function waitForAiResponse({ baselineCount = 0, baselineAssistant = '', timeoutMs = 90000 } = {}) {
    const started = Date.now();
    let stableAssistant = '';
    let stableCount = 0;
    while (Date.now() - started < Math.min(Math.max(timeoutMs, 5000), 180000)) {
      const current = collectAiChatState();
      const changed = current.messageCount > baselineCount ||
        (current.lastAssistant && current.lastAssistant !== baselineAssistant);
      if (changed && !current.busy && current.lastAssistant) {
        if (current.lastAssistant === stableAssistant) stableCount += 1;
        else {
          stableAssistant = current.lastAssistant;
          stableCount = 0;
        }
        // Two equal idle snapshots means the provider finished rendering.
        if (stableCount >= 1) return { ok: true, timedOut: false, state: current };
      }
      await new Promise((resolve) => setTimeout(resolve, 900));
    }
    return { ok: false, timedOut: true, state: collectAiChatState() };
  }

  function updateSelection() {
    const selection = cleanText(window.getSelection?.()?.toString());
    if (selection) lastSelection = selection.slice(0, 5000);
  }

  document.addEventListener('selectionchange', updateSelection, { passive: true });
  document.addEventListener('mouseup', updateSelection, { passive: true });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'GET_PAGE_CONTEXT') {
      try {
        sendResponse(collectPageContext());
      } catch (error) {
        sendResponse({ available: false, title: document.title || 'الصفحة الحالية', url: window.location.href, reason: error.message });
      }
      return true;
    }

    if (message?.type === 'GET_SELECTION') {
      sendResponse({ selection: lastSelection || cleanText(window.getSelection?.()?.toString()) });
      return true;
    }

    if (message?.type === 'SET_SELECTION') {
      lastSelection = cleanText(message.text).slice(0, 5000);
      sendResponse({ ok: true });
      return true;
    }

    if (message?.type === 'AI_CHAT_GET_STATE') {
      sendResponse(collectAiChatState());
      return true;
    }

    if (message?.type === 'AI_CHAT_SEND_PROMPT') {
      sendAiPrompt(message.prompt).then(sendResponse).catch((error) => sendResponse({ ok: false, reason: error.message }));
      return true;
    }

    if (message?.type === 'AI_CHAT_WAIT_FOR_RESPONSE') {
      waitForAiResponse(message).then(sendResponse).catch((error) => sendResponse({ ok: false, reason: error.message, timedOut: true }));
      return true;
    }

    return false;
  });
})();
