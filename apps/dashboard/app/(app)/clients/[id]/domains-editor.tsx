'use client';

import { useState } from 'react';
import { Badge, Button, Card, CardHeader, Input } from '@/components/ui';

export default function DomainsEditor({ client }: { client: any }) {
  const [domains, setDomains] = useState<string>((client.domains ?? []).join('\n'));
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const save = async () => {
    setBusy(true);
    setSaved(false);
    try {
      const list = domains.split('\n').map((d) => d.trim()).filter(Boolean);
      const res = await fetch(`/backend/clients/${client.id}/domains`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ domains: list }),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader title="النطاقات المسموحة (Allowlist)" subtitle="البوت يرفض العمل على أي نطاق خارج القائمة — الحماية الأولى من سرقة الودجت" />
      <div className="space-y-3 p-5">
        <Input className="min-h-24 font-mono" value={domains} onChange={(e) => setDomains(e.target.value)} placeholder={'elshawwa.com\nwww.elshawwa.com'} />
        <div className="flex items-center gap-3">
          <Button onClick={save} disabled={busy}>{busy ? 'جارٍ الحفظ...' : 'حفظ النطاقات'}</Button>
          {saved && <span className="text-xs font-bold text-emerald-600">✓ تم الحفظ</span>}
        </div>
        <p className="text-[11px] text-slate-400">
          ملاحظة: في وضع الديمو يُقبل أي نطاق مع تسجيل تنبيه — في الإنتاج الرفض صارم.
        </p>
      </div>
    </Card>
  );
}
