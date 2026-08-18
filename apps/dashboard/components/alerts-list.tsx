'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge, Button, Card, CardHeader } from '@/components/ui';

export default function AlertsList({ alerts }: { alerts: any[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);

  if (!alerts || alerts.length === 0) return null;

  const resolve = async (id: string) => {
    setBusyId(id);
    try {
      await fetch(`/backend/status/alerts/${id}/resolve`, { method: 'POST', credentials: 'include' });
      router.refresh();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card>
      <CardHeader title="التنبيهات" subtitle="تُجمع تلقائياً — تنبيه واحد كحد أقصى كل 15 دقيقة للحدث نفسه" />
      <div className="divide-y divide-slate-50">
        {alerts.map((a: any) => (
          <div key={a.id} className="flex items-center gap-3 px-5 py-3">
            <Badge tone={a.severity === 'critical' ? 'red' : 'amber'}>{a.severity === 'critical' ? 'حرج' : 'تحذير'}</Badge>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-slate-700">{a.title}</div>
              {a.body && <div className="truncate text-[11px] text-slate-400">{a.body}</div>}
              <div className="text-[10px] text-slate-300">{new Date(a.createdAt).toLocaleString('ar-EG')}</div>
            </div>
            <Button variant="outline" onClick={() => void resolve(a.id)} disabled={busyId === a.id}>
              {busyId === a.id ? '...' : 'تم الحل'}
            </Button>
          </div>
        ))}
      </div>
    </Card>
  );
}
