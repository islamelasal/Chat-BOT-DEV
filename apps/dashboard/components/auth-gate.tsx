'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getToken, clearToken } from '@/lib/client-api';
import '@/lib/fetch-wrapper'; // تثبيت حاقن الرمز قبل أي طلب

/**
 * بوابة الدخول للوحة — تعتمد على الرمز المحفوظ في المتصفح فقط (لا كعكات):
 * - لا رمز → صفحة الدخول
 * - رمز موجود → تُعرض اللوحة فوراً (وتُزامن الكعكة في الخلفية كرفاهية)
 * هذا يلغي نهائياً حلقة "جارٍ استعادة الجلسة".
 */
export default function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.replace('/login');
      return;
    }
    // مزامنة الكعكة في الخلفية (اختيارية — لا ننتظرها ولا نعتمد عليها)
    fetch('/api/auth/cookie-sync', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then((r) => r.json().catch(() => null))
      .then((j) => {
        if (j && j.ok === false) {
          // رمز غير صالح (منتهي/ملغى) — نظّفه وأعد الدخول
          clearToken();
          router.replace('/login');
        }
      })
      .catch(() => {});
    setReady(true);
  }, [router]);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-300">
        <div className="text-center">
          <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
          <div className="text-sm font-bold">جارٍ فتح اللوحة...</div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
