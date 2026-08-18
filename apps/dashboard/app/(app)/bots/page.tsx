import Link from 'next/link';
import { apiServer } from '@/lib/api';
import { Badge, Button, Card, CardHeader, Table } from '@/components/ui';

export default async function BotsPage() {
  const bots = await apiServer<any[]>('/bots');
  const clients = await apiServer<any[]>('/clients');
  const clientName = (id: string) => clients.find((c) => c.id === id)?.name ?? id;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900">البوتات</h1>
          <p className="mt-1 text-xs text-slate-500">الشخصية، المعرفة، سياسة التوجيه، والملعب التجريبي لكل بوت</p>
        </div>
        <Link href="/bots/new"><Button>+ بوت جديد</Button></Link>
      </div>

      <Card>
        <CardHeader title="كل البوتات" subtitle={`${bots.length} بوت`} />
        <Table head={['البوت', 'العميل', 'طبقات التوجيه', 'المعرفة', 'الحالة', 'أدوات']}>
          {bots.map((b: any) => (
            <tr key={b.id} className="transition hover:bg-slate-50">
              <td className="px-4 py-3 text-sm font-bold text-slate-800">{b.name}</td>
              <td className="px-4 py-3 text-xs text-slate-500">{clientName(b.clientId)}</td>
              <td className="px-4 py-3">
                <Badge tone="blue">{b.routing?.strategy ?? '—'}</Badge>
                <span className="mr-2 text-[11px] text-slate-400">{b.routing?.tiers?.length ?? 0} طبقات</span>
              </td>
              <td className="px-4 py-3 text-xs text-slate-500">{b.knowledgeChunks.length} عنصر</td>
              <td className="px-4 py-3"><Badge tone={b.active ? 'green' : 'slate'}>{b.active ? 'مفعّل' : 'معطل'}</Badge></td>
              <td className="px-4 py-3">
                <Link href={`/bots/${b.id}`} className="text-xs font-bold text-emerald-600 hover:underline">إدارة ←</Link>
              </td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}
