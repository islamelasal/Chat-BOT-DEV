'use client';

import { useState } from 'react';
import { Button, Card, CardHeader, Field, Input, Textarea } from '@/components/ui';

export default function KnowledgeEditor({ bot }: { bot: any }) {
  const [chunks, setChunks] = useState(bot.knowledgeChunks ?? []);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [source, setSource] = useState('');
  const [busy, setBusy] = useState(false);

  const add = async () => {
    if (!title.trim() || !content.trim()) return;
    setBusy(true);
    try {
      const res = await fetch(`/backend/bots/${bot.id}/knowledge`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), content: content.trim(), source: source.trim() || 'manual' }),
      });
      if (res.ok) {
        const chunk = await res.json();
        setChunks((c: any[]) => [chunk, ...c]);
        setTitle('');
        setContent('');
        setSource('');
      }
    } finally {
      setBusy(false);
    }
  };

  const remove = async (chunkId: string) => {
    await fetch(`/backend/bots/${bot.id}/knowledge/${chunkId}`, { method: 'DELETE', credentials: 'include' });
    setChunks((c: any[]) => c.filter((k) => k.id !== chunkId));
  };

  return (
    <Card>
      <CardHeader title="قاعدة المعرفة (RAG)" subtitle="يسترجع البوت الأجزاء الأكثر صلة بكل سؤال — أضف السياسات والمنتجات والأسئلة الشائعة" />
      <div className="space-y-4 p-5">
        <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
          <div className="grid gap-2">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="العنوان (مثال: سياسة الشحن)" />
            <Textarea rows={3} value={content} onChange={(e) => setContent(e.target.value)} placeholder="المحتوى..." />
            <div className="flex items-center gap-2">
              <Input value={source} onChange={(e) => setSource(e.target.value)} placeholder="المصدر (اختياري)" dir="ltr" />
              <Button onClick={add} disabled={busy || !title.trim() || !content.trim()}>{busy ? '...' : '+ إضافة'}</Button>
            </div>
          </div>
        </div>
        <div className="max-h-80 space-y-2 overflow-y-auto">
          {chunks.length === 0 && <div className="py-4 text-center text-xs text-slate-400">لا توجد عناصر معرفة بعد</div>}
          {chunks.map((k: any) => (
            <div key={k.id} className="group rounded-lg border border-slate-100 p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-slate-700">{k.title}</span>
                <button onClick={() => remove(k.id)} className="text-[10px] font-bold text-rose-500 opacity-0 transition group-hover:opacity-100">حذف</button>
              </div>
              <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-slate-500">{k.content}</p>
              {k.source && <span className="mt-1 block text-[9px] text-slate-300" dir="ltr">{k.source}</span>}
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}
