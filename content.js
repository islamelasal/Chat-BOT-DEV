(() => {
  const MAX_CONTENT_LENGTH = 14000;
  const MAX_HEADINGS = 22;
  const MAX_LINKS = 24;
  const MAX_CODE_BLOCKS = 6;
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
    return `${text.slice(0, maxLength)}\n[…تم اختصار محتوى الصفحة]`;
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
      .map((anchor) => {
        const url = publicUrl(anchor.href);
        return {
          url,
          text: cleanText(anchor.innerText || anchor.textContent || '')
        };
      })
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

  function collectContext() {
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

  function updateSelection() {
    const selection = cleanText(window.getSelection?.()?.toString());
    if (selection) lastSelection = selection.slice(0, 5000);
  }

  document.addEventListener('selectionchange', updateSelection, { passive: true });
  document.addEventListener('mouseup', updateSelection, { passive: true });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'GET_PAGE_CONTEXT') {
      try {
        sendResponse(collectContext());
      } catch (error) {
        sendResponse({
          available: false,
          title: document.title || 'الصفحة الحالية',
          url: window.location.href,
          reason: error.message
        });
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

    return false;
  });
})();
