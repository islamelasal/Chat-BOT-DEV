'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bot, ShieldCheck } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('admin@chatbotdev.app');
  const [password, setPassword] = useState('Admin@1234');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // خطوة المصادقة الثنائية
  const [totpTempToken, setTotpTempToken] = useState('');
  const [totpCode, setTotpCode] = useState('');

  const submitLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/backend/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) {
        setError(j?.message ?? 'بيانات الدخول غير صحيحة');
        return;
      }
      if (j?.totpRequired) {
        setTotpTempToken(j.tempToken); // ننتقل لخطوة الكود
        return;
      }
      router.push('/');
      router.refresh();
    } catch {
      setError('تعذر الاتصال بالخادم');
    } finally {
      setBusy(false);
    }
  };

  const submitTotp = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/backend/auth/2fa/verify', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tempToken: totpTempToken, code: totpCode }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        setError(j?.message ?? 'كود غير صحيح');
        return;
      }
      router.push('/');
      router.refresh();
    } catch {
      setError('تعذر الاتصال بالخادم');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center justify-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500 text-slate-900">
            <Bot size={26} strokeWidth={2.5} />
          </span>
          <div>
            <h1 className="text-lg font-extrabold text-white">Chat Bot Dev</h1>
            <p className="text-[11px] text-slate-500">منصة إدارة وتوزيع بوتات الذكاء الاصطناعي</p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
          {!totpTempToken ? (
            <form onSubmit={submitLogin}>
              <label className="mb-4 block">
                <span className="mb-1.5 block text-xs font-bold text-slate-400">البريد الإلكتروني</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-500"
                  required
                />
              </label>
              <label className="mb-5 block">
                <span className="mb-1.5 block text-xs font-bold text-slate-400">كلمة المرور</span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-500"
                  required
                />
              </label>
              {error && <div className="mb-4 rounded-lg bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-400">⚠️ {error}</div>}
              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-lg bg-emerald-500 py-2.5 text-sm font-extrabold text-slate-900 transition hover:bg-emerald-400 disabled:opacity-50"
              >
                {busy ? 'جارٍ الدخول...' : 'تسجيل الدخول'}
              </button>
            </form>
          ) : (
            <form onSubmit={submitTotp}>
              <div className="mb-5 flex items-center gap-2.5">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400">
                  <ShieldCheck size={20} />
                </span>
                <div>
                  <div className="text-sm font-extrabold text-white">التحقق بخطوتين</div>
                  <div className="text-[11px] text-slate-500">أدخل الكود من تطبيق المصادقة</div>
                </div>
              </div>
              <label className="mb-5 block">
                <span className="mb-1.5 block text-xs font-bold text-slate-400">الكود (6 أرقام)</span>
                <input
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-3 text-center text-xl font-bold tracking-[0.5em] text-white outline-none focus:border-emerald-500"
                  required
                  autoFocus
                />
              </label>
              {error && <div className="mb-4 rounded-lg bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-400">⚠️ {error}</div>}
              <button
                type="submit"
                disabled={busy || totpCode.length !== 6}
                className="w-full rounded-lg bg-emerald-500 py-2.5 text-sm font-extrabold text-slate-900 transition hover:bg-emerald-400 disabled:opacity-50"
              >
                {busy ? 'جارٍ التحقق...' : 'تحقق ودخول'}
              </button>
              <button
                type="button"
                onClick={() => { setTotpTempToken(''); setTotpCode(''); setError(''); }}
                className="mt-3 w-full text-center text-[11px] font-semibold text-slate-500 hover:text-slate-300"
              >
                ← العودة لتسجيل الدخول
              </button>
            </form>
          )}
          {!totpTempToken && (
            <p className="mt-4 text-center text-[10px] text-slate-600">
              وضع الديمو: admin@chatbotdev.app / Admin@1234
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
