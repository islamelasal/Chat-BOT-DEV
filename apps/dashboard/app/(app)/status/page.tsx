'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/client-api';
import { Badge, Card, CardHeader, Table } from '@/components/ui';
import { PageError, PageLoading } from '@/components/page-state';
import LiveOverview from '@/components/live-overview';
import AlertsList from '@/components/alerts-list';

export default function StatusPage() {
  const [overview, setOverview] = useState<any>(null);
  const [heartbeats, setHeartbeats] = useState<any[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([apiClient<any>('/status/overview'), apiClient<any[]>('/status/heartbeats')])
      .then(([o, h]) => {
        setOverview(o);
        setHeartbeats(h);
      })
      .catch((e) => setError((e as Error).message));
  }, []);

  if (error) return <PageError msg={error} />;
  if (!overview) return <PageLoading />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-extrabold text-slate-900">حالة النظام والمراقبة</h1>
        <p className="mt-1 text-xs text-slate-500">
          النبضات تعمل كل 30 ثانية على مدار الساعة — حتى لو كانت اللوحة مغلقة (العامل مستقل)
        </p>
      </div>

      <LiveOverview />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="آخر النبضات" subtitle="سجل مباشر من قاعدة البيانات — يحتفظ بآخر 2000 نبضة لكل مزود" />
          <Table head={['المزود', 'الحالة', 'الزمن', 'الرسالة', 'الوقت']}>
            {heartbeats.slice(0, 15).map((h: any) => (
              <tr key={h.id}>
                <td className="px-4 py-2.5 text-xs font-bold text-slate-700">{h.providerName}</td>
                <td className="px-4 py-2.5"><Badge tone={h.ok ? 'green' : 'red'}>{h.ok ? 'نجاح' : 'فشل'}</Badge></td>
                <td className="px-4 py-2.5 text-xs text-slate-500">{h.latencyMs}ms</td>
                <td className="px-4 py-2.5 text-[11px] text-slate-400">{h.message}</td>
                <td className="px-4 py-2.5 text-[10px] text-slate-400">{new Date(h.at).toLocaleTimeString('ar-EG')}</td>
              </tr>
            ))}
          </Table>
        </Card>

        <Card>
          <CardHeader title="دوائر الكسر (Circuit Breakers)" subtitle="CLOSED → OPEN عند تدهور المزود → HALF_OPEN للفحص والتعافي" />
          {overview.circuits.length === 0 ? (
            <div className="px-5 py-8 text-center text-xs text-slate-400">لا توجد دوائر بعد — تُنشأ عند أول طلب لكل نموذج</div>
          ) : (
            <Table head={['المفتاح', 'الحالة', 'الفشل', 'إعادة المحاولة']}>
              {overview.circuits.map((c: any) => (
                <tr key={c.key}>
                  <td className="px-4 py-2.5 text-xs text-slate-600" dir="ltr">{c.key}</td>
                  <td className="px-4 py-2.5">
                    <Badge tone={c.state === 'open' ? 'red' : c.state === 'half_open' ? 'amber' : 'green'}>
                      {c.state === 'open' ? 'مفتوحة' : c.state === 'half_open' ? 'فحص' : 'مغلقة'}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-500">{c.failures}</td>
                  <td className="px-4 py-2.5 text-[10px] text-slate-400">{c.retryAt ? new Date(c.retryAt).toLocaleTimeString('ar-EG') : '—'}</td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </div>

      <AlertsList alerts={overview.alerts} />
    </div>
  );
}
