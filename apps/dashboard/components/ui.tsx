import type { ReactNode, ButtonHTMLAttributes, InputHTMLAttributes } from 'react';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}>{children}</div>;
}

export function CardHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
      <div>
        <h3 className="text-sm font-bold text-slate-800">{title}</h3>
        {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Stat({ label, value, sub, accent = 'text-slate-900' }: { label: string; value: ReactNode; sub?: string; accent?: string }) {
  return (
    <Card className="p-5">
      <div className="text-xs font-semibold text-slate-500">{label}</div>
      <div className={`mt-2 text-2xl font-extrabold tabular-nums ${accent}`}>{value}</div>
      {sub && <div className="mt-1 text-[11px] text-slate-400">{sub}</div>}
    </Card>
  );
}

export function Badge({ children, tone = 'slate' }: { children: ReactNode; tone?: 'green' | 'red' | 'amber' | 'slate' | 'blue' }) {
  const tones: Record<string, string> = {
    green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    red: 'bg-rose-50 text-rose-700 ring-rose-200',
    amber: 'bg-amber-50 text-amber-700 ring-amber-200',
    blue: 'bg-sky-50 text-sky-700 ring-sky-200',
    slate: 'bg-slate-100 text-slate-600 ring-slate-200',
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold ring-1 ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function Button({ children, variant = 'primary', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' | 'outline' }) {
  const variants: Record<string, string> = {
    primary: 'bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50',
    ghost: 'bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:opacity-50',
    danger: 'bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50',
    outline: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50',
  };
  return (
    <button
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-bold transition ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 ${props.className ?? ''}`}
    />
  );
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 ${props.className ?? ''}`}
    />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-emerald-500 ${props.className ?? ''}`}
    />
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-bold text-slate-600">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-slate-400">{hint}</span>}
    </label>
  );
}

export function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-right text-sm">
        <thead>
          <tr className="border-b border-slate-100 text-[11px] font-bold text-slate-400">
            {head.map((h) => (
              <th key={h} className="px-4 py-2.5">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">{children}</tbody>
      </table>
    </div>
  );
}
