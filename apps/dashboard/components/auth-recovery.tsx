'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * استعادة الجلسة عند غياب الكعكة (حلقة الدخول):
 * 1) إن وُجد رمز محفوظ في المتصفح → يُعاد ضبطه ككعكة من نفس الأصل ثم إعادة تحميل.
 * 2) لا رمز → التوجيه لصفحة الدخول.
 */
export default function AuthRecovery() {
  const router = useRouter();
  const [msg, setMsg] = useState('جارٍ استعادة الجلسة...');

  useEffect(() => {
    let cancelled = false;
    let token: string | null = null;
    try {
      token = localStorage.getItem('cbd_token');
    } catch {
      token = null;
    }

    if (token) {
      fetch('/api/auth/cookie-sync', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token }),
      })
        .then((r) => {
          if (cancelled) return;
          if (r.ok) {
            // إعادة تحميل كاملة — المكونات الخادمية سترى الكعكة الجديدة
            window.location.reload();
          } else {
            router.replace('/login');
          }
        })
        .catch(() => {
          if (!cancelled) router.replace('/login');
        });
    } else {
      router.replace('/login');
    }

    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-300">
      <div className="text-center">
        <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
        <div className="text-sm font-bold">{msg}</div>
      </div>
    </div>
  );
}
