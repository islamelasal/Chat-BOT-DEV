'use client';

import { useState } from 'react';
import { Button, Card, CardHeader, Field, Input, Textarea } from '@/components/ui';

export default function PersonaEditor({ bot }: { bot: any }) {
  const [name, setName] = useState(bot.name);
  const [persona, setPersona] = useState(bot.persona);
  const [maxReplyLength, setMaxReplyLength] = useState(bot.maxReplyLength);
  const [forbidden, setForbidden] = useState((bot.forbiddenTopics ?? []).join('، '));
  const [welcomeMsg, setWelcomeMsg] = useState(bot.welcomeMsg ?? '');
  const [fallbackMsg, setFallbackMsg] = useState(bot.fallbackMsg ?? '');
  const [suggestions, setSuggestions] = useState((bot.suggestions ?? []).join('\n'));
  const [isDefault, setIsDefault] = useState(Boolean(bot.isDefault));
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const save = async () => {
    setBusy(true);
    setSaved(false);
    try {
      const res = await fetch(`/backend/bots/${bot.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name,
          persona,
          maxReplyLength: Number(maxReplyLength),
          forbiddenTopics: forbidden.split(/[،,]/).map((s: string) => s.trim()).filter(Boolean),
          welcomeMsg,
          fallbackMsg,
          suggestions: suggestions.split('\n').map((s: string) => s.trim()).filter(Boolean).slice(0, 6),
          isDefault,
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
      <CardHeader title="الشخصية (System Prompt)" subtitle="هوية البوت ونبرته وقواعده — يظهر للزائر كموظف حقيقي في المتجر" />
      <div className="space-y-4 p-5">
        <Field label="اسم البوت">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="تعليمات الشخصية (System Prompt)">
          <Textarea rows={12} value={persona} onChange={(e) => setPersona(e.target.value)} className="font-mono text-xs leading-relaxed" dir="rtl" />
        </Field>
        <Field label="رسالة الترحيب (تظهر عند فتح المحادثة)">
          <Textarea rows={4} value={welcomeMsg} onChange={(e) => setWelcomeMsg(e.target.value)} />
        </Field>
        <Field label="الاقتراحات السريعة" hint="سطر لكل اقتراح (حتى 6)">
          <Textarea rows={4} value={suggestions} onChange={(e) => setSuggestions(e.target.value)} />
        </Field>
        <Field label="الرد الاحتياطي (يظهر عند انقطاع النموذج)">
          <Textarea rows={3} value={fallbackMsg} onChange={(e) => setFallbackMsg(e.target.value)} />
        </Field>
        <label className="flex items-center gap-2 text-xs font-bold text-slate-600">
          <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} className="h-4 w-4" />
          البوت الافتراضي لهذا العميل (يظهر في الودجت)
        </label>
        <div className="grid grid-cols-2 gap-4">
          <Field label="أقصى طول للرد (حروف)">
            <Input type="number" value={maxReplyLength} onChange={(e) => setMaxReplyLength(Number(e.target.value))} />
          </Field>
          <Field label="مواضيع ممنوعة" hint="افصل بينها بفاصلة">
            <Input value={forbidden} onChange={(e) => setForbidden(e.target.value)} />
          </Field>
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={save} disabled={busy}>{busy ? 'جارٍ الحفظ...' : 'حفظ الشخصية'}</Button>
          {saved && <span className="text-xs font-bold text-emerald-600">✓ تم الحفظ</span>}
        </div>
      </div>
    </Card>
  );
}
