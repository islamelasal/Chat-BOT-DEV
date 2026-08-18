'use client';

import { useState } from 'react';
import { Badge, Button, Card, CardHeader, Field, Input, Select } from '@/components/ui';

export default function ProviderCard({ provider }: { provider: any }) {
  const [apiKey, setApiKey] = useState('');
  const [enabled, setEnabled] = useState(provider.enabled);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [saved, setSaved] = useState(false);

  const save = async (withKey: boolean) => {
    setSaved(false);
    const res = await fetch(`/backend/providers/${provider.id}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enabled, ...(withKey && apiKey ? { apiKey } : {}) }),
    });
    if (res.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      if (withKey) setApiKey('');
    }
  };

  const test = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`/backend/providers/${provider.id}/test`, { method: 'POST', credentials: 'include' });
      setTestResult(await res.json());
    } catch (err) {
      setTestResult({ ok: false, message: (err as Error).message });
    } finally {
      setTesting(false);
    }
  };

  return (
    <Card>
      <CardHeader
        title={provider.name}
        subtitle={`${provider.kind} · ${provider.models.length} نموذج`}
        action={
          <div className="flex items-center gap-2">
            <Badge tone={provider.tier === 'free' ? 'green' : 'blue'}>{provider.tier === 'free' ? 'مجاني' : 'مدفوع'}</Badge>
            <button
              onClick={() => {
                setEnabled((e: boolean) => !e);
                void save(false);
              }}
              className={`relative h-5 w-9 rounded-full transition ${enabled ? 'bg-emerald-500' : 'bg-slate-300'}`}
            >
              <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${enabled ? 'right-0.5' : 'right-4'}`} />
            </button>
          </div>
        }
      />
      <div className="space-y-3 p-5">
        <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
          <span className="text-[10px] font-bold text-slate-400">Base URL</span>
          <span className="text-[11px] text-slate-600" dir="ltr">{provider.baseUrl || '—'}</span>
        </div>
        <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
          <span className="text-[10px] font-bold text-slate-400">المفتاح</span>
          <span className="text-[11px] font-bold">{provider.hasKey ? <Badge tone="green">مضبوط (مشفّر)</Badge> : <Badge tone="amber">غير مضبوط</Badge>}</span>
        </div>
        <Field label={provider.hasKey ? 'استبدال المفتاح (اختياري)' : 'مفتاح API'}>
          <Input dir="ltr" type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-..." />
        </Field>
        <div className="flex items-center gap-2">
          {apiKey && <Button onClick={() => save(true)}>حفظ المفتاح</Button>}
          <Button variant="outline" onClick={test} disabled={testing}>{testing ? 'جارٍ الفحص...' : 'فحص الاتصال'}</Button>
          {saved && <span className="text-xs font-bold text-emerald-600">✓ تم</span>}
        </div>
        {testResult && (
          <div className={`rounded-lg px-3 py-2 text-[11px] font-semibold ${testResult.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-600'}`}>
            {testResult.ok ? `✓ اتصال سليم · ${testResult.latencyMs}ms` : `✗ ${testResult.message}`}
            {testResult.modelsFound?.length > 0 && (
              <span className="block text-[10px] font-normal text-slate-500">نماذج متاحة: {testResult.modelsFound.join(', ')}</span>
            )}
          </div>
        )}
        {provider.models.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {provider.models.slice(0, 8).map((m: any) => (
              <span key={m.id} className="rounded-md bg-slate-100 px-2 py-1 text-[10px] text-slate-600" dir="ltr">
                {m.name}
                {m.free ? ' · مجاني' : ` · $${m.costPer1MOut}/1M`}
              </span>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
