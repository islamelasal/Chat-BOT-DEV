'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { apiClient } from '@/lib/client-api';
import { Badge, Button, Card, CardHeader, Input, Table } from '@/components/ui';
import { PageError, PageLoading } from '@/components/page-state';

interface CatalogRow {
  clientId: string;
  clientName: string;
  sourceUrl: string;
  syncStatus: string;
  itemsTotal: number;
  lastSuccessAt: number | null;
  lastError: string;
}

interface ProductRow {
  id: string;
  name: string;
  category: string;
  brand: string;
  price: number;
  oldPrice: number | null;
  currency: string;
  inStock: boolean;
  imageUrl: string;
  productUrl: string;
}

function CatalogContent() {
  const searchParams = useSearchParams();
  const clientId = searchParams.get('clientId') ?? '';
  const [catalogs, setCatalogs] = useState<CatalogRow[] | null>(null);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [q, setQ] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState('');
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const selected = clientId || (catalogs && catalogs[0]?.clientId) || '';

  useEffect(() => {
    apiClient<CatalogRow[]>('/catalog').then(setCatalogs).catch((e) => setError((e as Error).message));
  }, []);

  useEffect(() => {
    if (!selected) return;
    Promise.all([
      apiClient<ProductRow[]>(`/catalog/${selected}/products?limit=100`),
      apiClient<any>(`/catalog/${selected}/stats`),
    ])
      .then(([p, s]) => {
        setProducts(p);
        setStats(s);
      })
      .catch(() => {});
  }, [selected]);

  const search = () => {
    if (!selected) return;
    apiClient<ProductRow[]>(`/catalog/${selected}/products?limit=100&q=${encodeURIComponent(q)}`)
      .then(setProducts)
      .catch(() => {});
  };

  const sync = async () => {
    if (!selected) return;
    setSyncing(true);
    setSyncMsg('');
    try {
      const res = await apiClient<any>(`/catalog/${selected}/sync`, { method: 'POST', json: {} });
      setSyncMsg(
        res.ok
          ? `✅ مزامنة ناجحة: ${res.total} منتج — ${res.inserted} جديد · ${res.updated} محدَّث · ${res.unchanged} بلا تغيير (${res.durationMs}ms)`
          : `⚠️ ${res.error ?? 'فشلت المزامنة'}`
      );
      // تحديث الشاشة
      const [p, s] = await Promise.all([
        apiClient<ProductRow[]>(`/catalog/${selected}/products?limit=100`),
        apiClient<any>(`/catalog/${selected}/stats`),
      ]);
      setProducts(p);
      setStats(s);
      apiClient<CatalogRow[]>('/catalog').then(setCatalogs).catch(() => {});
    } catch (err) {
      setSyncMsg(`⚠️ ${(err as Error).message}`);
    } finally {
      setSyncing(false);
    }
  };

  if (error) return <PageError msg={error} />;
  if (!catalogs) return <PageLoading label="جارٍ تحميل الكتالوج..." />;

  const current = catalogs.find((c) => c.clientId === selected);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900">كتالوج المنتجات (الفيد الحي)</h1>
          <p className="mt-1 text-xs text-slate-500">
            مزامنة تلقائية كل 6 ساعات: نفس المنتج يُحدَّث — الجديد يُدرج — وتغييرات الأسعار/المخزون تُسجَّل
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700"
            value={selected}
            onChange={(e) => {
              const url = new URL(window.location.href);
              url.searchParams.set('clientId', e.target.value);
              window.location.href = url.toString();
            }}
          >
            {catalogs.map((c) => (
              <option key={c.clientId} value={c.clientId}>{c.clientName}</option>
            ))}
          </select>
          <Button onClick={sync} disabled={syncing || uploading}>{syncing ? 'جارٍ المزامنة...' : '🔄 مزامنة الآن'}</Button>
          <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={syncing || uploading}>
            {uploading ? 'جارٍ الرفع...' : '📤 رفع فيد من الجهاز'}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.xml,.json,.txt,.rss"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file || !selected) return;
              if (file.size > 8 * 1024 * 1024) {
                setUploadMsg('⚠️ حجم الملف يتجاوز 8 ميجابايت');
                return;
              }
              setUploading(true);
              setUploadMsg('');
              setSyncMsg('');
              try {
                const text = await file.text();
                const res = await apiClient<any>(`/catalog/${selected}/upload`, { method: 'POST', json: { feed: text } });
                setUploadMsg(
                  res.ok
                    ? `✅ رُفع الفيد وحُلل: ${res.total} منتج — ${res.inserted} جديد · ${res.updated} محدَّث · ${res.unchanged} بلا تغيير`
                    : `⚠️ ${res.error ?? 'فشل تحليل الفيد'}`
                );
                // تحديث الشاشة
                const [p2, s2] = await Promise.all([
                  apiClient<ProductRow[]>(`/catalog/${selected}/products?limit=100`),
                  apiClient<any>(`/catalog/${selected}/stats`),
                ]);
                setProducts(p2);
                setStats(s2);
                apiClient<CatalogRow[]>('/catalog').then(setCatalogs).catch(() => {});
              } catch (err) {
                setUploadMsg(`⚠️ ${(err as Error).message}`);
              } finally {
                setUploading(false);
                if (fileRef.current) fileRef.current.value = '';
              }
            }}
          />
        </div>
      </div>

      {syncMsg && (
        <div className={`rounded-xl px-4 py-3 text-xs font-bold ${syncMsg.startsWith('✅') ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-600'}`}>
          {syncMsg}
        </div>
      )}
      {uploadMsg && (
        <div className={`rounded-xl px-4 py-3 text-xs font-bold ${uploadMsg.startsWith('✅') ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-600'}`}>
          {uploadMsg}
        </div>
      )}

      {stats && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          <Card className="p-4"><div className="text-[11px] font-bold text-slate-400">إجمالي المنتجات</div><div className="mt-1 text-2xl font-extrabold text-emerald-600">{stats.totals.products.toLocaleString('ar-EG')}</div></Card>
          <Card className="p-4"><div className="text-[11px] font-bold text-slate-400">متوفر الآن</div><div className="mt-1 text-2xl font-extrabold">{stats.totals.inStock.toLocaleString('ar-EG')}</div></Card>
          <Card className="p-4"><div className="text-[11px] font-bold text-slate-400">نطاق الأسعار</div><div className="mt-1 text-lg font-extrabold">{stats.totals.minPrice} – {stats.totals.maxPrice} ج.م</div></Card>
          <Card className="p-4">
            <div className="text-[11px] font-bold text-slate-400">حالة المزامنة</div>
            <div className="mt-1">
              <Badge tone={stats.catalog?.syncStatus === 'ok' ? 'green' : stats.catalog?.syncStatus === 'error' ? 'red' : 'amber'}>
                {stats.catalog?.syncStatus === 'ok' ? 'محدث ✓' : stats.catalog?.syncStatus === 'simulated' ? 'محاكاة (أرقام تقريبية)' : stats.catalog?.syncStatus === 'error' ? 'فشلت' : stats.catalog?.syncStatus ?? '—'}
              </Badge>
            </div>
            {stats.catalog?.lastSuccessAt && (
              <div className="mt-1 text-[10px] text-slate-400">{new Date(stats.catalog.lastSuccessAt).toLocaleString('ar-EG')}</div>
            )}
          </Card>
          <Card className="p-4">
            <div className="text-[11px] font-bold text-slate-400">مصدر الفيد</div>
            <div className="mt-1 truncate text-[10px] text-slate-500" dir="ltr" title={current?.sourceUrl}>{current?.sourceUrl ?? '—'}</div>
          </Card>
        </div>
      )}

      {stats?.catalog?.lastError && (
        <div className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-xs text-rose-600">
          آخر خطأ مزامنة: {stats.catalog.lastError}
          <span className="mr-2 text-rose-400">(المزامنة التلقائية ستعيد المحاولة — أو جرب زر المزامنة الآن)</span>
        </div>
      )}

      <Card>
        <CardHeader
          title="المنتجات"
          subtitle={`${products.length} منتج معروض`}
          action={
            <div className="flex gap-2">
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث بالاسم أو القسم..." className="w-48" />
              <Button variant="outline" onClick={search}>بحث</Button>
            </div>
          }
        />
        <Table head={['المنتج', 'القسم', 'السعر', 'التخفيض', 'الحالة', 'الرابط']}>
          {products.length === 0 && (
            <tr><td colSpan={6} className="px-4 py-10 text-center text-xs text-slate-400">
              {current?.syncStatus === 'ok' ? 'لا منتجات مطابقة — جرّب بحثاً آخر' : 'لم تُزامن بعد — اضغط «مزامنة الآن»'}
            </td></tr>
          )}
          {products.map((p) => (
            <tr key={p.id} className="transition hover:bg-slate-50">
              <td className="px-4 py-3">
                <div className="flex items-center gap-2.5">
                  {p.imageUrl ? (
                    <img src={p.imageUrl} alt="" className="h-8 w-8 rounded object-cover" loading="lazy" referrerPolicy="no-referrer" />
                  ) : (
                    <span className="flex h-8 w-8 items-center justify-center rounded bg-slate-100 text-[10px]">🛍️</span>
                  )}
                  <span className="text-xs font-bold text-slate-800">{p.name}</span>
                </div>
              </td>
              <td className="px-4 py-3 text-xs text-slate-500">{p.category || '—'}</td>
              <td className="px-4 py-3 text-xs font-extrabold text-emerald-700">{p.price} {p.currency}</td>
              <td className="px-4 py-3 text-xs text-slate-400">{p.oldPrice ? `${p.oldPrice} ${p.currency}` : '—'}</td>
              <td className="px-4 py-3"><Badge tone={p.inStock ? 'green' : 'red'}>{p.inStock ? 'متوفر' : 'نفد'}</Badge></td>
              <td className="px-4 py-3">
                {p.productUrl ? (
                  <a href={p.productUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] font-bold text-emerald-600 hover:underline" dir="ltr">
                    ↗ عرض
                  </a>
                ) : '—'}
              </td>
            </tr>
          ))}
        </Table>
      </Card>

      <Card>
        <CardHeader title="آخر التغييرات المسجلة" subtitle="سجل تلقائي: منتجات جديدة / تحديثات / تغييرات أسعار ومخزون" />
        <div className="divide-y divide-slate-50">
          {stats?.recentChanges?.length === 0 && <div className="px-5 py-6 text-center text-xs text-slate-400">لا تغييرات بعد</div>}
          {(stats?.recentChanges ?? []).map((ch: any) => (
            <div key={ch.id} className="flex items-center gap-3 px-5 py-2.5">
              <Badge tone={ch.type === 'new' ? 'green' : ch.type === 'price_changed' ? 'amber' : ch.type === 'stock_changed' ? 'red' : 'blue'}>
                {ch.type === 'new' ? 'جديد' : ch.type === 'price_changed' ? 'تغيير سعر' : ch.type === 'stock_changed' ? 'مخزون' : 'تحديث'}
              </Badge>
              <span className="flex-1 truncate text-xs text-slate-600">{ch.details}</span>
              <span className="text-[10px] text-slate-400">{new Date(ch.at).toLocaleString('ar-EG')}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

export default function CatalogPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <CatalogContent />
    </Suspense>
  );
}
