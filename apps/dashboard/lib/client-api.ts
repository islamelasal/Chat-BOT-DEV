'use client';

/** إدارة رمز الجلسة في المتصفح — المصدر الوحيد للحقيقة في بيئة المعاينة
 *  (الكعكات قد تُحجب في الإطارات المدمجة، لذلك كل الطلبات تحمل Bearer token) */

const TOKEN_KEY = 'cbd_token';

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* التخزين غير متاح */
  }
}

export function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* تجاهل */
  }
}

export class ClientAuthError extends Error {
  constructor() {
    super('انتهت الجلسة');
  }
}

/** تجديد الجلسة برمز منتهٍ حديثاً (فترة سماح 12 ساعة) — بدون استدعاء apiClient لتجنب التكرار */
export async function refreshSession(): Promise<string | null> {
  const token = getToken();
  if (!token) return null;
  try {
    const res = await fetch('/backend/auth/refresh', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'content-type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });
    if (!res.ok) return null;
    const j = (await res.json().catch(() => null)) as { token?: string } | null;
    if (j?.token) {
      setToken(j.token);
      return j.token;
    }
    return null;
  } catch {
    return null;
  }
}

/** استدعاء للـ API عبر نفس الأصل مع رمز الجلسة + تجديد تلقائي عند انتهائه */
export async function apiClient<T>(
  path: string,
  opts?: RequestInit & { json?: unknown }
): Promise<T> {
  const doFetch = async (): Promise<Response> => {
    const token = getToken();
    return fetch('/backend' + path, {
      method: opts?.method ?? 'GET',
      credentials: 'include',
      headers: {
        'content-type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(opts?.headers ?? {}),
      },
      body: opts?.json !== undefined ? JSON.stringify(opts.json) : opts?.body,
      cache: 'no-store',
    });
  };

  let res = await doFetch();
  if (res.status === 401) {
    // جلسة منتهية → تجديد تلقائي ثم إعادة المحاولة مرة واحدة
    const renewed = await refreshSession();
    if (renewed) {
      res = await doFetch();
    }
  }
  if (res.status === 401) {
    clearToken();
    if (typeof window !== 'undefined') window.location.href = '/login';
    throw new ClientAuthError();
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 160)}`);
  }
  return (await res.json()) as T;
}

import { useCallback, useEffect, useState } from 'react';

export function useApi<T>(path: string): { data: T | null; error: string | null; reload: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    let cancelled = false;
    apiClient<T>(path)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((err) => {
        if (!cancelled) {
          if (err instanceof ClientAuthError) return; // سيُعاد التوجيه
          setError((err as Error).message);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

  useEffect(() => load(), [load]);

  return { data, error, reload: load };
}
