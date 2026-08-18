import Sidebar from '@/components/sidebar';
import { apiServer } from '@/lib/api';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // تحقق مبكر من الجلسة — أي 401 يوجّه لصفحة الدخول
  await apiServer('/auth/me');

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="min-w-0 flex-1 p-6 lg:p-8">{children}</main>
    </div>
  );
}
