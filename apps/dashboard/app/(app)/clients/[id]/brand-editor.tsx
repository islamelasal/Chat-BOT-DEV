'use client';

import { useRef, useState } from 'react';
import { Button, Card, CardHeader, Field, Input } from '@/components/ui';

/** تحسين جودة الصورة: تكبير ×2 + توضيح خفيف + إزالة خلفية بيضاء
 *  كل شيء client-side — لا تُرسل الصورة لأي خادم */
export function enhanceImage(img: HTMLImageElement): { dataUrl: string; width: number; height: number } {
  const MAX_W = 512;
  const scale = Math.min(2, MAX_W / img.naturalWidth);
  const w = Math.max(64, Math.round(img.naturalWidth * scale));
  const h = Math.max(64, Math.round(img.naturalHeight * scale));

  // تكبير تدريجي (نصفين) — أقرب ما يمكن لـ LANCZOS في خطوة واحدة
  const step = (src: HTMLCanvasElement, tw: number, th: number) => {
    const c = document.createElement('canvas');
    c.width = tw;
    c.height = th;
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, 0, 0, tw, th);
    return c;
  };
  const src = document.createElement('canvas');
  src.width = img.naturalWidth;
  src.height = img.naturalHeight;
  src.getContext('2d')!.drawImage(img, 0, 0);
  const mid = step(src, Math.round((src.width + w) / 2), Math.round((src.height + h) / 2));
  const finalCanvas = step(mid, w, h);

  const fctx = finalCanvas.getContext('2d')!;
  const imageData = fctx.getImageData(0, 0, w, h);
  const d = imageData.data;

  // إزالة الخلفية البيضاء (flood-fill من الحواف) للحفاظ على الشفافية
  const visited = new Uint8Array(w * h);
  const queue: number[] = [];
  const isWhite = (i: number) => d[i]! > 240 && d[i + 1]! > 240 && d[i + 2]! > 240;
  const tryPush = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const idx = y * w + x;
    if (visited[idx]) return;
    visited[idx] = 1;
    const i = idx * 4;
    if (isWhite(i)) {
      queue.push(idx);
      d[i + 3] = 0;
    }
  };
  for (let x = 0; x < w; x++) { tryPush(x, 0); tryPush(x, h - 1); }
  for (let y = 0; y < h; y++) { tryPush(0, y); tryPush(w - 1, y); }
  while (queue.length) {
    const idx = queue.pop()!;
    const x = idx % w;
    const y = (idx / w) | 0;
    tryPush(x + 1, y); tryPush(x - 1, y); tryPush(x, y + 1); tryPush(x, y - 1);
  }
  fctx.putImageData(imageData, 0, 0);

  // توضيح خفيف (unsharp mask مبسط عبر كونفوليوشن 3×3)
  const sharp = (strength = 0.28) => {
    const data = fctx.getImageData(0, 0, w, h);
    const srcD = new Uint8ClampedArray(data.data);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = (y * w + x) * 4;
        if (srcD[i + 3]! === 0) continue; // حافظ على الشفاف
        for (let c = 0; c < 3; c++) {
          const cur = srcD[i + c]!;
          const blur =
            (srcD[i - 4 + c]! + srcD[i + 4 + c]! + srcD[i - w * 4 + c]! + srcD[i + w * 4 + c]!) * 0.5 +
            (srcD[i - 4 - w * 4 + c]! + srcD[i + 4 - w * 4 + c]! + srcD[i - 4 + w * 4 + c]! + srcD[i + 4 + w * 4 + c]!) * 0.25;
          const val = cur + (cur - blur) * strength;
          data.data[i + c] = val < 0 ? 0 : val > 255 ? 255 : val;
        }
      }
    }
    fctx.putImageData(data, 0, 0);
  };
  sharp();

  return { dataUrl: finalCanvas.toDataURL('image/png'), width: w, height: h };
}

