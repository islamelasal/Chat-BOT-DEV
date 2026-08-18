import Link from 'next/link';
import { apiServer } from '@/lib/api';
import { Badge, Button, Card, CardHeader, Table } from '@/components/ui';

export default async function ClientsPage() {
  const clients = await apiServer<any[]>('/clients');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900">العملاء</h1>
          <p className="mt-1 text-xs text-slate-500">كل عميل له برانده وثيمه وبوتاته ونطاقاته المسموحة</p>
        </div>
        <Link href="/clients/new">
          <Button>+ عميل جديد</Button>
        </Link>
      </div>

      <Card>
        <CardHeader title="قائمة العملاء" subtitle={`${clients.length} عميل`} />
        <Table head={['العميل', 'الموقع', 'الباقة', 'الحالة', 'النطاقات', 'أدوات']}>
          {clients.map((c: any) => (
            <tr key={c.id} className="transition hover:bg-slate-50">
              <td className="px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg text-xs font-extrabold text-white" style={{ background: c.brand?.colors?.primary ?? '#0f766e' }}>
                    {String(c.name).slice(0, 2)}
                  </span>
                  <span className="text-sm font-bold text-slate-800">{c.name}</span>
                </div>
              </td>
              <td className="px-4 py-3 text-xs text-slate-500" dir="ltr">{c.siteUrl}</td>
              <td className="px-4 py-3"><Badge tone={c.plan === 'pro' ? 'blue' : c.plan === 'free' ? 'slate' : 'green'}>{c.plan}</Badge></td>
              <td className="px-4 py-3">
                <Badge tone={c.status === 'active' ? 'green' : c.status === 'suspended' ? 'red' : 'amber'}>
                  {c.status === 'active' ? 'نشط' : c.status === 'suspended' ? 'موقوف' : 'تجريبي'}
                </Badge>
              </td>
              <td className="px-4 py-3 text-xs text-slate-500" dir="ltr">{(c.domains ?? []).join('، ') || '—'}</td>
              <td className="px-4 py-3">
                <Link href={`/clients/${c.id}`} className="text-xs font-bold text-emerald-600 hover:underline">
                  إدارة ←
                </Link>
              </td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}
