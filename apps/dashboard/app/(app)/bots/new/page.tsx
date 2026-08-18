'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button, Card, CardHeader, Field, Input, Select, Textarea } from '@/components/ui';

const TEMPLATES: Array<{ name: string; persona: string }> = [
  {
    name: 'متجر إلكتروني',
    persona: `أنت مساعد خدمة عملاء في متجر إلكتروني. مهامك: مساعدة الزائر في اختيار المنتجات، الإجابة عن الشحن والاسترجاع والضمان من قاعدة المعرفة فقط، وتوجيهه للأقسام الصحيحة.
القواعد:
1. لا تخترع أسعاراً أو عروضاً غير موجودة في المعرفة.
2. ردك مختصر ومباشر (3-5 جمل)، وبعامية راقية.
3. عند عدم المعرفة: حوّل الزائر لخدمة العملاء بلطف.
4. لا تناقش مواضيع خارج نطاق المتجر.`,
  },
  {
    name: 'شركة خدمات',
    persona: `أنت ممثل خدمة عملاء محترف لشركة خدمات. تساعد العملاء في فهم الخدمات والأسعار والمواعيد، وتجيب من قاعدة المعرفة فقط.
القواعد:
1. إجابات دقيقة ومهذبة وبعامية راقية.
2. لا تعد بشيء غير موجود في المعرفة.
3. عند الحاجة: اطلب بيانات التواصل وحوّل للمسؤول.`,
  },
  {
    name: 'مطعم',
    persona: `أنت موظف استقبال في مطعم. تساعد في المنيو، مواعيد العمل، الحجز، والتوصيل من قاعدة المعرفة فقط.
القواعد:
1. ردود ودودة ومختصرة.
2. لا تأخذ طلبات دفع أو بيانات حساسة.
3. اسأل عن التفاصيل الناقصة (عدد الأشخاص، المنطقة) عند الحجز.`,
  },
];

function NewBotForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const presetClientId = searchParams.get('clientId') ?? '';

  const [clients, setClients] = useState<any[]>([]);
  const [form, setForm] = useState({
    clientId: presetClientId,
    name: '',
    description: '',
    persona: TEMPLATES[0]!.persona,
    language: 'ar',
    maxReplyLength: 1200,
    forbiddenTopics: '',
    active: true,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/backend/clients', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : []))
      .then((list) => {
        setClients(list);
        if (!presetClientId && list.length === 1) setForm((f) => ({ ...f, clientId: list[0].id }));
      })
      .catch(() => {});
  }, [presetClientId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/backend/bots', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...form,
          maxReplyLength: Number(form.maxReplyLength),
          forbiddenTopics: form.forbiddenTopics.split(/[،,]/).map((s: string) => s.trim()).filter(Boolean),
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.message ?? 'فشل الإنشاء');
      }
      const bot = await res.json();
      router.push(`/bots/${bot.id}`);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-xl font-extrabold text-slate-900">بوت جديد</h1>
      <Card>
        <CardHeader title="بيانات البوت" subtitle="بعد الإنشاء: أضف المعرفة وسياسة التوجيه من صفحة البوت" />
        <form onSubmit={submit} className="space-y-4 p-5">
          <Field label="العميل">
            <Select value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })} required>
              <option value="">— اختر العميل —</option>
              {clients.map((c: any) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="اسم البوت"><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="مساعد الشوا" /></Field>
            <Field label="اللغة">
              <Select value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value })}>
                <option value="ar">عربي</option>
                <option value="en">إنجليزي</option>
                <option value="both">ثنائي</option>
              </Select>
            </Field>
          </div>
          <Field label="الوصف"><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="بوت خدمة العملاء والمبيعات" /></Field>
          <Field label="قالب جاهز" hint="يملأ الشخصية تلقائياً — يمكنك التعديل بعدها">
            <Select onChange={(e) => {
              const t = TEMPLATES[Number(e.target.value)];
              if (t) setForm((f) => ({ ...f, persona: t.persona }));
            }} defaultValue="0">
              {TEMPLATES.map((t, i) => <option key={t.name} value={i}>{t.name}</option>)}
            </Select>
          </Field>
          <Field label="تعليمات الشخصية (System Prompt)">
            <Textarea rows={12} required value={form.persona} onChange={(e) => setForm({ ...form, persona: e.target.value })} className="font-mono text-xs leading-relaxed" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="أقصى طول للرد"><Input type="number" min={100} value={form.maxReplyLength} onChange={(e) => setForm({ ...form, maxReplyLength: Number(e.target.value) })} /></Field>
            <Field label="مواضيع ممنوعة"><Input value={form.forbiddenTopics} onChange={(e) => setForm({ ...form, forbiddenTopics: e.target.value })} placeholder="سياسة، دين" /></Field>
          </div>
          {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600">⚠️ {error}</div>}
          <Button type="submit" disabled={busy}>{busy ? 'جارٍ الإنشاء...' : 'إنشاء البوت'}</Button>
        </form>
      </Card>
    </div>
  );
}

export default function NewBotPage() {
  return (
    <Suspense fallback={<div className="py-10 text-center text-sm text-slate-400">جارٍ التحميل...</div>}>
      <NewBotForm />
    </Suspense>
  );
}
