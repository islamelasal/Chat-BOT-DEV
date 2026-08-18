import Sidebar from '@/components/sidebar';
import AuthGate from '@/components/auth-gate';

/**
 * تخطيط اللوحة — بلا أي تحقق خادمي من الكعكات.
 * البوابة عميلية (AuthGate) وكل الصفحات تجلب بياناتها برمز Bearer من المتصفح،
 * لذا لا توجد أي حلقة دخول ممكنة حتى لو حُجبت الكعكات بالكامل.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <div className="flex min-h-screen">
        <Sidebar />
        <main className="min-w-0 flex-1 p-6 lg:p-8">{children}</main>
      </div>
    </AuthGate>
  );
}
