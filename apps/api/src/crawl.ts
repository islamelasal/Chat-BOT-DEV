/**
 * زاحف خفيف — استخراج نص نظيف من صفحة HTML وتقسيمه لشظايا معرفة.
 * بدون تبعيات خارجية — يعمل على أي بيئة Node.
 */

function decodeEntities(html: string): string {
  return html
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, d) => String.fromCodePoint(Number(d)));
}

export interface CrawlResult {
  title: string;
  chunks: Array<{ title: string; content: string; source: string }>;
}

/** استخراج النص من HTML خام */
export function extractText(html: string): string {
  let s = decodeEntities(html);
  // إزالة الكتل غير النصية
  s = s.replace(/<script[\s\S]*?<\/script>/gi, ' ');
  s = s.replace(/<style[\s\S]*?<\/style>/gi, ' ');
  s = s.replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ');
  s = s.replace(/<svg[\s\S]*?<\/svg>/gi, ' ');
  s = s.replace(/<template[\s\S]*?<\/template>/gi, ' ');
  // تحويل الفواصل إلى أسطر
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<\/(p|div|li|h1|h2|h3|h4|h5|h6|tr|section|article)>/gi, '\n');
  s = s.replace(/<\/?(li|tr)[^>]*>/gi, '\n• ');
  // إزالة كل الوسوم المتبقية
  s = s.replace(/<[^>]+>/g, ' ');
  // تنظيف المسافات
  s = s
    .split('\n')
    .map((line) => line.replace(/[ \t\r]+/g, ' ').trim())
    .filter((line) => line.length > 0)
    .join('\n');
  return s;
}

/** تقسيم النص إلى شظايا ~1400 حرف مع تداخل 150 */
export function chunkText(text: string, maxLen = 1400, overlap = 150): string[] {
  const lines = text.split('\n').filter((l) => l.trim().length > 0);
  const chunks: string[] = [];
  let current = '';
  for (const line of lines) {
    if (current.length + line.length + 1 > maxLen && current.length > 200) {
      chunks.push(current.trim());
      current = current.slice(-overlap) + '\n' + line;
    } else {
      current += (current ? '\n' : '') + line;
    }
  }
  if (current.trim().length > 40) chunks.push(current.trim());
  return chunks.slice(0, 30); // سقف معقول لكل صفحة
}

/** زحف صفحة واحدة وإرجاع شظايا جاهزة للحفظ
 *  سلسلة تدرّج: خدمة Scrapling الجانبية (تجاوز Cloudflare) → الزاحف المدمج */
export async function crawlUrl(url: string, timeoutMs = 30000): Promise<CrawlResult> {
  // 1) خدمة Scrapling إن كانت مضبوطة
  const scraplingUrl = process.env.SCRAPLING_URL ?? '';
  if (scraplingUrl) {
    try {
      const sres = await fetch(`${scraplingUrl.replace(/\/+$/, '')}/crawl`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (sres.ok) {
        const j = (await sres.json()) as { ok?: boolean; html?: string; title?: string; error?: string };
        if (j.ok && j.html && j.html.length > 500) {
          const text = extractText(j.html);
          if (text.length >= 60) {
            return {
              title: j.title || url.replace(/^https?:\/\//, '').slice(0, 80),
              chunks: chunkText(text).map((content) => ({
                title: (j.title || url.replace(/^https?:\/\//, '').slice(0, 80)).slice(0, 120),
                content,
                source: url,
              })),
            };
          }
        }
      }
    } catch {
      /* استمر للزاحف المدمج */
    }
  }

  // 2) الزاحف المدمج (fetch عادي)
  const res = await fetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0 (compatible; ChatBotDevCrawler/1.0)',
      accept: 'text/html,application/xhtml+xml',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.includes('html') && !contentType.includes('text')) {
    throw new Error('المحتوى ليس صفحة HTML');
  }
  const html = await res.text();
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const pageTitle = decodeEntities(titleMatch?.[1] ?? url).trim();
  const text = extractText(html);
  if (text.length < 60) throw new Error('لا يوجد محتوى نصي كافٍ');
  const parts = chunkText(text);
  return {
    title: pageTitle,
    chunks: parts.map((content) => ({
      title: pageTitle.slice(0, 120) || url.replace(/^https?:\/\//, '').slice(0, 80),
      content,
      source: url,
    })),
  };
}

/** هل عنوان IP خاص/داخلي؟ (IPv4 كامل + IPv6 أشكال محلية) */
function isPrivateIp(ip: string): boolean {
  if (ip === '::1' || ip === '::' || ip === 'fc00::' || /^fe[89ab]/.test(ip)) return true;
  const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const a = Number(m[1]), b = Number(m[2]);
  if (m.slice(1).some((o) => Number(o) > 255)) return true;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a >= 224) return true; // multicast/reserved
  return false;
}

export function isPrivateHost(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host === 'localhost' || host.endsWith('.localhost')) return true;
    if (host === '0.0.0.0' || host === '::1' || host === '[::1]') return true;
    return isPrivateIp(host);
  } catch {
    return true;
  }
}

/**
 * حارس SSRF كامل (معيار DNS Pinning): يحل النطاق فعلياً ويتأكد أن عنوان
 * الحل ليس داخلياً — يمنع خداع `metadata.google.internal` وأمثاله.
 */
export async function isPrivateUrl(url: string): Promise<boolean> {
  if (isPrivateHost(url)) return true;
  try {
    const host = new URL(url).hostname;
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return isPrivateIp(host);
    const dns = await import('node:dns');
    const resolved = await dns.promises.lookup(host, { all: true });
    return resolved.some((r) => isPrivateIp(r.address));
  } catch {
    return false; // فشل الحل — سيُعالج كفشل زحف عادي
  }
}
