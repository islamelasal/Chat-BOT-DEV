'use client';

import { useState } from 'react';
import { Button, Card, CardHeader, Field, Input, Select, Textarea } from '@/components/ui';

const DEFAULT_THEME = {
  primary: '#C1272D', secondary: '#F2A93B', background: '#FFFFFF', bubbleText: 'أهلاً! محتاج مساعدة؟',
  headerText: '#FFFFFF', font: 'Cairo', position: 'bottom-left', bubbleStyle: 'pill', windowMode: 'docked',
  welcomeTitle: '', welcomeText: '', suggestions: [], showBrand: true, logoUrl: null, poweredBy: true,
  leadEnabled: true, leadTitle: 'سيب بياناتك وهنتواصل معاك 👋', leadButton: '📞 اطلب التواصل معاك', leadAskPhone: true,
  handoffEnabled: true, handoffTitle: 'محتاج مساعدة من فريقنا؟ 👨‍💼', handoffWhatsapp: '', handoffPhone: '', handoffEmail: '',
  bubbleIcon: 'chat', bubbleIconUrl: '', cursorKey: false,
};

export default function ThemeEditor({ client }: { client: any }) {
  const theme: typeof DEFAULT_THEME = { ...DEFAULT_THEME, ...(client.theme ?? {}) };
  const [form, setForm] = useState<typeof DEFAULT_THEME>(theme);
  const [suggestions, setSuggestions] = useState((theme.suggestions ?? []).join('\n'));
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    setBusy(true);
    setSaved(false);
    try {
      const res = await fetch(`/backend/clients/${client.id}/theme`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...form,
          suggestions: suggestions.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 6),
        }),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader title="ثيم البوت (Theme)" subtitle="معاينة مباشرة في المتجر التجريبي بعد الحفظ" />
      <div className="space-y-4 p-5">
        <div className="grid grid-cols-2 gap-4">
          <Field label="اللون الرئيسي">
            <div className="flex items-center gap-2">
              <input type="color" value={form.primary} onChange={(e) => set('primary', e.target.value)} className="h-9 w-12 cursor-pointer rounded border border-slate-200" />
              <Input dir="ltr" value={form.primary} onChange={(e) => set('primary', e.target.value)} />
            </div>
          </Field>
          <Field label="لون التمييز">
            <div className="flex items-center gap-2">
              <input type="color" value={form.secondary} onChange={(e) => set('secondary', e.target.value)} className="h-9 w-12 cursor-pointer rounded border border-slate-200" />
              <Input dir="ltr" value={form.secondary} onChange={(e) => set('secondary', e.target.value)} />
            </div>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="موضع الفقاعة">
            <Select value={form.position} onChange={(e) => set('position', e.target.value)}>
              <option value="bottom-left">أسفل اليسار</option>
              <option value="bottom-right">أسفل اليمين</option>
            </Select>
          </Field>
          <Field label="شكل الفقاعة">
            <Select value={form.bubbleStyle} onChange={(e) => set('bubbleStyle', e.target.value)}>
              <option value="pill">زر بنص</option>
              <option value="circle">دائرة أيقونة</option>
            </Select>
          </Field>
        </div>
        <Field label="نص الفقاعة">
          <Input value={form.bubbleText} onChange={(e) => set('bubbleText', e.target.value)} />
        </Field>
        <Field label="عنوان نافذة المحادثة">
          <Input value={form.welcomeTitle} onChange={(e) => set('welcomeTitle', e.target.value)} placeholder="مجموعة الشوا التجارية" />
        </Field>
        <Field label="رسالة الترحيب">
          <Textarea rows={2} value={form.welcomeText} onChange={(e) => set('welcomeText', e.target.value)} />
        </Field>
        <Field label="اقتراحات سريعة" hint="سطر لكل اقتراح (حتى 6)">
          <Textarea rows={3} value={suggestions} onChange={(e) => setSuggestions(e.target.value)} placeholder={'سياسة الشحن والاسترجاع\nفروعنا ومواعيد العمل'} />
        </Field>
        {/* إعدادات جمع بيانات العملاء المحتملين */}
        <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="text-xs font-extrabold text-slate-700">📞 جمع بيانات العملاء المحتملين (Lead Capture)</div>
              <div className="text-[10px] text-slate-400">زر داخل المحادثة يجمع الاسم والبريد والتليفون</div>
            </div>
            <button
              type="button"
              onClick={() => set('leadEnabled', !form.leadEnabled)}
              className={`relative h-5 w-9 rounded-full transition ${form.leadEnabled ? 'bg-emerald-500' : 'bg-slate-300'}`}
            >
              <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${form.leadEnabled ? 'right-0.5' : 'right-4'}`} />
            </button>
          </div>
          {form.leadEnabled && (
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="عنوان النموذج"><Input value={form.leadTitle} onChange={(e) => set('leadTitle', e.target.value)} /></Field>
              <Field label="نص الزر"><Input value={form.leadButton} onChange={(e) => set('leadButton', e.target.value)} /></Field>
              <Field label="طلب التليفون">
                <Select value={String(form.leadAskPhone)} onChange={(e) => set('leadAskPhone', e.target.value === 'true')}>
                  <option value="true">نعم</option>
                  <option value="false">لا</option>
                </Select>
              </Field>
            </div>
          )}
        </div>
        {/* إعدادات التحويل لمندوب بشري */}
        <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="text-xs font-extrabold text-slate-700">👨‍💼 التحويل لمندوب بشري (Human Handoff)</div>
              <div className="text-[10px] text-slate-400">روابط واتساب/اتصال/بريد مباشرة داخل المحادثة — وتُحصى في العدادات</div>
            </div>
            <button
              type="button"
              onClick={() => set('handoffEnabled', !form.handoffEnabled)}
              className={`relative h-5 w-9 rounded-full transition ${form.handoffEnabled ? 'bg-emerald-500' : 'bg-slate-300'}`}
            >
              <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${form.handoffEnabled ? 'right-0.5' : 'right-4'}`} />
            </button>
          </div>
          {form.handoffEnabled && (
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="عنوان اللوحة"><Input value={form.handoffTitle} onChange={(e) => set('handoffTitle', e.target.value)} /></Field>
              <Field label="واتساب (دولي بدون +)"><Input dir="ltr" value={form.handoffWhatsapp} onChange={(e) => set('handoffWhatsapp', e.target.value)} placeholder="201153666660" /></Field>
              <Field label="هاتف"><Input dir="ltr" value={form.handoffPhone} onChange={(e) => set('handoffPhone', e.target.value)} placeholder="16959" /></Field>
              <Field label="بريد"><Input dir="ltr" type="email" value={form.handoffEmail} onChange={(e) => set('handoffEmail', e.target.value)} placeholder="info@example.com" /></Field>
            </div>
          )}
        </div>
        {/* أيقونة الفقاعة والمؤشر */}
        <div className="rounded-xl border border-amber-100 bg-amber-50/60 p-4">
          <div className="text-xs font-extrabold text-slate-700">🗝️ أيقونة الفقاعة ومؤشر الفتح</div>
          <div className="text-[10px] text-slate-400">شكل الزر العائم في موقع العميل + مؤشر الماوس عند التحويم (حركة فتح احترافية)</div>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <Field label="الأيقونة">
              <Select value={form.bubbleIcon} onChange={(e) => set('bubbleIcon', e.target.value)}>
                <option value="chat">فقاعة دردشة</option>
                <option value="key">مفتاح ذهبي 🔑</option>
                <option value="custom">صورة مخصصة</option>
              </Select>
            </Field>
            <Field label="مؤشر المفتاح عند التحويم">
              <button
                type="button"
                onClick={() => set('cursorKey', !form.cursorKey)}
                className={`relative mx-auto mt-2 h-5 w-9 rounded-full transition ${form.cursorKey ? 'bg-emerald-500' : 'bg-slate-300'}`}
              >
                <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${form.cursorKey ? 'right-0.5' : 'right-4'}`} />
              </button>
            </Field>
            <Field label="أيقونة العميل المخصصة">
              <div className="flex items-center gap-2">
                <Input dir="ltr" value={form.bubbleIconUrl} onChange={(e) => set('bubbleIconUrl', e.target.value)} placeholder="https://... أو ارفع صورة" />
                <button
                  type="button"
                  className="shrink-0 rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-[11px] font-bold text-slate-600 hover:bg-slate-50"
                  onClick={() => {
                    // رفع صورة → تحسين تلقائي → استخدامها كأيقونة ومؤشر
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = 'image/*';
                    input.onchange = async () => {
                      const file = input.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = () => {
                        const img = new Image();
                        img.onload = async () => {
                          const { enhanceImage } = await import('./brand-editor');
                          const enhanced = enhanceImage(img);
                          set('bubbleIcon', 'custom');
                          set('bubbleIconUrl', enhanced.dataUrl);
                          set('cursorKey', true);
                        };
                        img.src = String(reader.result);
                      };
                      reader.readAsDataURL(file);
                    };
                    input.click();
                  }}
                >
                  📤
                </button>
              </div>
            </Field>
          </div>
          <p className="mt-2 text-[10px] leading-relaxed text-amber-700">
            الرفع يعالج الصورة تلقائياً (إزالة الخلفية + تكبير + توضيح) داخل متصفحك — وتصبح هي المؤشر أيضاً.
            وضع "مفتاح ذهبي" يستخدم الأيقونة المدمجة مع مؤشر ذهبي جاهز.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={save} disabled={busy}>{busy ? 'جارٍ الحفظ...' : 'حفظ الثيم'}</Button>
          {saved && <span className="text-xs font-bold text-emerald-600">✓ تم الحفظ — المعاينة جاهزة</span>}
        </div>
      </div>
    </Card>
  );
}