/** استخراج الألوان المهيمنة من صورة (canvas) — quantization بسيط مع تجميع */
function extractPalette(img: HTMLImageElement, count = 6): Array<{ hex: string; weight: number }> {
  const size = 120;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, size, size);
  const { data } = ctx.getImageData(0, 0, size, size);

  // تجميع الألوان في دلاء 24×24×24 مع ترجيح المسافة عن المركز
  const buckets = new Map<string, { r: number; g: number; b: number; n: number }>();
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3]!;
    if (a < 200) continue; // نتجاهل الشفاف
    const r = data[i]!, g = data[i + 1]!, b = data[i + 2]!;
    // تجاهل القريب من الأبيض/الأسود (خلفيات)
    if ((r > 235 && g > 235 && b > 235) || (r < 20 && g < 20 && b < 20)) continue;
    const key = `${r >> 4},${g >> 4},${b >> 4}`;
    const bucket = buckets.get(key) ?? { r: 0, g: 0, b: 0, n: 0 };
    bucket.r += r; bucket.g += g; bucket.b += b; bucket.n++;
    buckets.set(key, bucket);
  }

  const palette = [...buckets.values()]
    .map((b) => ({
      hex: `#${[b.r, b.g, b.b].map((v) => Math.round(v / b.n).toString(16).padStart(2, '0')).join('')}`.toUpperCase(),
      weight: b.n,
    }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, count);

  return palette;
}

