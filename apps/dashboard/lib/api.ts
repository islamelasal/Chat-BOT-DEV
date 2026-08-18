import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

const API = process.env.API_INTERNAL_URL || 'http://127.0.0.1:4000';

/** استدعاء خادمي للـ API مع تمرير الكعكات — يوجّه لصفحة الدخول عند 401 */
export async function apiServer<T>(path: string, opts?: RequestInit & { json?: unknown }): Promise<T> {
  const cookieStore = await cookies();
  const res = await fetch(`${API}${path}`, {
    method: opts?.method ?? 'GET',
    headers: {
      'content-type': 'application/json',
      cookie: cookieStore.toString(),
      ...(opts?.headers ?? {}),
    },
    body: opts?.json !== undefined ? JSON.stringify(opts.json) : opts?.body,
    cache: 'no-store',
  });
  if (res.status === 401) redirect('/login');
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`API ${res.status}: ${text.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

/** لاستدعاءات المتصفح (مكونات client) — نفس الأصل عبر البروكسي، الكعكات تلقائية */
export const API_CLIENT = '/backend';
