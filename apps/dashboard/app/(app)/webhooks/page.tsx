'use client';

/**
 * Webhooks الصادرة — ربط المنصة بأي نظام خارجي (Zapier / Google Sheets / CRM)
 * كل حدث (Lead جديد، رسالة، تحويل بشري، تتبع طلب، مزامنة كتالوج) يُرسل كرزمة JSON
 * موقّعة HMAC-SHA256 مع إعادة محاولة تلقائية بتراجع أسي.
 */
import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { apiClient } from '@/lib/client-api';
import { Badge, Button, Card, CardHeader, Field, Input, Table } from '@/components/ui';
import { PageError, PageLoading } from '@/components/page-state';

const EVENT_LABELS: Record<string, string> = {
  'lead.created': '👤 Lead جديد',
  'conversation.message': '💬 رسالة محادثة',
  'handoff.requested': '📞 طلب تحويل بشري',
  'order.tracked': '📦 تتبع طلب',
  'catalog.synced': '🛒 مزامنة كتالوج',
  'webhook.test': '🧪 اختبار اتصال',
};

const STATUS_TONE: Record<string, 'green' | 'red' | 'amber' | 'slate' | 'blue'> = {
  success: 'green',
  dead: 'red',
  failed: 'amber',
  pending: 'slate',
  sending: 'blue',
};

function statusLabel(s: string) {
  return { success: 'نجح', dead: 'فشل نهائي', failed: 'بانتظار إعادة المحاولة', pending: 'قيد الانتظار', sending: 'جارٍ الإرسال' }[s] ?? s;
}

