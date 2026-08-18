'use client';

export function PageLoading({ label = 'جارٍ التحميل...' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="text-center">
        <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
        <div className="text-xs font-bold text-slate-400">{label}</div>
      </div>
    </div>
  );
}

export function PageError({ msg }: { msg: string }) {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="max-w-sm text-center">
        <div className="mb-3 text-3xl">⚠️</div>
        <div className="text-sm font-bold text-slate-700">تعذر تحميل البيانات</div>
        <p className="mt-2 text-xs leading-relaxed text-slate-500">{msg}</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-4 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white"
        >
          إعادة المحاولة
        </button>
      </div>
    </div>
  );
}
