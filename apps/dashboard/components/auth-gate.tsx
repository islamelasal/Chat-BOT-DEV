'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient, clearToken, getToken } from '@/lib/client-api';
import '@/lib/fetch-wrapper'; // تثبيت حاقن الرمز قبل أي طلب

/**
 * بوابة الدخول — تحقق قبل العرض مع تشخيص مرئي:
 * 1) لا رمز → صفحة الدخول.
 * 2) رمز موجود → ضبط الكعكات (SameSite=None على https — تعمل داخل الإطارات)
 *    ثم تحقق عبر القناة الخادمية (الكعكة تنجو من بروكسيات تشيل الرؤوس)
 *    ثم عبر القناة المباشرة (Authorization + x-session-token).
 * 3) فشل حقيقي → شاشة تشخيص برسالة الخطأ الفعلية + أزرار — لا رجوع صامت أبداً.
 */
export default function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<'checking' | 'ready' | 'error'>('checking');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    let cancelled = false;
    const token = getToken();
    if (!token) {
      router.replace('/login');
      return;
    }

    const run = async () => {
      // 1) ضبط الكعكتين (بمهلة أمان 4 ثوانٍ)
      const syncPromise = fetch('/api/auth/cookie-sync', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token }),
      })
        .then((r) => r.json().catch(() => null))
        .catch(() => null);
      await Promise.race([syncPromise, new Promise((r) => setTimeout(r, 4000))]);

      if (cancelled) return;

      // 2) تحقق عبر القناة الخادمية (الكعكة — تنجو من أي بروكسي يشيل الرؤوس)
      let ok = false;
      let via = '';
      try {
        const r = await fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' });
        if (r.ok) {
          ok = true;
          via = 'cookie';
        }
      } catch {
        /* نكمل للقناة التالية */
      }

      // 3) تحقق مباشر (Authorization + x-session-token)
      if (!ok) {
        try {
          await apiClient('/auth/me');
          ok = true;
          via = 'headers';
        } catch {
          /* فشل القناتان */
        }
      }

      if (cancelled) return;
      if (ok) {
        console.log('[auth-gate] دخول ناجح عبر:', via);
        setState('ready');
      } else {
        // فشل حقيقي — اعرض التشخيص بدل الرجوع الصامت
        try {
          const d = await fetch('/api/auth/diag', { cache: 'no-store' }).then((r) => r.json()).catch(() => null);
          setErrorMsg(d?.diag ? JSON.stringify(d.diag) : 'تعذر الوصول لخدمة الـ API');
        } catch {
          setErrorMsg('تعذر الوصول لخدمة الـ API');
        }
        setState('error');
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (state === 'checking') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-300">
        <div className="text-center">
          <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
          <div className="text-sm font-bold">جارٍ التحقق من الجلسة...</div>
        </div>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-slate-300">
        <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 text-center">
          <div className="mb-3 text-3xl">⚠️</div>
          <div className="text-sm font-bold text-white">تعذر التحقق من الجلسة</div>
          <p className="mt-2 text-xs leading-relaxed text-slate-500">تفاصيل التشخيص:</p>
          <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-950 p-3 text-left text-[10px] text-emerald-300" dir="ltr">
            {errorMsg}
          </pre>
          <div className="mt-4 flex justify-center gap-2">
            <button
              onClick={() => {
                clearToken();
                router.replace('/login');
              }}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white"
            >
              تسجيل الدخول من جديد
            </button>
            <button
              onClick={() => {
                setState('checking');
                window.location.reload();
              }}
              className="rounded-lg bg-slate-800 px-4 py-2 text-xs font-bold text-slate-200"
            >
              إعادة المحاولة
            </button>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
