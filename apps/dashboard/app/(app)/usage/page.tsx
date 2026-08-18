'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/client-api';
import { Card, CardHeader, Stat, Table } from '@/components/ui';
import { PageError, PageLoading } from '@/components/page-state';

export default function UsagePage() {
  const [summary, setSummary] = useState<any>(null);
  const [series, setSeries] = useState<any[]>([]);
  const [recon, setRecon] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      apiClient<any>('/usage/summary?range=24h'),
      apiClient<any[]>('/usage/series?range=24h'),
      apiClient<any>('/usage/reconciliation'),
    ])
      .then(([s, se, r]) => {
        setSummary(s);
        setSeries(se);
        setRecon(r);
      })
      .catch((e) => setError((e as Error).message));
  }, []);

  if (error) return <PageError msg={error} />;
  if (!summary || !recon) return <PageLoading />;

  const max = Math.max(1, ...series.map((s) => s.messages));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-extrabold text-slate-900">الاستهلاك والعدادات</h1>
        <p className="mt-1 text-xs text-slate-500">عدّ أحداثي لكل رسالة + تجميع يومي + مصالحات مع سجلات المزودين</p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Stat label="رسائل (24 ساعة)" value={summary.totals.messages.toLocaleString('ar-EG')} accent="text-emerald-600" />
        <Stat label="توكنز الدخول" value={summary.totals.tokensIn.toLocaleString('ar-EG')} />
        <Stat label="توكنز الخروج" value={summary.totals.tokensOut.toLocaleString('ar-EG')} />
        <Stat label="متوسط زمن الاستجابة" value={`${summary.totals.avgLatencyMs}ms`} />
        <Stat label="التكلفة (24 ساعة)" value={`$${summary.totals.costUsd.toFixed(4)}`} accent="text-amber-600" />
      </div>

      <Card>
        <CardHeader title="الرسائل خلال آخر 24 ساعة" subtitle="كل عمود = ساعة" />
        <div className="flex h-40 items-end gap-1 p-5">
          {series.length === 0 && <div className="w-full text-center text-xs text-slate-400">لا يوجد نشاط بعد</div>}
          {series.map((s) => (
            <div key={s.t} className="group relative flex-1">
              <div className="rounded-t bg-emerald-500 transition group-hover:bg-emerald-600" style={{ height: `${Math.max(4, (s.messages / max) * 130)}px` }} />
              <div className="pointer-events-none absolute -top-7 right-1/2 hidden translate-x-1/2 rounded bg-slate-900 px-1.5 py-0.5 text-[9px] text-white group-hover:block">
                {s.messages}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="حسب المزود" subtitle="من خدم الطلبات فعلياً — دليل كفاءة التنقّل التلقائي" />
          <Table head={['المزود', 'رسائل', 'توكنز دخل', 'توكنز خرج', 'تكلفة']}>
            {summary.byProvider.map((p: any) => (
              <tr key={p.providerId}>
                <td className="px-4 py-2.5 text-xs font-bold text-slate-700">{p.providerId}</td>
                <td className="px-4 py-2.5 text-xs">{p.messages}</td>
                <td className="px-4 py-2.5 text-xs">{p.tokensIn.toLocaleString('ar-EG')}</td>
                <td className="px-4 py-2.5 text-xs">{p.tokensOut.toLocaleString('ar-EG')}</td>
                <td className="px-4 py-2.5 text-xs">${p.costUsd.toFixed(4)}</td>
              </tr>
            ))}
          </Table>
        </Card>

        <Card>
          <CardHeader title="حسب النموذج" />
          <Table head={['النموذج', 'رسائل', 'توكنز', 'تكلفة']}>
            {summary.byModel.map((m: any) => (
              <tr key={m.model}>
                <td className="px-4 py-2.5 text-xs text-slate-600" dir="ltr">{m.model}</td>
                <td className="px-4 py-2.5 text-xs">{m.messages}</td>
                <td className="px-4 py-2.5 text-xs">{(m.tokensIn + m.tokensOut).toLocaleString('ar-EG')}</td>
                <td className="px-4 py-2.5 text-xs">${m.costUsd.toFixed(4)}</td>
              </tr>
            ))}
          </Table>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="المصالحات (Reconciliation)"
          subtitle="مقارنة الأحداث الخام بالتجميع اليومي — في الإنتاج تُقارن أيضاً بفواتير المزودين"
        />
        <div className="grid gap-3 p-5 sm:grid-cols-3">
          <div className="rounded-xl bg-slate-50 p-4">
            <div className="text-[11px] font-bold text-slate-400">الأحداث الخام</div>
            <div className="mt-1 text-lg font-extrabold">{recon.events.messages.toLocaleString('ar-EG')} رسالة</div>
          </div>
          <div className="rounded-xl bg-slate-50 p-4">
            <div className="text-[11px] font-bold text-slate-400">التجميع اليومي</div>
            <div className="mt-1 text-lg font-extrabold">{recon.dailyRollups.messages.toLocaleString('ar-EG')} رسالة</div>
          </div>
          <div className="rounded-xl bg-slate-50 p-4">
            <div className="text-[11px] font-bold text-slate-400">الانحراف</div>
            <div className={`mt-1 text-lg font-extrabold ${recon.status === 'ok' ? 'text-emerald-600' : 'text-rose-600'}`}>
              {recon.driftMessages} رسالة {recon.status === 'ok' ? '✓ ضمن الحد' : '⚠ مراجعة'}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
