import Script from 'next/script';

/** متجر تجريبي يحاكي موقع العميل (الشوا) مع الودجت الفعلي — للمعاينة الحية */
export default function DemoStorePage() {
  return (
    <div className="min-h-screen bg-white" dir="rtl">
      {/* شريط علوي يشبه موقع الشوا */}
      <header className="border-b border-slate-100 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#C1272D] text-sm font-extrabold text-white">الشوا</span>
            <span className="text-lg font-extrabold text-slate-800">مجموعة الشوا التجارية</span>
          </div>
          <nav className="hidden gap-5 text-sm font-semibold text-slate-600 sm:flex">
            <span className="cursor-pointer hover:text-[#C1272D]">المفروشات</span>
            <span className="cursor-pointer hover:text-[#C1272D]">الملابس</span>
            <span className="cursor-pointer hover:text-[#C1272D]">الأدوات المنزلية</span>
            <span className="cursor-pointer font-bold text-[#C1272D]">عروض الصيف 🔥</span>
          </nav>
          <div className="flex items-center gap-2 text-xs font-bold">
            <span className="rounded-lg bg-slate-100 px-3 py-1.5 text-slate-600">الحساب</span>
            <span className="rounded-lg bg-[#C1272D] px-3 py-1.5 text-white">سلّة التسوق (0)</span>
          </div>
        </div>
      </header>

      {/* هيرو */}
      <section className="mx-auto max-w-6xl px-4 pt-6">
        <div className="rounded-2xl bg-gradient-to-l from-[#C1272D] to-[#7A0E14] p-8 text-white sm:p-12">
          <h1 className="text-2xl font-extrabold sm:text-4xl">عروض الصيف 🌞 خصومات حتى 50%</h1>
          <p className="mt-3 max-w-md text-sm text-white/80">
            تشكيلات مختارة من المفروشات والملابس والأدوات المنزلية — لفترة محدودة.
          </p>
          <button className="mt-5 rounded-xl bg-white px-5 py-2.5 text-sm font-extrabold text-[#C1272D]">تسوّق الآن</button>
        </div>
      </section>

      {/* منتجات */}
      <section className="mx-auto max-w-6xl px-4 py-8">
        <h2 className="mb-4 text-lg font-extrabold text-slate-800">منتجات مختارة</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {['طقم سرير قطن ملكي', 'لحاف شتوي دافئ', 'طقم سفرة 24 قطعة', 'طقم عبايات صيفي'].map((p) => (
            <div key={p} className="rounded-xl border border-slate-100 p-4">
              <div className="mb-3 flex h-32 items-center justify-center rounded-lg bg-slate-50 text-4xl">🛏️</div>
              <div className="text-sm font-bold text-slate-800">{p}</div>
              <div className="mt-1 flex items-center gap-2">
                <span className="text-sm font-extrabold text-[#C1272D]">899 ج.م</span>
                <span className="text-xs text-slate-400 line-through">1299 ج.م</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* سياسات — صفحات يظهر فيها سياق مختلف للبوت */}
      <section className="mx-auto max-w-6xl px-4 pb-16">
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            ['🚚', 'الشحن والتوصيل', 'بنوصل لكل المحافظات خلال 2-5 أيام عمل'],
            ['↩️', 'الاسترجاع والاستبدال', 'خلال 14 يوم من الاستلام'],
            ['🛡️', 'الضمان وأقل سعر', 'ضمان معتمد ومطابقة للأسعار'],
          ].map(([icon, title, desc]) => (
            <div key={title} className="rounded-xl border border-slate-100 p-5">
              <div className="text-2xl">{icon}</div>
              <div className="mt-2 text-sm font-extrabold text-slate-800">{title}</div>
              <p className="mt-1 text-xs text-slate-500">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-slate-100 py-6 text-center text-xs text-slate-400">
        صفحة تجريبية لمعاينة بوت العميل — Chat Bot Dev
      </footer>

      {/* ⬇ المقتطف الفعلي الذي يُسلَّم للعميل — يعمل من نفس الأصل عبر البروكسي */}
      <Script src="/w.js?id=clt_elshawwa" strategy="afterInteractive" />
    </div>
  );
}
