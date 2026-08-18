import Sidebar from '@/components/sidebar';
import AuthRecovery from '@/components/auth-recovery';
import { apiServer, AuthError } from '@/lib/api';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  try {
    // تحقق مبكر من الجلسة
    await apiServer('/auth/me');
  } catch (err) {
    // غير مسجَّل (أو الكعكة ضاعت) → استعادة ذكية بدل حلقة التوجيه
    if (err instanceof AuthError) {
      return <AuthRecovery />;
    }
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-slate-300">
        <div className="max-w-sm text-center">
          <div className="mb-3 text-3xl">⚠️</div>
          <div className="text-sm font-bold">تعذر الوصول لخدمة الـ API</div>
          <p className="mt-2 text-xs leading-relaxed text-slate-500">{(err as Error).message}</p>
          <a
            href="/"
            className="mt-4 inline-block rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white"
          >
            إعادة المحاولة
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="min-w-0 flex-1 p-6 lg:p-8">{children}</main>
    </div>
  );
}
