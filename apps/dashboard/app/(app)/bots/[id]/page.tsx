'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { apiClient } from '@/lib/client-api';
import { Badge } from '@/components/ui';
import { PageError, PageLoading } from '@/components/page-state';
import PersonaEditor from './persona-editor';
import KnowledgeEditor from './knowledge-editor';
import RoutingEditor from './routing-editor';
import Playground from './playground';

export default function BotDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [bot, setBot] = useState<any>(null);
  const [providers, setProviders] = useState<any[]>([]);
  const [models, setModels] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    Promise.all([
      apiClient<any>(`/bots/${id}`),
      apiClient<any[]>('/providers'),
      apiClient<any[]>('/providers/models'),
      apiClient<any[]>('/clients'),
    ])
      .then(([b, p, m, c]) => {
        setBot(b);
        setProviders(p);
        setModels(m);
        setClients(c);
      })
      .catch((e) => setError((e as Error).message));
  }, [id]);

  if (error) return <PageError msg={error} />;
  if (!bot) return <PageLoading />;

  const client = clients.find((c) => c.id === bot.clientId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-extrabold text-slate-900">{bot.name}</h1>
            <Badge tone={bot.active ? 'green' : 'slate'}>{bot.active ? 'مفعّل' : 'معطل'}</Badge>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            <Link href={`/clients/${bot.clientId}`} className="font-bold text-emerald-600 hover:underline">{client?.name ?? bot.clientId}</Link>
            {' · '}اللغة: {bot.language === 'ar' ? 'عربي' : bot.language}
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <PersonaEditor bot={bot} />
        <KnowledgeEditor bot={bot} />
      </div>

      <RoutingEditor bot={bot} providers={providers} models={models} />

      <Playground bot={bot} />
    </div>
  );
}
