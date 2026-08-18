'use client';

import { useState } from 'react';
import { Button, Card, CardHeader, Field, Input, Select, Textarea } from '@/components/ui';

const DEFAULT_THEME = {
  primary: '#C1272D', secondary: '#F2A93B', background: '#FFFFFF', bubbleText: 'أهلاً! محتاج مساعدة؟',
  headerText: '#FFFFFF', font: 'Cairo', position: 'bottom-left', bubbleStyle: 'pill', windowMode: 'docked',
  welcomeTitle: '', welcomeText: '', suggestions: [], showBrand: true, logoUrl: null, poweredBy: true,
};

export default function ThemeEditor({ client }: { client: any }) {
  const theme: typeof DEFAULT_THEME = { ...DEFAULT_THEME, ...(client.theme ?? {}) };
  const [form, setForm] = useState<typeof DEFAULT_THEME>(theme);
  const [suggestions, setSuggestions] = useState((theme.suggestions ?? []).join('\n'));
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    setBusy(true);
    setSaved(false);
    try {
      const res = await fetch(`/backend/clients/${client.id}/theme`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...form,
          suggestions: suggestions.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 6),
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
      <CardHeader title="ثيم البوت (Theme)" subtitle="معاينة مباشرة في المتجر التجريبي بعد الحفظ" />
      <div className="space-y-4 p-5">
        <div className="grid grid-cols-2 gap-4">
          <Field label="اللون الرئيسي">
            <div className="flex items-center gap-2">
              <input type="color" value={form.primary} onChange={(e) => set('primary', e.target.value)} className="h-9 w-12 cursor-pointer rounded border border-slate-200" />
              <Input dir="ltr" value={form.primary} onChange={(e) => set('primary', e.target.value)} />
            </div>
          </Field>
          <Field label="لون التمييز">
            <div className="flex items-center gap-2">
              <input type="color" value={form.secondary} onChange={(e) => set('secondary', e.target.value)} className="h-9 w-12 cursor-pointer rounded border border-slate-200" />
              <Input dir="ltr" value={form.secondary} onChange={(e) => set('secondary', e.target.value)} />
            </div>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="موضع الفقاعة">
            <Select value={form.position} onChange={(e) => set('position', e.target.value)}>
              <option value="bottom-left">أسفل اليسار</option>
              <option value="bottom-right">أسفل اليمين</option>
            </Select>
          </Field>
          <Field label="شكل الفقاعة">
            <Select value={form.bubbleStyle} onChange={(e) => set('bubbleStyle', e.target.value)}>
              <option value="pill">زر بنص</option>
              <option value="circle">دائرة أيقونة</option>
            </Select>
          </Field>
        </div>
        <Field label="نص الفقاعة">
          <Input value={form.bubbleText} onChange={(e) => set('bubbleText', e.target.value)} />
        </Field>
        <Field label="عنوان نافذة المحادثة">
          <Input value={form.welcomeTitle} onChange={(e) => set('welcomeTitle', e.target.value)} placeholder="مجموعة الشوا التجارية" />
        </Field>
        <Field label="رسالة الترحيب">
          <Textarea rows={2} value={form.welcomeText} onChange={(e) => set('welcomeText', e.target.value)} />
        </Field>
        <Field label="اقتراحات سريعة" hint="سطر لكل اقتراح (حتى 6)">
          <Textarea rows={3} value={suggestions} onChange={(e) => setSuggestions(e.target.value)} placeholder={'سياسة الشحن والاسترجاع\nفروعنا ومواعيد العمل'} />
        </Field>
        <div className="flex items-center gap-3">
          <Button onClick={save} disabled={busy}>{busy ? 'جارٍ الحفظ...' : 'حفظ الثيم'}</Button>
          {saved && <span className="text-xs font-bold text-emerald-600">✓ تم الحفظ — المعاينة جاهزة</span>}
        </div>
      </div>
    </Card>
  );
}
