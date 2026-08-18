import Link from 'next/link';
import { apiServer } from '@/lib/api';
import { Badge, Card, CardHeader, Stat } from '@/components/ui';
import LiveOverview from '@/components/live-overview';

interface Overview {
  worker: { alive: boolean; lastPulse: number | null };
  providers: Array<{
    providerId: string;
    providerName: string;
    kind: string;
    tier: string;
    hasKey: boolean;
    lastPulse: number | null;
    ok: boolean | null;
    ewmaLatencyMs: number | null;
    successRate: number | null;
    circuits: Array<{ model: string; state: string; failures: number }>;
  }>;
  today: { messages: number; tokensIn: number; tokensOut: number; costUsd: number; errors: number };
  alerts: Array<{ id: string; severity: string; title: string; createdAt: number }>;
}

const EMPTY_OVERVIEW: Overview = {
  worker: { alive: false, lastPulse: null },
  providers: [],
  today: { messages: 0, tokensIn: 0, tokensOut: 0, costUsd: 0, errors: 0 },
  alerts: [],
};

export default async function DashboardPage() {
  let overview: Overview;
  let usage: any;
  let conversations: any[];
  try {
    overview = await apiServer<Overview>('/status/overview');
  } catch {
    overview = EMPTY_OVERVIEW;
  }
  try {
    usage = await apiServer<any>('/usage/summary');
  } catch {
    usage = null;
  }
  try {
    conversations = await apiServer<any[]>('/conversations?limit=6');
  } catch {
    conversations = [];
  }

  const fmt = (n: number) => n.toLocaleString('ar-EG');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900">نظرة عامة</h1>
          <p className="mt-1 text-xs text-slate-500">متابعة حية للمنصة — النبضات تعمل على مدار الساعة حتى لو كانت اللوحة مغلقة</p>
        </div>
        <Link href="/demo-store" className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-bold text-white transition hover:bg-slate-800">
          🛍️ جرّب بوت الشوا في المتجر التجريبي
        </Link>
      </div>

      {/* بطاقات الأرقام */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Stat label="رسائل اليوم" value={fmt(overview.today.messages)} sub="عبر كل العملاء" accent="text-emerald-600" />
        <Stat label="توكنز اليوم" value={fmt(overview.today.tokensIn + overview.today.tokensOut)} sub={`دخل ${fmt(overview.today.tokensIn)} / خرج ${fmt(overview.today.tokensOut)}`} />
        <Stat label="تكلفة اليوم" value={`$${overview.today.costUsd.toFixed(4)}`} sub="تقديرية حسب أسعار النماذج" accent="text-amber-600" />
        <Stat label="أخطاء اليوم" value={fmt(overview.today.errors)} sub="يُعالجها محرك التوجيه تلقائياً" accent={overview.today.errors > 0 ? 'text-rose-600' : 'text-slate-900'} />
        <Stat
          label="العامل الخلفي 24/7"
          value={overview.worker.alive ? 'يعمل' : 'متوقف!'}
          sub={overview.worker.alive ? 'نبضات + Dead-Man Switch نشطة' : 'تحقق فوراً'}
          accent={overview.worker.alive ? 'text-emerald-600' : 'text-rose-600'}
        />
      </div>

      {/* حالة حية */}
      <LiveOverview />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* المزودون */}
        <Card className="lg:col-span-2">
          <CardHeader
            title="المزودون والنماذج"
            subtitle="نبضة كل 30 ثانية + دوائر كسر تلقائية"
            action={<Link href="/providers" className="text-xs font-bold text-emerald-600 hover:underline">إدارة المزودين ←</Link>}
          />
          <div className="divide-y divide-slate-50">
            {overview.providers.map((p) => (
              <div key={p.providerId} className="flex items-center justify-between px-5 py-3">
                <div className="flex items-center gap-3">
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${
                      p.ok === true ? 'bg-emerald-500 cbd-live-dot' : p.ok === false ? 'bg-rose-500' : 'bg-slate-300'
                    }`}
                  />
                  <div>
                    <div className="text-sm font-bold text-slate-800">{p.providerName}</div>
                    <div className="text-[11px] text-slate-400">
                      {p.kind} · {p.tier === 'free' ? 'مجاني' : 'مدفوع'} · {p.hasKey ? 'مفتاح مضبوط' : 'بدون مفتاح'}
                      {p.ewmaLatencyMs ? ` · ${p.ewmaLatencyMs}ms` : ''}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {p.circuits.some((c) => c.state === 'open') && <Badge tone="red">دائرة مفتوحة</Badge>}
                  {p.successRate != null && <Badge tone={p.successRate > 0.9 ? 'green' : 'amber'}>{Math.round(p.successRate * 100)}% نجاح</Badge>}
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* آخر المحادثات */}
        <Card>
          <CardHeader
            title="آخر المحادثات"
            action={<Link href="/conversations" className="text-xs font-bold text-emerald-600 hover:underline">الكل ←</Link>}
          />
          <div className="divide-y divide-slate-50">
            {conversations.length === 0 && <div className="px-5 py-8 text-center text-xs text-slate-400">لا توجد محادثات بعد</div>}
            {conversations.map((c: any) => (
              <Link key={c.id} href={`/conversations/${c.id}`} className="block px-5 py-3 transition hover:bg-slate-50">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-400">{c.clientId === 'clt_elshawwa' ? 'الشوا' : c.clientId}</span>
                  <span className="text-[10px] text-slate-300">{new Date(c.updatedAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <p className="mt-1 truncate text-xs text-slate-600">{c.lastMessage || '—'}</p>
              </Link>
            ))}
          </div>
        </Card>
      </div>

      {/* التنبيهات */}
      {overview.alerts.length > 0 && (
        <Card>
          <CardHeader title="تنبيهات نشطة" subtitle="تُجمع تلقائياً (بحد أقصى تنبيه كل 15 دقيقة للحدث الواحد)" />
          <div className="divide-y divide-slate-50">
            {overview.alerts.map((a) => (
              <div key={a.id} className="flex items-center gap-3 px-5 py-3">
                <Badge tone={a.severity === 'critical' ? 'red' : 'amber'}>{a.severity === 'critical' ? 'حرج' : 'تحذير'}</Badge>
                <span className="text-sm font-semibold text-slate-700">{a.title}</span>
                <span className="mr-auto text-[11px] text-slate-400">{new Date(a.createdAt).toLocaleString('ar-EG')}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
