/*!
 * Chat Bot Dev — Widget Loader (w.js)
 * مقتطف التضمين: <script src="https://widget.chatbotdev.app/w.js?id=CLIENT_ID" async defer></script>
 * - لا يلمس DOM موقع العميل إلا بعنصره المعزول (iframe sandbox)
 * - يحمل واجهة المحادثة عند أول نقرة فقط (Lazy)
 * - يدعم RTL/الثيم الكامل من إعدادات العميل
 */
(function () {
  'use strict';
  if (window.__CBD_LOADED__) return;
  window.__CBD_LOADED__ = true;

  var script = document.currentScript;
  if (!script) return;
  var params = new URL(script.src, location.href).searchParams;
  var clientId = params.get('id') || '';
  var HOST = (params.get('host') || '').replace(/\/+$/, '');
  if (!clientId) return;

  var DEFAULTS = {
    primary: '#0F766E',
    bubbleText: 'أهلاً! محتاج مساعدة؟',
    position: 'bottom-left',
    bubbleStyle: 'pill',
  };

  function injectStyles(css) {
    var style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
  }

  injectStyles(
    '#cbd-root{all:initial;position:fixed;z-index:2147483000;' +
      'font-family:Segoe UI,Tahoma,Cairo,sans-serif;direction:rtl}' +
      '#cbd-bubble{position:fixed;z-index:2147483001;display:flex;align-items:center;gap:8px;' +
      'border:none;cursor:pointer;box-shadow:0 8px 24px rgba(0,0,0,.18);transition:transform .18s ease}' +
      '#cbd-bubble:hover{transform:scale(1.06)}' +
      '#cbd-bubble.circle{width:58px;height:58px;border-radius:50%;justify-content:center}' +
      '#cbd-bubble.pill{border-radius:999px;padding:14px 20px}' +
      '#cbd-bubble .cbd-bubble-text{color:#fff;font-weight:700;font-size:14px}' +
      '#cbd-bubble svg{width:26px;height:26px;fill:#fff}' +
      '#cbd-frame{position:fixed;z-index:2147483002;width:390px;max-width:calc(100vw - 24px);' +
      'height:min(640px,calc(100vh - 110px));border:none;border-radius:18px;' +
      'box-shadow:0 18px 50px rgba(0,0,0,.28);opacity:0;transform:translateY(16px) scale(.98);' +
      'transition:opacity .22s ease,transform .22s ease;pointer-events:none;visibility:hidden}' +
      '#cbd-frame.open{opacity:1;transform:none;pointer-events:auto;visibility:visible}'
  );

  var bubble = document.createElement('button');
  bubble.id = 'cbd-bubble';
  bubble.type = 'button';
  bubble.setAttribute('aria-label', 'فتح المحادثة');
  bubble.innerHTML =
    '<svg viewBox="0 0 24 24"><path d="M12 3C6.5 3 2 6.9 2 11.7c0 2.6 1.3 5 3.4 6.6-.1 1-.5 2.4-1.4 3.7 2.5-.2 4.5-1 5.9-1.9.7.1 1.4.2 2.1.2 5.5 0 10-3.9 10-8.6S17.5 3 12 3z"/></svg>';

  var frame = document.createElement('iframe');
  frame.id = 'cbd-frame';
  frame.title = 'محادثة المساعد الذكي';
  frame.setAttribute('sandbox', 'allow-scripts allow-forms allow-same-origin allow-popups');
  frame.setAttribute('allow', 'clipboard-write');
  frame.style.display = 'none';

  function applyConfig(cfg) {
    var t = cfg && cfg.theme ? cfg.theme : DEFAULTS;
    var side = t.position === 'bottom-right' ? 'right' : 'left';
    bubble.style[t.position === 'bottom-right' ? 'right' : 'left'] = '20px';
    bubble.style.bottom = '20px';
    bubble.style.background = t.primary || DEFAULTS.primary;
    bubble.classList.add(t.bubbleStyle === 'circle' ? 'circle' : 'pill');
    if (t.bubbleStyle !== 'circle' && t.bubbleText) {
      var span = document.createElement('span');
      span.className = 'cbd-bubble-text';
      span.textContent = t.bubbleText;
      bubble.appendChild(span);
    }
    frame.style[t.position === 'bottom-right' ? 'right' : 'left'] = '20px';
    frame.style.bottom = '92px';
  }

  function openFrame() {
    if (!frame.src) {
      frame.src = HOST + '/w/frame?client=' + encodeURIComponent(clientId);
      document.body.appendChild(frame);
    }
    frame.style.display = 'block';
    requestAnimationFrame(function () {
      frame.classList.add('open');
      bubble.style.transform = 'scale(.85)';
    });
  }

  function closeFrame() {
    frame.classList.remove('open');
    bubble.style.transform = '';
    setTimeout(function () {
      frame.style.display = 'none';
    }, 240);
  }

  bubble.addEventListener('click', function () {
    if (frame.classList.contains('open')) closeFrame();
    else openFrame();
  });

  window.addEventListener('message', function (ev) {
    try {
      var d = ev.data || {};
      if (d.source !== 'cbd-widget') return;
      if (d.type === 'close') closeFrame();
      if (d.type === 'open') openFrame();
      if (d.type === 'resize' && d.height) frame.style.height = Math.min(d.height, window.innerHeight - 110) + 'px';
    } catch (e) {}
  });

  // تحميل إعداد العميل (مرة واحدة، كاش المتصفح 5 دقائق)
  try {
    fetch(HOST + '/w/config/' + encodeURIComponent(clientId), { cache: 'no-cache' })
      .then(function (r) {
        return r.ok ? r.json() : null;
      })
      .then(function (cfg) {
        applyConfig(cfg);
        document.body.appendChild(bubble);
      })
      .catch(function () {
        applyConfig(null);
        document.body.appendChild(bubble);
      });
  } catch (e) {
    applyConfig(null);
    document.body.appendChild(bubble);
  }
})();
