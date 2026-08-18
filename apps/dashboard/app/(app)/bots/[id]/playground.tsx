'use client';

import { useRef, useState } from 'react';
import { Card, CardHeader } from '@/components/ui';

interface Msg {
  role: 'user' | 'assistant';
  content: string;
  meta?: string;
}

/** الملعب التجريبي — يبث الرد حياً (SSE) ويعرض المزود الفعلي الذي خدم الطلب */
export default function Playground({ bot }: { bot: any }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const send = async () => {
    const content = input.trim();
    if (!content || busy) return;
    setInput('');
    setBusy(true);
    setMessages((m) => [...m, { role: 'user', content }]);

    try {
      const res = await fetch('/backend/gateway/playground', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          botId: bot.id,
          message: content,
          history: messages.filter((m) => m.content).slice(-8).map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      if (!res.ok || !res.body) throw new Error('تعذر الوصول للملعب');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let acc = '';
      let meta = '';

      setMessages((m) => [...m, { role: 'assistant', content: '' }]);
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split('\n\n');
        buffer = blocks.pop() ?? '';
        for (const block of blocks) {
          const line = block.trim();
          if (!line.startsWith('data:')) continue;
          try {
            const json = JSON.parse(line.slice(5).trim());
            if (json.type === 'delta' && json.text) {
              acc += json.text;
              setMessages((m) => m.map((x, i) => (i === m.length - 1 ? { ...x, content: acc } : x)));
            } else if (json.type === 'error') {
              acc = `⚠️ ${json.message}`;
              setMessages((m) => m.map((x, i) => (i === m.length - 1 ? { ...x, content: acc } : x)));
            } else if (json.type === 'meta') {
              meta = `${json.providerId} · ${json.model} · ${json.latencyMs}ms${json.fallbackUsed ? ` · تنقّل عبر ${json.attempts} محاولات` : ''} · $${(json.costUsd ?? 0).toFixed(6)}`;
            }
          } catch {}
        }
      }
      setMessages((m) => m.map((x, i) => (i === m.length - 1 ? { ...x, meta } : x)));
    } catch (err) {
      setMessages((m) => [...m, { role: 'assistant', content: `⚠️ ${(err as Error).message}` }]);
    } finally {
      setBusy(false);
      requestAnimationFrame(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight }));
    }
  };

  return (
    <Card>
      <CardHeader title="الملعب التجريبي (Playground)" subtitle="اختبر البوت كما سيراه زوار موقع العميل — مع كشف المزود والنموذج الحقيقيين" />
      <div className="flex flex-col gap-3 p-5">
        <div ref={listRef} className="max-h-96 space-y-3 overflow-y-auto rounded-xl border border-slate-100 bg-slate-50 p-4">
          {messages.length === 0 && (
            <div className="py-8 text-center text-xs text-slate-400">
              اكتب سؤالاً مثل: «إيه سياسة الاسترجاع عندكم؟» وشاهد التدفق المباشر
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-start flex-row-reverse' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                m.role === 'user' ? 'bg-emerald-600 text-white' : 'border border-slate-200 bg-white text-slate-800'
              }`}>
                <div className="whitespace-pre-wrap">{m.content}</div>
                {m.meta && <div className="mt-2 border-t border-slate-100 pt-1.5 text-[10px] text-slate-400" dir="ltr">⚙ {m.meta}</div>}
              </div>
            </div>
          ))}
          {busy && <div className="text-[11px] text-slate-400">… يكتب الآن</div>}
        </div>
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), void send())}
            placeholder="اكتب رسالتك هنا واضغط Enter..."
            className="flex-1 rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-emerald-500"
            disabled={busy}
          />
          <button onClick={() => void send()} disabled={busy || !input.trim()} className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50">
            إرسال
          </button>
        </div>
      </div>
    </Card>
  );
}
