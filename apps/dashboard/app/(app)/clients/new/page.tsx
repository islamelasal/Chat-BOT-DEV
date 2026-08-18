'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, CardHeader, Field, Input } from '@/components/ui';

export default function NewClientPage() {
  const router = useRouter();
  const [form, setForm] = useState({ name: '', siteUrl: 'https://', email: '', phone: '', plan: 'free', domains: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/backend/clients', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...form,
          domains: form.domains.split(/[\s,،]+/).filter(Boolean),
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.message ?? 'فشل الإنشاء');
      const client = await res.json();
      router.push(`/clients/${client.id}`);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <h1 className="text-xl font-extrabold text-slate-900">عميل جديد</h1>
      <Card>
        <CardHeader title="بيانات العميل" subtitle="سطر الكود سيكون جاهزاً بعد الحفظ مباشرة" />
        <form onSubmit={submit} className="space-y-4 p-5">
          <Field label="اسم العميل"><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="مجموعة الشوا التجارية" /></Field>
          <Field label="رابط الموقع"><Input required dir="ltr" value={form.siteUrl} onChange={(e) => setForm({ ...form, siteUrl: e.target.value })} /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="البريد"><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            <Field label="الهاتف"><Input dir="ltr" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="الباقة">
              <select className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })}>
                <option value="free">Free</option>
                <option value="starter">Starter</option>
                <option value="pro">Pro</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </Field>
            <Field label="النطاقات المسموحة" hint="افصل بينها بمسافة أو فاصلة">
              <Input dir="ltr" value={form.domains} onChange={(e) => setForm({ ...form, domains: e.target.value })} placeholder="example.com www.example.com" />
            </Field>
          </div>
          {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600">⚠️ {error}</div>}
          <Button type="submit" disabled={busy}>{busy ? 'جارٍ الإنشاء...' : 'إنشاء العميل'}</Button>
        </form>
      </Card>
    </div>
  );
}
