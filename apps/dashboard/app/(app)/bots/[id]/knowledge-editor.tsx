'use client';

import { useState } from 'react';
import { Button, Card, CardHeader, Field, Input, Textarea } from '@/components/ui';

export default function KnowledgeEditor({ bot }: { bot: any }) {
  const [chunks, setChunks] = useState(bot.knowledgeChunks ?? []);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [source, setSource] = useState('');
  const [busy, setBusy] = useState(false);
  // زحف الروابط
  const [urls, setUrls] = useState('');
  const [crawlBusy, setCrawlBusy] = useState(false);
  const [crawlResult, setCrawlResult] = useState('');
  // استيراد llms.txt
  const [llmsUrl, setLlmsUrl] = useState('');
  const [llmsBusy, setLlmsBusy] = useState(false);
  const [llmsMsg, setLlmsMsg] = useState('');

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

  /** استيراد llms.txt (ميزة CS-Cart 4.20.1 — Website → SEO → llms.txt) */
  const importLlms = async () => {
    const url = llmsUrl.trim();
    if (!url) return;
    setLlmsBusy(true);
    setLlmsMsg('');
    try {
      const res = await fetch(`/backend/bots/${bot.id}/llms`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const j = await res.json();
      if (res.ok) {
        setLlmsMsg(`✅ استوردنا ${j.added} قسم معرفة من llms.txt (${j.sections} قسم في الملف)`);
        setLlmsUrl('');
        const fresh = await fetch(`/backend/bots/${bot.id}`, { credentials: 'include' }).then((r) => r.json());
        setChunks(fresh.knowledgeChunks ?? []);
      } else {
        setLlmsMsg(`⚠️ ${j?.message ?? 'فشل الاستيراد'}`);
      }
    } catch (err) {
      setLlmsMsg(`⚠️ ${(err as Error).message}`);
    } finally {
      setLlmsBusy(false);
    }
  };

  /** زحف روابط الموقع وتحويلها تلقائياً لشظايا معرفة (مثل SiteGPT) */
  const crawl = async () => {
    const list = urls.split('\n').map((u) => u.trim()).filter(Boolean);
    if (!list.length) return;
    setCrawlBusy(true);
    setCrawlResult('');
    try {
      const res = await fetch(`/backend/bots/${bot.id}/crawl`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ urls: list }),
      });
      const j = await res.json();
      if (res.ok) {
        setCrawlResult(`✅ أُضيف ${j.added} عنصر معرفة (${j.skipped} مكرر تم تجاهله)${j.errors?.length ? ` · ${j.errors.length} رابط فشل` : ''}`);
        setUrls('');
        // إعادة تحميل المعرفة المحدّثة
        const fresh = await fetch(`/backend/bots/${bot.id}`, { credentials: 'include' }).then((r) => r.json());
        setChunks(fresh.knowledgeChunks ?? []);
      } else {
        setCrawlResult(`⚠️ ${j?.message ?? 'فشل الزحف'}`);
      }
    } catch (err) {
      setCrawlResult(`⚠️ ${(err as Error).message}`);
    } finally {
      setCrawlBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader title="قاعدة المعرفة (RAG)" subtitle="يسترجع البوت الأجزاء الأكثر صلة بكل سؤال — أضف السياسات والمنتجات والأسئلة الشائعة" />
      <div className="space-y-4 p-5">
        {/* استيراد llms.txt — ميزة CS-Cart 4.20.1 */}
        <div className="rounded-xl border border-sky-100 bg-sky-50/60 p-3">
          <div className="text-xs font-extrabold text-sky-800">📄 استيراد llms.txt (خاصة بـ CS-Cart 4.20.1)</div>
          <div className="text-[10px] text-sky-600">من إعدادات متجرك: Website → SEO → llms.txt — كل قسم يصبح عنصر معرفة</div>
          <div className="mt-2 flex items-center gap-2">
            <Input dir="ltr" value={llmsUrl} onChange={(e) => setLlmsUrl(e.target.value)} placeholder="https://yourdomain.com/llms.txt" />
            <Button variant="outline" onClick={importLlms} disabled={llmsBusy || !llmsUrl.trim()}>
              {llmsBusy ? 'جارٍ الاستيراد...' : '📄 استيراد'}
            </Button>
          </div>
          {llmsMsg && <div className="mt-2 text-[11px] font-bold text-sky-700">{llmsMsg}</div>}
        </div>

        {/* زحف روابط الموقع */}
        <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-extrabold text-emerald-800">🕸️ تدريب تلقائي من روابط الموقع</div>
              <div className="text-[10px] text-emerald-600">رابط لكل سطر — يُستخرج النص ويُقسَّم لشظايا جاهزة (حتى 10 روابط)</div>
            </div>
          </div>
          <Textarea
            rows={3}
            className="mt-2 font-mono text-xs"
            dir="ltr"
            value={urls}
            onChange={(e) => setUrls(e.target.value)}
            placeholder={'https://example.com/shipping\nhttps://example.com/faq'}
          />
          <div className="mt-2 flex items-center gap-2">
            <Button variant="outline" onClick={crawl} disabled={crawlBusy || !urls.trim()}>
              {crawlBusy ? 'جارٍ الزحف...' : '🕸️ زحف وإضافة'}
            </Button>
            {crawlResult && <span className="text-[11px] font-bold text-emerald-700">{crawlResult}</span>}
          </div>
        </div>

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
