import Link from 'next/link';
import { apiServer } from '@/lib/api';
import { Badge, Card, CardHeader } from '@/components/ui';
import PersonaEditor from './persona-editor';
import KnowledgeEditor from './knowledge-editor';
import RoutingEditor from './routing-editor';
import Playground from './playground';

export default async function BotDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bot = await apiServer<any>(`/bots/${id}`);
  const providers = await apiServer<any[]>('/providers');
  const models = await apiServer<any[]>('/providers/models');
  const clients = await apiServer<any[]>('/clients');
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
