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

/** زحف صفحة واحدة وإرجاع شظايا جاهزة للحفظ */
export async function crawlUrl(url: string, timeoutMs = 15000): Promise<CrawlResult> {
  const res = await fetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0 (compatible; ChatBotDevCrawler/1.0)',
      accept: 'text/html,application/xhtml+xml',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs),
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
