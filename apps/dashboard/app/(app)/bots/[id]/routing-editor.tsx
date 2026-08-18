'use client';

import { useState } from 'react';
import { Button, Card, CardHeader, Field, Input, Select } from '@/components/ui';

const STRATEGIES: Array<{ value: string; label: string; desc: string }> = [
  { value: 'priority-failover', label: 'أولوية + بدائل', desc: 'الترتيب كما هو — ينتقل للبديل عند الفشل' },
  { value: 'weighted-round-robin', label: 'موازنة مرجّحة', desc: 'توزيع دائري حسب الأوزان' },
  { value: 'least-latency', label: 'الأقل زمن استجابة', desc: 'يختار الأسرع وفق EWMA الحي' },
  { value: 'cheapest-first', label: 'الأرخص أولاً', desc: 'يرتب حسب تكلفة النموذج' },
  { value: 'smart-auto', label: 'ذكي تلقائي (موصى به)', desc: 'درجة مركّبة: صحة + سرعة + تكلفة + حصة متبقية' },
];

export default function RoutingEditor({ bot, providers, models }: { bot: any; providers: any[]; models: any[] }) {
  const [strategy, setStrategy] = useState(bot.routing?.strategy ?? 'smart-auto');
  const [tiers, setTiers] = useState<any[]>(bot.routing?.tiers ?? []);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const modelsOf = (providerId: string) => models.filter((m) => m.providerId === providerId && m.enabled);
  const enabledProviders = providers.filter((p) => p.enabled);

  const addTier = () => {
    const firstProvider = enabledProviders[0];
    const firstModels = firstProvider ? modelsOf(firstProvider.id) : [];
    setTiers((t) => [
      ...t,
      {
        model: firstModels[0]?.name ?? '',
        providerIds: firstProvider ? [firstProvider.id] : [],
        weight: 1,
        maxTokens: 900,
        temperature: 0.4,
      },
    ]);
  };

  const save = async () => {
    setBusy(true);
    setSaved(false);
    try {
      const res = await fetch(`/backend/bots/${bot.id}/routing`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ strategy, tiers: tiers.filter((t) => t.model && t.providerIds.length) }),
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
      <CardHeader
        title="سياسة التوجيه (Routing + Failover)"
        subtitle="قلب المنصة: سلاسل بدائل مرتبة + دوائر كسر تلقائية — الطبقة الأعلى أولوية"
        action={<Button variant="outline" onClick={addTier}>+ طبقة</Button>}
      />
      <div className="space-y-4 p-5">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {STRATEGIES.map((s) => (
            <button
              key={s.value}
              onClick={() => setStrategy(s.value)}
              className={`rounded-xl border p-3 text-right transition ${
                strategy === s.value ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <div className="text-xs font-extrabold text-slate-800">{s.label}</div>
              <div className="mt-1 text-[10px] leading-relaxed text-slate-500">{s.desc}</div>
            </button>
          ))}
        </div>

        <div className="space-y-3">
          {tiers.length === 0 && <div className="rounded-lg border border-dashed border-slate-200 py-6 text-center text-xs text-slate-400">لا توجد طبقات — أضف طبقة واختر النموذج والمزودين</div>}
          {tiers.map((tier, i) => (
            <div key={i} className="rounded-xl border border-slate-100 bg-slate-50 p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-extrabold text-slate-700">الطبقة {i + 1} {i === 0 && '(الرئيسية)'}</span>
                <button onClick={() => setTiers((t) => t.filter((_, idx) => idx !== i))} className="text-[10px] font-bold text-rose-500">إزالة</button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="المزودون (بدائل أفقية)" hint="Ctrl/⌘ للاختيار المتعدد">
                  <select
                    multiple
                    className="h-24 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs"
                    value={tier.providerIds}
                    onChange={(e) => {
                      const vals = Array.from(e.target.selectedOptions).map((o) => o.value);
                      setTiers((t) => t.map((x, idx) => (idx === i ? { ...x, providerIds: vals } : x)));
                    }}
                  >
                    {enabledProviders.map((p) => (
                      <option key={p.id} value={p.id}>{p.name} ({p.tier === 'free' ? 'مجاني' : 'مدفوع'})</option>
                    ))}
                  </select>
                </Field>
                <Field label="النموذج">
                  <Select
                    value={tier.model}
                    onChange={(e) => setTiers((t) => t.map((x, idx) => (idx === i ? { ...x, model: e.target.value } : x)))}
                  >
                    <option value="">— اختر —</option>
                    {[...new Set<string>(tier.providerIds.flatMap((pid: string) => modelsOf(pid).map((m: any) => m.name)))].map((name: string) => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="الوزن">
                  <Input type="number" min={0} max={100} value={tier.weight} onChange={(e) => setTiers((t) => t.map((x, idx) => (idx === i ? { ...x, weight: Number(e.target.value) } : x)))} />
                </Field>
                <Field label="أقصى توكنز / درجة الحرارة">
                  <div className="flex gap-2">
                    <Input type="number" value={tier.maxTokens} onChange={(e) => setTiers((t) => t.map((x, idx) => (idx === i ? { ...x, maxTokens: Number(e.target.value) } : x)))} />
                    <Input type="number" step="0.1" min={0} max={2} value={tier.temperature} onChange={(e) => setTiers((t) => t.map((x, idx) => (idx === i ? { ...x, temperature: Number(e.target.value) } : x)))} />
                  </div>
                </Field>
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <Button onClick={save} disabled={busy}>{busy ? 'جارٍ الحفظ...' : 'حفظ سياسة التوجيه'}</Button>
          {saved && <span className="text-xs font-bold text-emerald-600">✓ تم الحفظ</span>}
        </div>
      </div>
    </Card>
  );
}
