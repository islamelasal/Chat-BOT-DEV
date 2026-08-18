/*!
 * Chat Bot Dev — Widget Loader (w.js)
 * مقتطف التضمين: <script src="https://widget.chatbotdev.app/w.js?id=CLIENT_ID" async defer></script>
 * - لا يلمس DOM موقع العميل إلا بعنصره المعزول (iframe sandbox)
 * - يحمل واجهة المحادثة عند أول نقرة فقط (Lazy) — صفر تأثير على سرعة الموقع
 * - أيقونة قابلة للتخصيص لكل عميل (دردشة / مفتاح ذهبي / صورة مخصصة)
 * - مؤشر مخصص (المفتاح) عند التحويم + تدرّج لوني + حركة فتح ناعمة
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
    secondary: '#F59E0B',
    bubbleText: 'أهلاً! محتاج مساعدة؟',
    position: 'bottom-left',
    bubbleStyle: 'pill',
    bubbleIcon: 'chat',
    cursorKey: false,
  };

  // أيقونة المفتاح الذهبي (متجهة — نقية على كل المقاسات)
  var KEY_SVG =
    '<svg viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg">' +
    '<circle cx="48" cy="62" r="26" fill="none" stroke="#8A5A0B" stroke-width="14"/>' +
    '<circle cx="48" cy="62" r="21" fill="none" stroke="#F5D061" stroke-width="5"/>' +
    '<circle cx="48" cy="62" r="14" fill="none" stroke="#C9971B" stroke-width="3"/>' +
    '<path d="M72 55 H112 a7 7 0 0 1 0 14 H72 Z" fill="#8A5A0B"/>' +
    '<path d="M72 57 H112 a5 5 0 0 1 0 10 H72 Z" fill="#C9971B"/>' +
    '<path d="M72 57 H96 a3 3 0 0 1 0 6 H72 Z" fill="#F5D061"/>' +
    '<rect x="94" y="71" width="14" height="10" rx="2" fill="#8A5A0B"/>' +
    '<rect x="96" y="73" width="10" height="6" rx="1" fill="#F5D061"/>' +
    '<rect x="94" y="83" width="14" height="10" rx="2" fill="#8A5A0B"/>' +
    '<rect x="96" y="85" width="10" height="6" rx="1" fill="#F5D061"/>' +
    '<circle cx="37" cy="51" r="6" fill="#FFECAA" opacity="0.9"/>' +
    '</svg>';

  function injectStyles(css) {
    var style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
  }

  injectStyles(
    '#cbd-root{all:initial;position:fixed;z-index:2147483000;' +
      'font-family:Segoe UI,Tahoma,Cairo,sans-serif;direction:rtl}' +
      '#cbd-bubble{position:fixed;z-index:2147483001;display:flex;align-items:center;gap:8px;' +
      'border:none;cursor:pointer;box-shadow:0 8px 24px rgba(0,0,0,.18);' +
      'transition:transform .18s cubic-bezier(.34,1.56,.64,1);' +
      'animation:cbd-pop .45s cubic-bezier(.34,1.56,.64,1) both}' +
      '@keyframes cbd-pop{0%{transform:scale(0);opacity:0}70%{transform:scale(1.08)}100%{transform:scale(1);opacity:1}}' +
      '#cbd-bubble:hover{transform:scale(1.07)}' +
      '#cbd-bubble.circle{width:62px;height:62px;border-radius:50%;justify-content:center;' +
      'background:linear-gradient(135deg,var(--cbd-p,#0f766e),var(--cbd-s,#f59e0b));' +
      'border:2px solid rgba(255,255,255,.55)}' +
      '#cbd-bubble.pill{border-radius:999px;padding:14px 20px;' +
      'background:linear-gradient(135deg,var(--cbd-p,#0f766e),var(--cbd-s,#f59e0b))}' +
      '#cbd-bubble .cbd-bubble-text{color:#fff;font-weight:700;font-size:14px;text-shadow:0 1px 2px rgba(0,0,0,.2)}' +
      '#cbd-bubble svg{width:30px;height:30px;filter:drop-shadow(0 1px 2px rgba(0,0,0,.25))}' +
      '#cbd-bubble img{width:32px;height:32px;object-fit:contain;filter:drop-shadow(0 1px 2px rgba(0,0,0,.3))}' +
      '#cbd-frame{position:fixed;z-index:2147483002;width:390px;max-width:calc(100vw - 24px);' +
      'height:min(640px,calc(100vh - 110px));border:none;border-radius:18px;' +
      'box-shadow:0 18px 50px rgba(0,0,0,.28);opacity:0;transform:translateY(16px) scale(.98);' +
      'transition:opacity .22s ease,transform .28s cubic-bezier(.34,1.4,.64,1);' +
      'pointer-events:none;visibility:hidden;background:#fff}' +
      '#cbd-frame.open{opacity:1;transform:none;pointer-events:auto;visibility:visible}'
  );

  var bubble = document.createElement('button');
  bubble.id = 'cbd-bubble';
  bubble.type = 'button';
  bubble.setAttribute('aria-label', 'فتح المحادثة');
  bubble.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 3C6.5 3 2 6.9 2 11.7c0 2.6 1.3 5 3.4 6.6-.1 1-.5 2.4-1.4 3.7 2.5-.2 4.5-1 5.9-1.9.7.1 1.4.2 2.1.2 5.5 0 10-3.9 10-8.6S17.5 3 12 3z"/></svg>';

  var frame = document.createElement('iframe');
  frame.id = 'cbd-frame';
  frame.title = 'محادثة المساعد الذكي';
  frame.setAttribute('sandbox', 'allow-scripts allow-forms allow-same-origin allow-popups');
  frame.setAttribute('allow', 'clipboard-write');
  frame.setAttribute('loading', 'lazy');
  frame.style.display = 'none';

  var cursorUrl = '';

  function resolveUrl(path) {
    try {
      if (/^https?:\/\//.test(path)) return path;
      if (/^data:/.test(path)) return path;
      return new URL(path, HOST || location.origin).toString();
    } catch (e) {
      return path;
    }
  }

  function renderIcon(t) {
    var icon = t.bubbleIcon || DEFAULTS.bubbleIcon;
    if (icon === 'custom' && t.bubbleIconUrl) {
      var img = document.createElement('img');
      img.src = resolveUrl(t.bubbleIconUrl);
      img.alt = '';
      return img;
    }
    if (icon === 'key') {
      var span = document.createElement('span');
      span.style.width = '30px';
      span.style.height = '30px';
      span.style.display = 'inline-block';
      span.innerHTML = KEY_SVG;
      var svg = span.firstChild;
      if (svg && svg.setAttribute) {
        svg.setAttribute('width', '30');
        svg.setAttribute('height', '30');
      }
      return span;
    }
    var span2 = document.createElement('span');
    span2.style.width = '30px';
    span2.style.height = '30px';
    span2.style.display = 'inline-block';
    span2.innerHTML = bubble.innerHTML;
    return span2;
  }

  function applyConfig(cfg) {
    var t = cfg && cfg.theme ? cfg.theme : DEFAULTS;
    var side = t.position === 'bottom-right' ? 'right' : 'left';
    bubble.style[t.position === 'bottom-right' ? 'right' : 'left'] = '20px';
    bubble.style.bottom = '20px';
    bubble.style.setProperty('--cbd-p', t.primary || DEFAULTS.primary);
    bubble.style.setProperty('--cbd-s', t.secondary || DEFAULTS.secondary);

    // أيقونة الفقاعة
    bubble.innerHTML = '';
    var isCircle = t.bubbleStyle !== 'pill' || (t.bubbleIcon && t.bubbleIcon !== 'chat');
    bubble.classList.add(isCircle ? 'circle' : 'pill');
    bubble.appendChild(renderIcon(t));
    if (!isCircle && t.bubbleText) {
      var spanT = document.createElement('span');
      spanT.className = 'cbd-bubble-text';
      spanT.textContent = t.bubbleText;
      bubble.appendChild(spanT);
    }

    // مؤشر مخصص (المفتاح) عند التحويم — يُحمَّل فقط عند أول استخدام (صفر تأثير على السرعة)
    if (t.cursorKey) {
      cursorUrl = t.bubbleIconUrl ? resolveUrl(t.bubbleIconUrl) : resolveUrl('/assets/key-32.png');
      bubble.style.cursor = 'url("' + cursorUrl + '") 8 8, pointer';
      frame.style.cursor = 'url("' + cursorUrl + '") 8 8, pointer';
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
    }, 300);
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