function WebhooksContent() {
  const searchParams = useSearchParams();
  const clientId = searchParams.get('clientId') ?? '';
  const [clients, setClients] = useState<any[]>([]);
  const [data, setData] = useState<{ events: string[]; endpoints: any[] } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  // نموذج إنشاء/تعديل
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState({ name: '', url: '', secret: '', events: ['lead.created'] });
  const [formError, setFormError] = useState('');

  // اختبار + سجل تسليمات + كشف السر
  const [testResult, setTestResult] = useState<Record<string, any>>({});
  const [testing, setTesting] = useState('');
  const [deliveriesFor, setDeliveriesFor] = useState<any | null>(null);
  const [deliveries, setDeliveries] = useState<any[] | null>(null);
  const [revealed, setRevealed] = useState<Record<string, string>>({});

  const load = useCallback(() => {
    setError('');
    Promise.all([apiClient<any[]>('/clients'), clientId ? apiClient<{ events: string[]; endpoints: any[] }>(`/clients/${clientId}/webhooks`) : Promise.resolve(null)])
      .then(([c, d]) => {
        setClients(c);
        setData(d);
      })
      .catch((e) => setError((e as Error).message));
  }, [clientId]);

  useEffect(() => {
    load();
  }, [load]);

  if (error) return <PageError msg={error} />;
  if (!data || !clients.length) return <PageLoading />;

  const clientName = (id: string) => clients.find((c) => c.id === id)?.name ?? id;

  const openCreate = () => {
    setEditing({ isNew: true });
    setForm({ name: '', url: '', secret: '', events: ['lead.created'] });
    setFormError('');
  };

  const openEdit = (e: any) => {
    setEditing(e);
    setForm({ name: e.name, url: e.url, secret: '', events: [...e.events] });
    setFormError('');
  };

  const save = async () => {
    setBusy('save');
    setFormError('');
    try {
      const body = { name: form.name, url: form.url, secret: form.secret || undefined, events: form.events };
      if (editing.isNew) {
        await apiClient(`/clients/${clientId}/webhooks`, { method: 'POST', json: body });
      } else {
        await apiClient(`/clients/${clientId}/webhooks/${editing.id}`, { method: 'PATCH', json: body });
      }
      setEditing(null);
      load();
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setBusy('');
    }
  };

  const remove = async (id: string) => {
    if (!confirm('حذف نقطة الوصول دي نهائياً مع كل سجل تسليماتها؟')) return;
    setBusy(id);
    try {
      await apiClient(`/clients/${clientId}/webhooks/${id}`, { method: 'DELETE' });
      load();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy('');
    }
  };

  const test = async (id: string) => {
    setTesting(id);
    setTestResult((r) => ({ ...r, [id]: null }));
    try {
      const res = await apiClient<any>(`/clients/${clientId}/webhooks/${id}/test`, { method: 'POST' });
      setTestResult((r) => ({ ...r, [id]: res }));
      load();
    } catch (e) {
      setTestResult((r) => ({ ...r, [id]: { ok: false, error: (e as Error).message } }));
    } finally {
      setTesting('');
    }
  };

  const reveal = async (id: string) => {
    const res = await apiClient<{ secret: string }>(`/clients/${clientId}/webhooks/${id}/reveal`, { method: 'POST' });
    setRevealed((r) => ({ ...r, [id]: res.secret }));
  };

  const openDeliveries = async (e: any) => {
    setDeliveriesFor(e);
    setDeliveries(null);
    const list = await apiClient<any[]>(`/clients/${clientId}/webhooks/${e.id}/deliveries?limit=50`);
    setDeliveries(list);
  };

  const retryDelivery = async (did: string) => {
    if (!deliveriesFor) return;
    await apiClient(`/clients/${clientId}/webhooks/${deliveriesFor.id}/deliveries/${did}/retry`, { method: 'POST' });
    openDeliveries(deliveriesFor);
  };

  const toggleEvent = (ev: string) =>
    setForm((f) => ({
      ...f,
      events: f.events.includes(ev) ? f.events.filter((x) => x !== ev) : [...f.events, ev],
    }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900">Webhooks الصادرة</h1>
          <p className="mt-1 text-xs text-slate-500">
            ارسل كل Lead جديد أو رسالة أو تحويل بشري تلقائياً لـ Zapier أو Google Sheets أو أي CRM — موقّعة HMAC ومعها إعادة محاولة ذكية
          </p>
        </div>
        <select
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700"
          value={clientId}
          onChange={(e) => {
            const v = e.target.value;
            const sp = new URLSearchParams(searchParams.toString());
            if (v) sp.set('clientId', v); else sp.delete('clientId');
            window.history.replaceState(null, '', `/webhooks?${sp.toString()}`);
            window.location.reload();
          }}
        >
          <option value="">— اختر العميل —</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      {!clientId ? (
        <Card>
          <p className="text-sm text-slate-500">اختر عميلاً من القائمة فوق عشان تشوف وتدير نقاط الـ webhook الخاصة بيه.</p>
        </Card>
      ) : (
        <>
          <Card
            className=""
          >
            <CardHeader
              title={`نقاط الوصول — ${clientName(clientId)}`}
              subtitle={`${data.endpoints.length} نقطة · الأحداث المتاحة: ${data.events.length}`}
              action={
                <Button onClick={openCreate} disabled={busy === 'save'}>
                  + نقطة جديدة
                </Button>
              }
            />
            {data.endpoints.length === 0 ? (
              <div className="py-10 text-center text-sm text-slate-400">
                مفيش نقاط وصول لسه. اضغط «+ نقطة جديدة» واربط المنصة بزابيير أو شيتس في دقيقة واحدة.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {data.endpoints.map((e) => (
                  <div key={e.id} className="flex flex-wrap items-start justify-between gap-3 py-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-extrabold text-slate-800">{e.name}</span>
                        {e.lastStatus === 'ok' ? (
                          <Badge tone="green">متصل</Badge>
                        ) : e.lastStatus ? (
                          <Badge tone="red">{e.lastStatus}</Badge>
                        ) : (
                          <Badge tone="slate">لم يُجرَّب</Badge>
                        )}
                      </div>
                      <div className="mt-1 font-mono text-[11px] text-slate-500" dir="ltr">{e.url}</div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        {e.events.map((ev: string) => (
                          <span key={ev} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                            {EVENT_LABELS[ev] ?? ev}
                          </span>
                        ))}
                      </div>
                      <div className="mt-1.5 flex items-center gap-2 text-[11px] text-slate-400">
                        <span>السر: <code>{e.secretMasked || '—'}</code></span>
                        {e.secretMasked && (
                          <button className="font-bold text-emerald-600 hover:underline" onClick={() => reveal(e.id)}>
                            {revealed[e.id] ? `مكشوف: ${revealed[e.id]}` : 'إظهار'}
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                      <Button variant="outline" disabled={testing === e.id} onClick={() => test(e.id)}>
                        {testing === e.id ? 'جارٍ الاختبار…' : '🧪 اختبار'}
                      </Button>
                      <Button variant="outline" onClick={() => openDeliveries(e)}>سجل التسليمات</Button>
                      <Button
                        variant="ghost"
                        onClick={async () => {
                          await apiClient(`/clients/${clientId}/webhooks/${e.id}`, { method: 'PATCH', json: { active: !e.active } });
                          load();
                        }}
                      >
                        {e.active ? '⏸ إيقاف' : '▶ تفعيل'}
                      </Button>
                      <Button variant="ghost" onClick={() => openEdit(e)}>تعديل</Button>
                      <Button variant="danger" disabled={busy === e.id} onClick={() => remove(e.id)}>
                        {busy === e.id ? '…' : 'حذف'}
                      </Button>
                    </div>
                    {testResult[e.id] && (
                      <div
                        className={`w-full rounded-lg border px-3 py-2 text-xs ${
                          testResult[e.id].ok ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-800'
                        }`}
                      >
                        {testResult[e.id].ok
                          ? `✅ وصل الاختبار — استجابة ${testResult[e.id].status} خلال ${testResult[e.id].durationMs}ms. الرد: ${(testResult[e.id].responseBody ?? '').slice(0, 160)}`
                          : `❌ ${testResult[e.id].error ?? 'فشل الاختبار'}${testResult[e.id].status ? ` (HTTP ${testResult[e.id].status})` : ''}`}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* نافذة إنشاء/تعديل */}
          {editing && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" dir="rtl">
              <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
                <h2 className="text-base font-extrabold text-slate-900">{editing.isNew ? 'نقطة وصول جديدة' : 'تعديل نقطة الوصول'}</h2>
                <div className="mt-4 space-y-3">
                  <Field label="الاسم">
                    <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="مثلاً: Zapier — Leads الشوا" />
                  </Field>
                  <Field label="الرابط (Webhook URL)" hint="https فقط في الإنتاج — انسخ الرابط من Zapier أو أداة الأتمتة بتاعتك">
                    <Input dir="ltr" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://hooks.zapier.com/hooks/catch/…" />
                  </Field>
                  <Field label="السر (يُستخدم في توقيع HMAC-SHA256)" hint="لو سيبته فاضي هنولّد سر عشوائي قوي تلقائياً">
                    <div className="flex gap-2">
                      <Input dir="ltr" value={form.secret} onChange={(e) => setForm({ ...form, secret: e.target.value })} placeholder="(اختياري — يُولَّد تلقائياً)" />
                      <Button
                        variant="outline"
                        onClick={() => {
                          const arr = new Uint8Array(24);
                          crypto.getRandomValues(arr);
                          setForm({ ...form, secret: btoa(String.fromCharCode(...arr)).replace(/[+/=]/g, '').slice(0, 32) });
                        }}
                      >
                        توليد
                      </Button>
                    </div>
                  </Field>
                  <Field label="الأحداث اللي هتتبعت">
                    <div className="flex flex-wrap gap-2">
                      {data.events.map((ev) => (
                        <button
                          key={ev}
                          type="button"
                          onClick={() => toggleEvent(ev)}
                          className={`rounded-full border px-3 py-1.5 text-xs font-bold transition ${
                            form.events.includes(ev)
                              ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                              : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                          }`}
                        >
                          {EVENT_LABELS[ev] ?? ev}
                        </button>
                      ))}
                    </div>
                  </Field>
                  {formError && <p className="text-xs font-bold text-red-600">{formError}</p>}
                </div>
                <div className="mt-6 flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => setEditing(null)}>إلغاء</Button>
                  <Button onClick={save} disabled={busy === 'save' || !form.name.trim() || !form.url.trim() || form.events.length === 0}>
                    {busy === 'save' ? 'جارٍ الحفظ…' : 'حفظ'}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* سجل التسليمات */}
          {deliveriesFor && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" dir="rtl">
              <div className="w-full max-w-3xl rounded-2xl bg-white p-6 shadow-2xl">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-extrabold text-slate-900">سجل التسليمات — {deliveriesFor.name}</h2>
                  <Button variant="ghost" onClick={() => setDeliveriesFor(null)}>✕ إغلاق</Button>
                </div>
                <div className="mt-4 max-h-[60vh] overflow-auto">
                  {!deliveries ? (
                    <PageLoading />
                  ) : deliveries.length === 0 ? (
                    <p className="py-8 text-center text-sm text-slate-400">مفيش تسليمات لسه — هيظهر هنا كل حدث بيتسجل.</p>
                  ) : (
                    <Table head={['الحدث', 'الحالة', 'المحاولات', 'الكود', 'المدة', 'التفاصيل', '']}>
                      {deliveries.map((d) => (
                        <tr key={d.id} className="border-b border-slate-100 text-xs">
                          <td className="px-3 py-2 font-bold">{EVENT_LABELS[d.event] ?? d.event}</td>
                          <td className="px-3 py-2"><Badge tone={STATUS_TONE[d.status] ?? 'slate'}>{statusLabel(d.status)}</Badge></td>
                          <td className="px-3 py-2">{d.attempts}/5</td>
                          <td className="px-3 py-2">{d.responseCode ?? '—'}</td>
                          <td className="px-3 py-2">{d.durationMs != null ? `${d.durationMs}ms` : '—'}</td>
                          <td className="max-w-[220px] truncate px-3 py-2 text-slate-500" title={d.error || d.payloadPreview}>
                            {d.error || d.payloadPreview}
                          </td>
                          <td className="px-3 py-2">
                            {d.status !== 'success' && (
                              <Button variant="outline" onClick={() => retryDelivery(d.id)}>إعادة إرسال</Button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </Table>
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function WebhooksPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <WebhooksContent />
    </Suspense>
  );
}
