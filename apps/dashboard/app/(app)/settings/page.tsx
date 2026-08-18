import { apiServer } from '@/lib/api';
import { Card, CardHeader } from '@/components/ui';
import TwoFACard from '@/components/twofa-card';

export default async function SettingsPage() {
  const me = await apiServer<any>('/auth/me');

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-extrabold text-slate-900">الإعدادات</h1>
        <p className="mt-1 text-xs text-slate-500">
          الحساب: <span className="font-bold text-slate-700">{me.user.email}</span> · الدور: <span className="font-bold text-slate-700">{me.user.role}</span>
        </p>
      </div>

      <TwoFACard />

      <Card>
        <CardHeader title="معلومات النسخة" subtitle="Chat Bot Dev — منصة إدارة وتوزيع بوتات الذكاء الاصطناعي" />
        <div className="space-y-1 p-5 text-xs text-slate-500">
          <div>الإصدار: v0.2.0 (نواة المنصة)</div>
          <div>المكدس: TypeScript · NestJS · Next.js · PostgreSQL/SQLite · Preact</div>
          <div>العامل الخلفي: نبضات 24/7 + Dead-Man Switch + مصالحات عدادات</div>
        </div>
      </Card>
    </div>
  );
}
