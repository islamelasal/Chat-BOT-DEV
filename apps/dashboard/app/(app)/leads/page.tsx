import Link from 'next/link';
import { apiServer } from '@/lib/api';
import { Badge, Card, CardHeader, Table } from '@/components/ui';

export default async function LeadsPage({ searchParams }: { searchParams: Promise<{ clientId?: string }> }) {
  const { clientId } = await searchParams;
  const leads = await apiServer<any[]>(`/leads?limit=500${clientId ? `&clientId=${clientId}` : ''}`);
  const clients = await apiServer<any[]>('/clients');
  const clientName = (id: string) => clients.find((c) => c.id === id)?.name ?? id;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900">العملاء المحتملون (Leads)</h1>
          <p className="mt-1 text-xs text-slate-500">
            البيانات اللي بيجمعها البوت من زوار مواقع عملائك — جاهزة للتصدير لأي CRM
          </p>
        </div>
        <div className="flex items-center gap-2">
          {clientId && (
            <Link href="/leads" className="text-xs font-bold text-slate-500 hover:underline">كل العملاء ←</Link>
          )}
          <a
            href={`/backend/leads/export.csv${clientId ? `?clientId=${clientId}` : ''}`}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-emerald-700"
          >
            ⬇ تصدير CSV (Excel)
          </a>
        </div>
      </div>

      <Card>
        <CardHeader title="البيانات المجمّعة" subtitle={`${leads.length} عميل محتمل`} />
        <Table head={['الوقت', 'العميل', 'الاسم', 'البريد', 'الهاتف', 'الصفحة']}>
          {leads.length === 0 && (
            <tr>
              <td colSpan={6} className="px-4 py-10 text-center text-xs text-slate-400">
                لا توجد بيانات بعد — جرّب زر «📞 اطلب التواصل معاك» في المتجر التجريبي
              </td>
            </tr>
          )}
          {leads.map((l: any) => (
            <tr key={l.id} className="transition hover:bg-slate-50">
              <td className="px-4 py-3 text-[11px] text-slate-400">{new Date(l.createdAt).toLocaleString('ar-EG')}</td>
              <td className="px-4 py-3">
                <Link href={`/leads?clientId=${l.clientId}`} className="text-xs font-bold text-slate-700 hover:text-emerald-600">
                  {clientName(l.clientId)}
                </Link>
              </td>
              <td className="px-4 py-3 text-sm font-bold text-slate-800">{l.name}</td>
              <td className="px-4 py-3 text-xs text-slate-600" dir="ltr">{l.email}</td>
              <td className="px-4 py-3 text-xs text-slate-600" dir="ltr">{l.phone || '—'}</td>
              <td className="px-4 py-3 text-[11px] text-slate-400" dir="ltr">{l.pagePath ?? '—'}</td>
            </tr>
          ))}
        </Table>
      </Card>

      <Card>
        <CardHeader title="لماذا هذه الميزة مهمة؟" subtitle="من البحث التنافسي (أغسطس 2026)" />
        <div className="grid gap-3 p-5 text-xs text-slate-500 sm:grid-cols-3">
          <div className="rounded-xl bg-slate-50 p-4">
            <div className="font-extrabold text-slate-700">✅ عند كل المنافسين</div>
            <p className="mt-1 leading-relaxed">Chatbase وSiteGPT وStammer وTidio كلهم يعتبرون جمع البيانات «الميزة رقم 1 للبيع» — لأنها تتحول مباشرة لأرقام مبيعات.</p>
          </div>
          <div className="rounded-xl bg-slate-50 p-4">
            <div className="font-extrabold text-slate-700">📈 عائد مباشر للعميل</div>
            <p className="mt-1 leading-relaxed">كل زائر سأل ولم يشترِ يتحول لعميل محتمل مسجّل بالاسم والبريد والتليفون — بدل ما يضيع.</p>
          </div>
          <div className="rounded-xl bg-slate-50 p-4">
            <div className="font-extrabold text-slate-700">🔌 تكامل لاحق</div>
            <p className="mt-1 leading-relaxed">نفس الجدول سيتصل بـ Webhooks (Zapier/Sheets/CRM) لإرسال كل بيانات جديدة تلقائياً.</p>
          </div>
        </div>
      </Card>
    </div>
  );
}
