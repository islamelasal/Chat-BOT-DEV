'use client';

import { useEffect, useState } from 'react';
import { Badge, Button, Card, CardHeader, Field, Input } from '@/components/ui';

/** إعداد وتفعيل المصادقة الثنائية (TOTP — Google Authenticator) */
export default function TwoFACard() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [phase, setPhase] = useState<'idle' | 'setup' | 'disable'>('idle');
  const [secret, setSecret] = useState('');
  const [uri, setUri] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  const load = async () => {
    try {
      const res = await fetch('/backend/auth/2fa/status', { credentials: 'include' });
      if (res.ok) setEnabled((await res.json()).enabled);
    } catch {}
  };

  useEffect(() => {
    void load();
  }, []);

  const startSetup = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/backend/auth/2fa/setup', { method: 'POST', credentials: 'include' });
      if (!res.ok) throw new Error('تعذر بدء الإعداد');
      const data = await res.json();
      setSecret(data.secret);
      setUri(data.uri);
      setCode('');
      setPhase('setup');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/backend/auth/2fa/confirm', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.message ?? 'كود غير صحيح');
      }
      setPhase('idle');
      setSecret('');
      setCode('');
      setNote('✅ تم تفعيل المصادقة الثنائية بنجاح');
      setTimeout(() => setNote(''), 3000);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/backend/auth/2fa/disable', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.message ?? 'كود غير صحيح');
      }
      setPhase('idle');
      setCode('');
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader
        title="المصادقة الثنائية (2FA)"
        subtitle="حماية إضافية بحساب المدير — إلزامية موصى بها لحسابات Super Admin"
        action={enabled != null ? <Badge tone={enabled ? 'green' : 'amber'}>{enabled ? 'مفعّلة' : 'غير مفعّلة'}</Badge> : undefined}
      />
      <div className="space-y-4 p-5">
        {enabled === false && phase === 'idle' && (
          <div>
            <p className="mb-3 text-xs leading-relaxed text-slate-500">
              عند التفعيل: تسجيل الدخول يتطلب كوداً من تطبيق المصادقة (Google Authenticator / Authy / Aegis) إضافةً لكلمة المرور.
            </p>
            <Button onClick={startSetup} disabled={busy}>{busy ? '...' : 'تفعيل المصادقة الثنائية'}</Button>
          </div>
        )}

        {phase === 'setup' && (
          <div className="space-y-4">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <div className="text-xs font-extrabold text-emerald-800">1) أضف الحساب لتطبيق المصادقة</div>
              <p className="mt-1 text-[11px] leading-relaxed text-emerald-700">
                افتح Google Authenticator → + → «إدخال مفتاح الإعداد» والصق السر التالي (أو امسح الـ QR من الرابط):
              </p>
              <div className="mt-3 rounded-lg bg-white p-3 text-center font-mono text-sm font-bold tracking-widest text-slate-800" dir="ltr">
                {secret.match(/.{1,4}/g)?.join(' ') ?? secret}
              </div>
              <input readOnly value={uri} dir="ltr" className="mt-2 w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-[10px] text-slate-500" onFocus={(e) => e.target.select()} />
            </div>
            <div className="space-y-2">
              <div className="text-xs font-extrabold text-slate-700">2) أدخل الكود الظاهر في التطبيق للتأكيد</div>
              <Field label="الكود (6 أرقام)">
                <Input dir="ltr" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} placeholder="000000" className="text-center text-lg font-bold tracking-[0.5em]" />
              </Field>
              <div className="flex items-center gap-2">
                <Button onClick={confirm} disabled={busy || code.length !== 6}>{busy ? 'جارٍ التأكيد...' : 'تأكيد التفعيل'}</Button>
                <Button variant="ghost" onClick={() => { setPhase('idle'); setSecret(''); }}>إلغاء</Button>
              </div>
            </div>
          </div>
        )}

        {enabled === true && phase === 'idle' && (
          <div>
            <p className="mb-3 text-xs text-slate-500">الحساب محمي حالياً — كل تسجيل دخول يتطلب كوداً من تطبيق المصادقة.</p>
            <Button variant="outline" onClick={() => { setPhase('disable'); setCode(''); }}>تعطيل المصادقة الثنائية</Button>
          </div>
        )}

        {phase === 'disable' && (
          <div className="space-y-3">
            <Field label="أدخل الكود الحالي من التطبيق للتأكيد">
              <Input dir="ltr" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} placeholder="000000" className="text-center text-lg font-bold tracking-[0.5em]" />
            </Field>
            <div className="flex items-center gap-2">
              <Button variant="danger" onClick={disable} disabled={busy || code.length !== 6}>{busy ? '...' : 'تعطيل نهائياً'}</Button>
              <Button variant="ghost" onClick={() => setPhase('idle')}>إلغاء</Button>
            </div>
          </div>
        )}

        {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600">⚠️ {error}</div>}
        {note && <div className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">{note}</div>}
      </div>
    </Card>
  );
}
