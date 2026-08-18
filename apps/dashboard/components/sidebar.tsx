'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  Bot,
  Plug,
  Activity,
  BarChart3,
  MessagesSquare,
  Store,
  LogOut,
  Bot as Logo,
} from 'lucide-react';

const NAV = [
  { href: '/', label: 'نظرة عامة', icon: LayoutDashboard },
  { href: '/clients', label: 'العملاء', icon: Users },
  { href: '/bots', label: 'البوتات', icon: Bot },
  { href: '/providers', label: 'مزودو الـ AI', icon: Plug },
  { href: '/status', label: 'حالة النظام', icon: Activity },
  { href: '/usage', label: 'الاستهلاك والعدادات', icon: BarChart3 },
  { href: '/conversations', label: 'المحادثات', icon: MessagesSquare },
  { href: '/demo-store', label: 'متجر تجريبي (ديمو)', icon: Store },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  const logout = async () => {
    await fetch('/backend/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
    router.push('/login');
  };

  return (
    <aside className="flex w-60 shrink-0 flex-col border-l border-slate-800 bg-slate-900 text-slate-300">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500 text-slate-900">
          <Logo size={20} strokeWidth={2.5} />
        </span>
        <div>
          <div className="text-sm font-extrabold text-white">Chat Bot Dev</div>
          <div className="text-[10px] text-slate-500">منصة إدارة بوتات الذكاء الاصطناعي</div>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 px-3 py-2">
        {NAV.map((item) => {
          const active = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-semibold transition ${
                active ? 'bg-emerald-500/15 text-emerald-400' : 'hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Icon size={16} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-slate-800 p-3">
        <button
          onClick={logout}
          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-semibold text-slate-400 transition hover:bg-slate-800 hover:text-rose-400"
        >
          <LogOut size={16} />
          تسجيل الخروج
        </button>
      </div>
    </aside>
  );
}
