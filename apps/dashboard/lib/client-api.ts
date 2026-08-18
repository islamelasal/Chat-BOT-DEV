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

/** استدعاء للـ API عبر نفس الأصل مع رمز الجلسة — بدون أي اعتماد على الكعكات */
export async function apiClient<T>(
  path: string,
  opts?: RequestInit & { json?: unknown }
): Promise<T> {
  const token = getToken();
  const res = await fetch('/backend' + path, {
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
