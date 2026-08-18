/**
 * واجهة محادثة الودجت — تعمل داخل iframe معزول (sandbox)
 * - بث SSE حي token-by-token
 * - جلسات موقّعة + سياق الصفحة (من document.referrer)
 * - تقييم الردود 👍/👎
 */
import { render } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import './styles.css';

declare global {
  interface Window {
    __CBD_WIDGET__: { clientId: string; apiBase: string };
  }
}

interface Theme {
  primary: string;
  secondary: string;
  background: string;
  bubbleText: string;
  headerText: string;
  font: string;
  position: string;
  bubbleStyle: string;
  windowMode: string;
  welcomeTitle: string;
  welcomeText: string;
  suggestions: string[];
  showBrand: boolean;
  logoUrl: string | null;
  poweredBy: boolean;
  leadEnabled?: boolean;
  leadTitle?: string;
  leadButton?: string;
  leadAskPhone?: boolean;
  handoffEnabled?: boolean;
  handoffTitle?: string;
  handoffWhatsapp?: string;
  handoffPhone?: string;
  handoffEmail?: string;
}

interface Msg {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  feedback: 'up' | 'down' | null;
  streaming?: boolean;
  conversationId?: string;
}

const w = window.__CBD_WIDGET__ ?? { clientId: 'demo', apiBase: '' };
const API = w.apiBase || '';

function pageContext(): { path: string; title: string; lang: string } {
  try {
    const ref = document.referrer;
    if (ref) {
      const u = new URL(ref);
      return { path: u.pathname || '/', title: document.title || '', lang: 'ar' };
    }
  } catch {}
  return { path: '/', title: '', lang: 'ar' };
}

let sessionToken: string | null = null;
let visitorId = (() => {
  try {
    let v = localStorage.getItem('cbd_vid');
    if (!v) {
      v = 'v_' + Math.random().toString(36).slice(2, 14);
      localStorage.setItem('cbd_vid', v);
    }
    return v;
  } catch {
    return 'v_' + Math.random().toString(36).slice(2, 14);
  }
})();