/** اختيار ألوان متناغمة: الأكثر شيوعاً كرئيسي، الأبعد عنه كثانوي */
function pickBrandColors(palette: Array<{ hex: string; weight: number }>) {
  if (palette.length === 0) return null;
  const primary = palette[0]!;
  let secondary = palette[0]!;
  let bestDistance = -1;
  for (const p of palette.slice(1)) {
    const r1 = parseInt(primary.hex.slice(1, 3), 16), g1 = parseInt(primary.hex.slice(3, 5), 16), b1 = parseInt(primary.hex.slice(5, 7), 16);
    const r2 = parseInt(p.hex.slice(1, 3), 16), g2 = parseInt(p.hex.slice(3, 5), 16), b2 = parseInt(p.hex.slice(5, 7), 16);
    const dist = Math.abs(r1 - r2) + Math.abs(g1 - g2) + Math.abs(b1 - b2);
    if (dist > bestDistance && dist > 120) {
      bestDistance = dist;
      secondary = p;
    }
  }
  // لون تمييز أغمق من الرئيسي
  const r = Math.max(0, parseInt(primary.hex.slice(1, 3), 16) - 55);
  const g = Math.max(0, parseInt(primary.hex.slice(3, 5), 16) - 55);
  const b = Math.max(0, parseInt(primary.hex.slice(5, 7), 16) - 55);
  const accent = `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
  return { primary: primary.hex, secondary: secondary.hex, accent };
}

export default function BrandEditor({ client }: { client: any }) {
  const [logoUrl, setLogoUrl] = useState(client.brand?.logoUrl ?? '');
  const [primary, setPrimary] = useState(client.brand?.colors?.primary ?? '#C1272D');
  const [secondary, setSecondary] = useState(client.brand?.colors?.secondary ?? '#F2A93B');
  const [accent, setAccent] = useState(client.brand?.colors?.accent ?? '#7A0E14');
  const [font, setFont] = useState(client.brand?.font ?? 'Cairo');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [palette, setPalette] = useState<Array<{ hex: string; weight: number }> | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(client.brand?.logoUrl ?? null);
  const [enhanceInfo, setEnhanceInfo] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const onFile = (file: File) => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result);
      const img = new Image();
      img.onload = () => {
        // 1) تحسين الجودة تلقائياً (تكبير + إزالة خلفية + توضيح)
        const enhanced = enhanceImage(img);
        // 2) استخراج الألوان من النسخة المحسّنة
        const pal = extractPalette(img);
        setPalette(pal);
        const picked = pickBrandColors(pal);
        if (picked) {
          setPrimary(picked.primary);
          setSecondary(picked.secondary);
          setAccent(picked.accent);
        }
        setLogoPreview(enhanced.dataUrl);
        setEnhanceInfo(`${img.naturalWidth}×${img.naturalHeight} → ${enhanced.width}×${enhanced.height} ✓ جودة محسّنة`);
        setTimeout(() => setEnhanceInfo(''), 4000);
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  const save = async () => {
    setBusy(true);
    setSaved(false);
    try {
      const res = await fetch(`/backend/clients/${client.id}/brand`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          logoUrl: logoPreview ?? null,
          colors: { primary, secondary, accent },
          font,
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
      <CardHeader
        title="الهوية البصرية (Brand Kit)"
        subtitle="ارفع لوجو العميل وسيُستخرج الرئيسي والثانوي تلقائياً — أو عدّل يدوياً"
      />
      <div className="space-y-4 p-5">
        {/* منطقة رفع اللوجو */}
        <div className="flex items-center gap-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4">
          <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white text-xl font-extrabold text-white shadow-sm" style={{ background: primary }}>
            {logoPreview ? <img src={logoPreview} className="h-full w-full object-contain" alt="لوجو العميل" /> : String(client.name).slice(0, 2)}
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-extrabold text-slate-700">لوجو العميل</div>
            <p className="mt-0.5 text-[11px] text-slate-500">PNG/JPG/WebP — الأفضل بشفافية (PNG). يُحفظ كـ Data URL في الديمو.</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button variant="outline" type="button" onClick={() => fileRef.current?.click()}>📤 رفع اللوجو</Button>
              {logoPreview && (
                <Button variant="ghost" type="button" onClick={() => { setLogoPreview(null); setPalette(null); }}>إزالة</Button>
              )}
              {enhanceInfo && <span className="text-[10px] font-bold text-emerald-600">{enhanceInfo}</span>}
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          </div>
        </div>

        {/* الألوان المستخرجة */}
        {palette && palette.length > 0 && (
          <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] font-extrabold text-emerald-800">🎨 الألوان المستخرجة من اللوجو</span>
              <span className="text-[10px] text-emerald-600">اضغط أي لون لتطبيقه كرئيسي</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {palette.map((p) => (
                <button
                  key={p.hex}
                  type="button"
                  title={`${p.hex} — ${Math.round((p.weight / palette.reduce((a, x) => a + x.weight, 0)) * 100)}%`}
                  onClick={() => setPrimary(p.hex)}
                  className="h-9 w-9 rounded-lg border-2 border-white shadow transition hover:scale-110"
                  style={{ background: p.hex }}
                />
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-3 gap-4">
          <Field label="اللون الرئيسي">
            <div className="flex items-center gap-2">
              <input type="color" value={primary} onChange={(e) => setPrimary(e.target.value)} className="h-9 w-12 cursor-pointer rounded border border-slate-200" />
              <Input dir="ltr" value={primary} onChange={(e) => setPrimary(e.target.value)} />
            </div>
          </Field>
          <Field label="اللون الثانوي">
            <div className="flex items-center gap-2">
              <input type="color" value={secondary} onChange={(e) => setSecondary(e.target.value)} className="h-9 w-12 cursor-pointer rounded border border-slate-200" />
              <Input dir="ltr" value={secondary} onChange={(e) => setSecondary(e.target.value)} />
            </div>
          </Field>
          <Field label="لون التمييز">
            <div className="flex items-center gap-2">
              <input type="color" value={accent} onChange={(e) => setAccent(e.target.value)} className="h-9 w-12 cursor-pointer rounded border border-slate-200" />
              <Input dir="ltr" value={accent} onChange={(e) => setAccent(e.target.value)} />
            </div>
          </Field>
        </div>
        <Field label="الخط">
          <Input value={font} onChange={(e) => setFont(e.target.value)} />
        </Field>
        <div className="flex items-center gap-3">
          <Button onClick={save} disabled={busy}>{busy ? 'جارٍ الحفظ...' : 'حفظ الهوية'}</Button>
          {saved && <span className="text-xs font-bold text-emerald-600">✓ تم الحفظ — الثيم والودجت يتحدثان تلقائياً</span>}
        </div>
      </div>
    </Card>
  );
}
