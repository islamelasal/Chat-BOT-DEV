'use client';

import { useParams } from 'next/navigation';
import { useApi } from '@/lib/client-api';
import { Badge, Card, CardHeader } from '@/components/ui';
import { PageError, PageLoading } from '@/components/page-state';

export default function ConversationDetailPage() {
  const params = useParams<{ id: string }>();
  const { data: conv, error } = useApi<any>(`/conversations/${params.id}`);

  if (error) return <PageError msg={error} />;
  if (!conv) return <PageLoading />;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-extrabold text-slate-900">تفاصيل المحادثة</h1>
        <p className="mt-1 text-[11px] text-slate-400" dir="ltr">
          {conv.id} · الزائر: {conv.visitorId} · الصفحة: {conv.pagePath ?? '—'}
        </p>
      </div>

      <Card>
        <CardHeader title="الرسائل" subtitle={`${conv.messages.length} رسالة`} />
        <div className="space-y-3 p-5">
          {conv.messages.map((m: any) => (
            <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-start flex-row-reverse' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                m.role === 'user' ? 'bg-emerald-600 text-white' : 'border border-slate-200 bg-slate-50 text-slate-800'
              }`}>
                <div className="whitespace-pre-wrap">{m.content}</div>
                <div className="mt-1.5 flex items-center gap-2 text-[10px] opacity-70">
                  <span>{new Date(m.createdAt).toLocaleTimeString('ar-EG')}</span>
                  {m.feedback && <Badge tone={m.feedback === 'up' ? 'green' : 'red'}>{m.feedback === 'up' ? '👍 تقييم إيجابي' : '👎 تقييم سلبي'}</Badge>}
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
