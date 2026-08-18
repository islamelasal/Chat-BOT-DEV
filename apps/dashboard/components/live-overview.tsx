'use client';

import { useEffect, useState } from 'react';
import { Badge, Card, CardHeader } from './ui';

interface ProviderStatus {
  providerId: string;
  providerName: string;
  ok: boolean | null;
  lastPulse: number | null;
  ewmaLatencyMs: number | null;
  circuits: Array<{ model: string; state: string; failures: number; retryAt: number | null }>;
}

/** تحديث حي كل 5 ثوانٍ — يعرض النبضات والدوائر كما في الواقع */
export default function LiveOverview() {
  const [data, setData] = useState<{ worker: { alive: boolean }; providers: ProviderStatus[] } | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch('/backend/status/overview', { credentials: 'include', cache: 'no-store' });
        if (res.ok && alive) setData(await res.json());
      } catch {}
    };
    void load();
    const t = setInterval(() => {
      setTick((x) => x + 1);
      void load();
    }, 5000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  if (!data) return null;

  const secondsAgo = (ts: number | null) => (ts ? Math.max(0, Math.round((Date.now() - ts) / 1000)) : null);

  return (
    <Card>
      <CardHeader
        title="لوحة النبضات الحية"
        subtitle={`تحديث تلقائي كل 5 ثوانٍ · العامل: ${data.worker.alive ? 'حي' : 'متوقف'} · نبضة ${tick > 0 ? `#${tick}` : 'قيد التشغيل'}`}
      />
      <div className="grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-4">
        {data.providers.map((p) => {
          const ago = secondsAgo(p.lastPulse);
          const state =
            p.ok === true ? 'green' : p.ok === false ? 'red' : ago == null ? 'slate' : 'amber';
          return (
            <div key={p.providerId} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-slate-700">{p.providerName}</span>
                <Badge tone={state as any}>
                  {p.ok === true ? 'سليم' : p.ok === false ? 'سقط' : ago == null ? 'بانتظار النبضة' : 'متأخر'}
                </Badge>
              </div>
              <div className="mt-2 flex items-center justify-between text-[10px] text-slate-400">
                <span>{p.ewmaLatencyMs != null ? `${p.ewmaLatencyMs}ms زمن استجابة` : '—'}</span>
                <span>{ago != null ? `منذ ${ago}ث` : '—'}</span>
              </div>
              {p.circuits.length > 0 && (
                <div className="mt-2 space-y-1">
                  {p.circuits.slice(0, 3).map((c) => (
                    <div key={c.model} className="flex items-center justify-between text-[10px]">
                      <span className="truncate text-slate-500">{c.model}</span>
                      <span className={c.state === 'open' ? 'font-bold text-rose-600' : c.state === 'half_open' ? 'font-bold text-amber-600' : 'text-emerald-600'}>
                        {c.state === 'open' ? '🔴 مفتوحة' : c.state === 'half_open' ? '🟡 فحص' : '🟢 مغلقة'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
