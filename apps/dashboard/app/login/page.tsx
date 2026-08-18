'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bot } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('admin@chatbotdev.app');
  const [password, setPassword] = useState('Admin@1234');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
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
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        setError(j?.message ?? 'بيانات الدخول غير صحيحة');
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

        <form onSubmit={submit} className="rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
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
          <p className="mt-4 text-center text-[10px] text-slate-600">
            وضع الديمو: admin@chatbotdev.app / Admin@1234
          </p>
        </form>
      </div>
    </main>
  );
}
