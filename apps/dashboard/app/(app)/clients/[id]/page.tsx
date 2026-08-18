'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { apiClient } from '@/lib/client-api';
import { Badge, Card, CardHeader, Stat } from '@/components/ui';
import { PageError, PageLoading } from '@/components/page-state';
import BrandEditor from './brand-editor';
import ThemeEditor from './theme-editor';
import DomainsEditor from './domains-editor';

export default function ClientDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [client, setClient] = useState<any>(null);
  const [bots, setBots] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [snippet, setSnippet] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    Promise.all([
      apiClient<any>(`/clients/${id}`),
      apiClient<any[]>(`/bots?clientId=${id}`),
      apiClient<any>(`/clients/${id}/stats`),
      apiClient<any>(`/clients/${id}/snippet`),
    ])
      .then(([c, b, s, sn]) => {
        setClient(c);
        setBots(b);
        setStats(s);
        setSnippet(sn);
      })
      .catch((e) => setError((e as Error).message));
  }, [id]);

  if (error) return <PageError msg={error} />;
  if (!client || !stats || !snippet) return <PageLoading />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl text-sm font-extrabold text-white" style={{ background: client.brand?.colors?.primary ?? '#0f766e' }}>
            {String(client.name).slice(0, 2)}
          </span>
          <div>
            <h1 className="text-xl font-extrabold text-slate-900">{client.name}</h1>
            <p className="text-xs text-slate-500" dir="ltr">{client.siteUrl}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={client.status === 'active' ? 'green' : 'red'}>{client.status === 'active' ? 'نشط' : 'موقوف'}</Badge>
          <Link href="/demo-store" className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700">
            👁️ معاينة في متجر تجريبي
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="رسائل اليوم" value={stats.today.messages.toLocaleString('ar-EG')} />
        <Stat label="توكنز الشهر" value={stats.month.tokensIn.toLocaleString('ar-EG')} />
        <Stat label="زوار اليوم" value={stats.visitorsToday.toLocaleString('ar-EG')} />
        <Stat label="تكلفة الشهر" value={`$${stats.month.costUsd.toFixed(4)}`} accent="text-amber-600" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <BrandEditor client={client} />
        <ThemeEditor client={client} />
      </div>

      <Card>
        <CardHeader title="مقتطف التضمين (Snippet)" subtitle="ضعه في موقع العميل قبل وسم </body> — يعمل على CS-Cart وWordPress وأي منصة" />
        <div className="space-y-3 p-5">
          <pre className="overflow-x-auto rounded-lg bg-slate-950 p-4 text-[12px] leading-relaxed text-emerald-300" dir="ltr">{snippet.snippet}</pre>
          <ul className="space-y-1.5 text-xs text-slate-500">
            {snippet.instructions.map((s: string) => (
              <li key={s} className="flex gap-2"><span className="text-emerald-500">•</span>{s}</li>
            ))}
          </ul>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <DomainsEditor client={client} />

        <Card>
          <CardHeader
            title="بوتات العميل"
            subtitle={`${bots.length} بوت`}
            action={<Link href={`/bots/new?clientId=${id}`} className="text-xs font-bold text-emerald-600 hover:underline">+ بوت جديد ←</Link>}
          />
          <div className="divide-y divide-slate-50">
            {bots.length === 0 && <div className="px-5 py-6 text-center text-xs text-slate-400">لا توجد بوتات — أنشئ أول بوت لهذا العميل</div>}
            {bots.map((b: any) => (
              <Link key={b.id} href={`/bots/${b.id}`} className="flex items-center justify-between px-5 py-3 transition hover:bg-slate-50">
                <div>
                  <div className="text-sm font-bold text-slate-800">{b.name}</div>
                  <div className="text-[11px] text-slate-400">{b.routing?.tiers?.length ?? 0} طبقات توجيه · {b.knowledgeChunks.length} عنصر معرفة</div>
                </div>
                <Badge tone={b.active ? 'green' : 'slate'}>{b.active ? 'مفعّل' : 'معطل'}</Badge>
              </Link>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