async function ensureSession(botId: string): Promise<string | null> {
  try {
    const res = await fetch(API + '/w/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ clientId: w.clientId, botId, visitorId }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    sessionToken = json.token;
    return sessionToken;
  } catch {
    return null;
  }
}

function App() {
  const [cfg, setCfg] = useState<{ clientName: string; theme: Theme; botId: string } | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [logoFailed, setLogoFailed] = useState(false);
  const [leadOpen, setLeadOpen] = useState(false);
  const [leadForm, setLeadForm] = useState({ name: '', email: '', phone: '' });
  const [leadSent, setLeadSent] = useState(false);
  const [leadBusy, setLeadBusy] = useState(false);
  const [leadError, setLeadError] = useState('');
  const [handoffOpen, setHandoffOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(API + '/w/config/' + encodeURIComponent(w.clientId))
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (!json) return;
        setCfg(json);
        if (json.theme?.welcomeText) {
          setMessages([{ id: 'welcome', role: 'assistant', content: json.theme.welcomeText, feedback: null }]);
        }
      })
      .catch(() => setError('تعذر تحميل البوت — تأكد من اتصالك'));
  }, []);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const onMsg = (ev: MessageEvent) => {
      try {
        const d = ev.data || {};
        if (d.source === 'cbd-host' && d.type === 'close') {
          // مضيف الصفحة طلب إغلاق — نُعلم المحمّل
          window.parent.postMessage({ source: 'cbd-widget', type: 'close' }, '*');
        }
      } catch {}
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);

  const theme: Theme = cfg?.theme ?? {
    primary: '#0F766E', secondary: '#F59E0B', background: '#FFFFFF', bubbleText: '', headerText: '#FFFFFF',
    font: 'Cairo', position: 'bottom-left', bubbleStyle: 'pill', windowMode: 'docked',
    welcomeTitle: 'المساعد الذكي', welcomeText: '', suggestions: [], showBrand: true, logoUrl: null, poweredBy: true,
    leadEnabled: true, leadTitle: 'سيب بياناتك وهنتواصل معاك', leadButton: '📞 اطلب التواصل معاك', leadAskPhone: true,
    handoffEnabled: true, handoffTitle: 'محتاج مساعدة من فريقنا؟', handoffWhatsapp: '', handoffPhone: '', handoffEmail: '',
  };

  const cssVars: Record<string, string> = {
    '--cbd-primary': theme.primary,
    '--cbd-secondary': theme.secondary,
    '--cbd-bg': theme.background,
    '--cbd-header-text': theme.headerText,
    '--cbd-font': `'${theme.font}', 'Segoe UI', Tahoma, sans-serif`,
  };

  async function send(text: string) {
    const content = text.trim();
    if (!content || busy || !cfg) return;
    setError('');
    setInput('');
    setBusy(true);

    const userMsg: Msg = { id: 'u_' + Date.now(), role: 'user', content, feedback: null };
    const assistantMsg: Msg = { id: 'a_' + Date.now(), role: 'assistant', content: '', feedback: null, streaming: true };
    setMessages((m) => [...m, userMsg, assistantMsg]);

    try {
      const token = sessionToken ?? (await ensureSession(cfg.botId));
      if (!token) throw new Error('تعذر إنشاء جلسة');

      const res = await fetch(API + '/w/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionToken: token, message: content, page: pageContext() }),
      });
      if (!res.ok || !res.body) {
        const body = await res.text().catch(() => '');
        throw new Error(body ? body.slice(0, 140) : 'تعذر الوصول للخدمة');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let acc = '';
      let convId = '';

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() ?? '';
        for (const block of lines) {
          const line = block.trim();
          if (!line.startsWith('data:')) continue;
          const data = line.slice(5).trim();
          if (data === '[DONE]') continue;
          try {
            const json = JSON.parse(data);
            if (json.type === 'delta' && json.text) {
              acc += json.text;
              setMessages((m) => m.map((msg) => (msg.id === assistantMsg.id ? { ...msg, content: acc } : msg)));
            } else if (json.type === 'error') {
              setError(json.message ?? 'حدث خطأ');
            } else if (json.type === 'done') {
              convId = json.conversationId ?? '';
            }
          } catch {}
        }
      }
      setMessages((m) =>
        acc
          ? m.map((msg) =>
              msg.id === assistantMsg.id
                ? { ...msg, content: acc, streaming: false, conversationId: convId || undefined }
                : msg
            )
          : m.filter((msg) => msg.id !== assistantMsg.id)
      );
    } catch (err) {
      setError((err as Error).message);
      setMessages((m) => m.filter((msg) => msg.id !== assistantMsg.id));
    } finally {
      setBusy(false);
    }
  }

  async function feedback(msg: Msg, value: 'up' | 'down') {
    if (!msg.conversationId) return;
    try {
      await fetch(API + '/w/feedback', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ conversationId: msg.conversationId, messageId: msg.id, feedback: value }),
      });
      setMessages((m) => m.map((x) => (x.id === msg.id ? { ...x, feedback: value } : x)));
    } catch {}
  }

  const close = () => window.parent.postMessage({ source: 'cbd-widget', type: 'close' }, '*');

  /** تسجيل نقرة التحويل البشري في العدادات (بدون انتظار) */
  function logHandoff(method: 'whatsapp' | 'phone' | 'email') {
    if (!sessionToken) return;
    fetch(API + '/w/handoff', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionToken, method }),
    }).catch(() => {});
  }

  async function submitLead() {
    if (!cfg || leadBusy) return;
    if (!leadForm.name.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(leadForm.email.trim())) {
      setLeadError('اكتب اسمك وبريد صحيح من فضلك');
      return;
    }
    setLeadBusy(true);
    setLeadError('');
    try {
      const token = sessionToken ?? (await ensureSession(cfg.botId));
      if (!token) throw new Error('تعذر إنشاء جلسة');
      const res = await fetch(API + '/w/lead', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sessionToken: token,
          name: leadForm.name.trim(),
          email: leadForm.email.trim(),
          phone: leadForm.phone.trim(),
          message: '',
        }),
      });
      if (!res.ok) throw new Error('تعذر حفظ البيانات');
      setLeadSent(true);
      setMessages((m) => [
        ...m,
        { id: 'lead_' + Date.now(), role: 'assistant', content: 'تمام يا ' + leadForm.name.trim() + ' 👌\n\nوصلتنا بياناتك وهنتواصل معاك في أقرب وقت. لو محتاج حاجة عاجلة: 16959.', feedback: null },
      ]);
    } catch (err) {
      setLeadError((err as Error).message);
    } finally {
      setLeadBusy(false);
    }
  }

  return (
    <div className="cbd-app" style={cssVars} dir="rtl">
      <header className="cbd-header">
        <div className="cbd-header-info">
          {theme.logoUrl && !logoFailed ? (
            <img
              className="cbd-logo"
              src={theme.logoUrl}
              alt=""
              referrerPolicy="no-referrer"
              onError={() => setLogoFailed(true)}
            />
          ) : (
            <span className="cbd-avatar">💬</span>
          )}
          <div>
            <div className="cbd-title">{theme.welcomeTitle || cfg?.clientName || 'المساعد الذكي'}</div>
            <div className="cbd-status"><span className="cbd-dot" /> متصل الآن</div>
          </div>
        </div>
        <button className="cbd-close" onClick={close} aria-label="إغلاق">✕</button>
      </header>

      <div className="cbd-messages" ref={listRef}>
        {messages.map((msg) => (
          <div key={msg.id} className={'cbd-row ' + (msg.role === 'user' ? 'user' : 'bot')}>
            <div className="cbd-bubble">
              <div className="cbd-bubble-content">{msg.content}{msg.streaming && <span className="cbd-cursor" />}</div>
              {msg.role === 'assistant' && msg.id !== 'welcome' && !msg.streaming && msg.content && (
                <div className="cbd-feedback">
                  <button className={msg.feedback === 'up' ? 'active' : ''} onClick={() => feedback(msg, 'up')}>👍</button>
                  <button className={msg.feedback === 'down' ? 'active' : ''} onClick={() => feedback(msg, 'down')}>👎</button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {theme.suggestions?.length > 0 && messages.length <= 1 && !leadOpen && (
        <div className="cbd-suggestions">
          {theme.suggestions.map((s) => (
            <button key={s} className="cbd-chip" onClick={() => send(s)}>{s}</button>
          ))}
        </div>
      )}

      {/* جمع بيانات العميل المحتمل (Lead Capture) */}
      {theme.leadEnabled && !leadSent && (
        <div className="cbd-lead">
          {!leadOpen ? (
            <button className="cbd-lead-btn" onClick={() => setLeadOpen(true)}>
              {theme.leadButton ?? '📞 اطلب التواصل معاك'}
            </button>
          ) : (
            <div className="cbd-lead-form">
              <div className="cbd-lead-title">{theme.leadTitle ?? 'سيب بياناتك وهنتواصل معاك'}</div>
              <input
                className="cbd-input"
                placeholder="اسمك"
                value={leadForm.name}
                onInput={(e) => setLeadForm({ ...leadForm, name: (e.target as HTMLInputElement).value })}
              />
              <input
                className="cbd-input"
                type="email"
                dir="ltr"
                placeholder="البريد الإلكتروني"
                value={leadForm.email}
                onInput={(e) => setLeadForm({ ...leadForm, email: (e.target as HTMLInputElement).value })}
              />
              {theme.leadAskPhone && (
                <input
                  className="cbd-input"
                  type="tel"
                  dir="ltr"
                  placeholder="رقم التليفون (اختياري)"
                  value={leadForm.phone}
                  onInput={(e) => setLeadForm({ ...leadForm, phone: (e.target as HTMLInputElement).value })}
                />
              )}
              {leadError && <div className="cbd-error">{leadError}</div>}
              <div className="cbd-lead-actions">
                <button className="cbd-send" style={{ width: '100%' }} onClick={() => void submitLead()} disabled={leadBusy}>
                  {leadBusy ? '...' : 'إرسال ✓'}
                </button>
                <button className="cbd-lead-cancel" onClick={() => setLeadOpen(false)}>إلغاء</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* التحويل لمندوب بشري (Human Handoff) */}
      {theme.handoffEnabled && (theme.handoffWhatsapp || theme.handoffPhone || theme.handoffEmail) && (
        <div className="cbd-lead">
          {!handoffOpen ? (
            <button className="cbd-lead-btn" onClick={() => setHandoffOpen(true)}>
              👨‍💼 {theme.handoffTitle ?? 'محتاج مساعدة من فريقنا؟'}
            </button>
          ) : (
            <div className="cbd-lead-form">
              <div className="cbd-lead-title">تواصل معانا مباشرة:</div>
              {theme.handoffWhatsapp && (
                <a
                  className="cbd-handoff-link"
                  href={`https://wa.me/${theme.handoffWhatsapp.replace(/[^0-9]/g, '')}?text=${encodeURIComponent('مرحباً، عندي استفسار عن منتجاتكم')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => logHandoff('whatsapp')}
                >
                  <span>💬</span> واتساب مباشر
                </a>
              )}
              {theme.handoffPhone && (
                <a className="cbd-handoff-link" href={`tel:${theme.handoffPhone}`} onClick={() => logHandoff('phone')}>
                  <span>📞</span> اتصل بينا: {theme.handoffPhone}
                </a>
              )}
              {theme.handoffEmail && (
                <a className="cbd-handoff-link" href={`mailto:${theme.handoffEmail}`} onClick={() => logHandoff('email')}>
                  <span>✉️</span> راسلنا بريد
                </a>
              )}
              <button className="cbd-lead-cancel" onClick={() => setHandoffOpen(false)}>إغلاق</button>
            </div>
          )}
        </div>
      )}

      {error && <div className="cbd-error">⚠️ {error}</div>}

      <footer className="cbd-footer">
        <input
          className="cbd-input"
          value={input}
          placeholder="اكتب رسالتك هنا..."
          onInput={(e) => setInput((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send(input);
            }
          }}
          disabled={busy}
        />
        <button className="cbd-send" onClick={() => void send(input)} disabled={busy || !input.trim()} aria-label="إرسال">
          ➤
        </button>
      </footer>
      {theme.poweredBy && <div className="cbd-powered">مدعوم من Chat Bot Dev</div>}
    </div>
  );
}

render(<App />, document.getElementById('cbd-widget-app')!);
