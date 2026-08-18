'use client';

import { useApi } from '@/lib/client-api';
import { Card, CardHeader, Table } from '@/components/ui';
import { PageError, PageLoading } from '@/components/page-state';

export default function ConversationsPage() {
  const { data: conversations, error: convError } = useApi<any[]>('/conversations?limit=100');
  const { data: clients } = useApi<any[]>('/clients');
  const clientName = (id: string) => (clients ?? []).find((c) => c.id === id)?.name ?? id;

  if (convError) return <PageError msg={convError} />;
  if (!conversations) return <PageLoading />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-extrabold text-slate-900">سجل المحادثات</h1>
        <p className="mt-1 text-xs text-slate-500">كل محادثة مع زوار مواقع العملاء — مع سياق الصفحة والتقييمات</p>
      </div>

      <Card>
        <CardHeader title="المحادثات" subtitle={`${conversations.length} محادثة`} />
        <Table head={['العميل', 'الزائر', 'الصفحة', 'الرسائل', 'آخر رسالة', 'آخر نشاط']}>
          {conversations.map((c: any) => (
            <tr key={c.id} className="transition hover:bg-slate-50">
              <td className="px-4 py-3 text-xs font-bold text-slate-700">{clientName(c.clientId)}</td>
              <td className="px-4 py-3 text-[11px] text-slate-400" dir="ltr">{c.visitorId}</td>
              <td className="px-4 py-3 text-[11px] text-slate-400" dir="ltr">{c.pagePath ?? '—'}</td>
              <td className="px-4 py-3 text-xs">{c.messageCount}</td>
              <td className="max-w-56 truncate px-4 py-3 text-xs text-slate-600">{c.lastMessage}</td>
              <td className="px-4 py-3 text-[11px] text-slate-400">{new Date(c.updatedAt).toLocaleString('ar-EG')}</td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}
