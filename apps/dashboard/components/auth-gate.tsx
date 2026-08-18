'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient, getToken } from '@/lib/client-api';
import '@/lib/fetch-wrapper'; // تثبيت حاقن الرمز قبل أي طلب

/**
 * بوابة الدخول — تحقق قبل العرض (Validate-Before-Render):
 * - لا رمز → صفحة الدخول فوراً.
 * - رمز موجود → يُتحقق منه أولاً (مع تجديد تلقائي إن كان منتهياً حديثاً)
 *   وبعد النجاح فقط تُعرض اللوحة — فلا وميض قوائم ثم خروج أبداً.
 */
export default function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<'checking' | 'ready'>('checking');

  useEffect(() => {
    let cancelled = false;
    const token = getToken();
    if (!token) {
      router.replace('/login');
      return;
    }
    // تحقق فعلي من الجلسة (apiClient يجدد تلقائياً إن كانت منتهية حديثاً)
    apiClient('/auth/me')
      .then(() => {
        if (!cancelled) setState('ready');
      })
      .catch(() => {
        // فشل حتى بعد التجديد → جلسة منتهية فعلاً
        if (!cancelled) router.replace('/login');
      });
    // مزامنة الكعكة في الخلفية (رفاهية فقط — لا تؤثر على التنقل إطلاقاً)
    fetch('/api/auth/cookie-sync', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token }),
    }).catch(() => {});

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

  return <>{children}</>;
}
