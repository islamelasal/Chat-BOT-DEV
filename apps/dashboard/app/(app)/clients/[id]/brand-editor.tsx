'use client';

import { useState } from 'react';
import { Button, Card, CardHeader, Field, Input } from '@/components/ui';

export default function BrandEditor({ client }: { client: any }) {
  const [logoUrl, setLogoUrl] = useState(client.brand?.logoUrl ?? '');
  const [primary, setPrimary] = useState(client.brand?.colors?.primary ?? '#C1272D');
  const [secondary, setSecondary] = useState(client.brand?.colors?.secondary ?? '#F2A93B');
  const [accent, setAccent] = useState(client.brand?.colors?.accent ?? '#7A0E14');
  const [font, setFont] = useState(client.brand?.font ?? 'Cairo');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const save = async () => {
    setBusy(true);
    setSaved(false);
    try {
      const res = await fetch(`/backend/clients/${client.id}/brand`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          logoUrl: logoUrl || null,
          colors: { primary, secondary, accent },
          font,
        }),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader title="الهوية البصرية (Brand Kit)" subtitle="ألوان البوت تتبع هوية العميل — تُستخدم في الفقاعة ورأس المحادثة" />
      <div className="space-y-4 p-5">
        <div className="flex items-center gap-4">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl text-lg font-extrabold text-white" style={{ background: primary }}>
            {logoUrl ? <img src={logoUrl} className="h-full w-full object-cover" alt="" /> : String(client.name).slice(0, 2)}
          </span>
          <Field label="رابط اللوجو (اختياري)">
            <Input dir="ltr" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://..." />
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <Field label="اللون الرئيسي">
            <div className="flex items-center gap-2">
              <input type="color" value={primary} onChange={(e) => setPrimary(e.target.value)} className="h-9 w-12 cursor-pointer rounded border border-slate-200" />
              <Input dir="ltr" value={primary} onChange={(e) => setPrimary(e.target.value)} />
            </div>
          </Field>
          <Field label="اللون الثانوي">
            <div className="flex items-center gap-2">
              <input type="color" value={secondary} onChange={(e) => setSecondary(e.target.value)} className="h-9 w-12 cursor-pointer rounded border border-slate-200" />
              <Input dir="ltr" value={secondary} onChange={(e) => setSecondary(e.target.value)} />
            </div>
          </Field>
          <Field label="لون التمييز">
            <div className="flex items-center gap-2">
              <input type="color" value={accent} onChange={(e) => setAccent(e.target.value)} className="h-9 w-12 cursor-pointer rounded border border-slate-200" />
              <Input dir="ltr" value={accent} onChange={(e) => setAccent(e.target.value)} />
            </div>
          </Field>
        </div>
        <Field label="الخط">
          <Input value={font} onChange={(e) => setFont(e.target.value)} />
        </Field>
        <div className="flex items-center gap-3">
          <Button onClick={save} disabled={busy}>{busy ? 'جارٍ الحفظ...' : 'حفظ الهوية'}</Button>
          {saved && <span className="text-xs font-bold text-emerald-600">✓ تم الحفظ</span>}
        </div>
      </div>
    </Card>
  );
}
