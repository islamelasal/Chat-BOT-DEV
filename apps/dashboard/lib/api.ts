import { cookies } from 'next/headers';

const API = process.env.API_INTERNAL_URL || 'http://127.0.0.1:4000';

/** خطأ مصادقة — تُلتقط في التخطيطات لاتخاذ مسار الاستعادة بدل حلقة إعادة التوجيه */
export class AuthError extends Error {
  constructor() {
    super('UNAUTHORIZED');
  }
}

/** استدعاء خادمي للـ API مع تمرير الكعكات */
export async function apiServer<T>(
  path: string,
  opts?: RequestInit & { json?: unknown },
  fallback?: T
): Promise<T> {
  const cookieStore = await cookies();
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, {
      method: opts?.method ?? 'GET',
      headers: {
        'content-type': 'application/json',
        cookie: cookieStore.toString(),
        ...(opts?.headers ?? {}),
      },
      body: opts?.json !== undefined ? JSON.stringify(opts.json) : opts?.body,
      cache: 'no-store',
    });
  } catch {
    if (fallback !== undefined) return fallback;
    throw new Error('تعذر الوصول لخدمة الـ API');
  }
  if (res.status === 401) throw new AuthError();
  if (!res.ok) {
    if (fallback !== undefined) return fallback;
    const text = await res.text().catch(() => '');
    throw new Error(`API ${res.status}: ${text.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

/** لاستدعاءات المتصفح (مكونات client) — نفس الأصل عبر البروكسي، الكعكات تلقائية */
export const API_CLIENT = '/backend';
