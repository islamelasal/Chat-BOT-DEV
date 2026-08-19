(() => {
  const MAX_CONTENT_LENGTH = 12000;
  const MAX_HEADINGS = 18;
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

  function getDescription() {
    const description = document.querySelector(
      'meta[name="description"], meta[property="og:description"]'
    );
    return cleanText(description?.getAttribute('content'));
  }

  function getMainText() {
    const candidates = [
      document.querySelector('article'),
      document.querySelector('main'),
      document.querySelector('[role="main"]'),
      document.body
    ].filter(Boolean);

    const source = candidates[0].cloneNode(true);
    source.querySelectorAll(
      'script, style, noscript, template, svg, canvas, nav, footer, header, aside, form, [aria-hidden="true"]'
    ).forEach((element) => element.remove());

    return limit(source.innerText || source.textContent || '', MAX_CONTENT_LENGTH);
  }

  function collectContext() {
    const headings = Array.from(document.querySelectorAll('h1, h2, h3'))
      .map((heading) => cleanText(heading.innerText || heading.textContent))
      .filter(Boolean)
      .slice(0, MAX_HEADINGS);

    return {
      available: true,
      title: cleanText(document.title) || 'صفحة بلا عنوان',
      url: window.location.href,
      description: getDescription(),
      headings,
      content: getMainText(),
      selection: lastSelection || cleanText(window.getSelection?.()?.toString()),
      capturedAt: Date.now()
    };
  }

  function updateSelection() {
    const selection = cleanText(window.getSelection?.()?.toString());
    if (selection) lastSelection = selection.slice(0, 4000);
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
      lastSelection = cleanText(message.text).slice(0, 4000);
      sendResponse({ ok: true });
      return true;
    }

    return false;
  });
})();
