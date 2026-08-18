import { apiServer } from '@/lib/api';
import { Badge, Card, CardHeader, Table } from '@/components/ui';
import LiveOverview from '@/components/live-overview';

export default async function StatusPage() {
  const overview = await apiServer<any>('/status/overview');
  const heartbeats = await apiServer<any[]>('/status/heartbeats');

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

      {overview.alerts.length > 0 && (
        <Card>
          <CardHeader title="التنبيهات" />
          <div className="divide-y divide-slate-50">
            {overview.alerts.map((a: any) => (
              <div key={a.id} className="px-5 py-3">
                <div className="flex items-center gap-2">
                  <Badge tone={a.severity === 'critical' ? 'red' : 'amber'}>{a.severity}</Badge>
                  <span className="text-sm font-bold text-slate-700">{a.title}</span>
                </div>
                {a.body && <p className="mt-1 text-xs text-slate-500">{a.body}</p>}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
