'use client';

/** إدارة رمز الجلسة في المتصفح — 4 قنوات متوازية لضمان الوصول في أي بيئة:
 *  1) localStorage (الرئيسي)
 *  2) كعكة JS مقروءة cbd_tk (نجاة حتى لو قُيّد التخزين)
 *  3) رأس Authorization القياسي
 *  4) رأس مخصص x-session-token (ينجو من بروكسيات تشيل Authorization)
 *  5) كعكة httpOnly (يضبطها cookie-sync — تُرسل تلقائياً) */

const TOKEN_KEY = 'cbd_token';
const JS_COOKIE = 'cbd_tk';

function readCookie(name: string): string | null {
  try {
    const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : null;
  } catch {
    return null;
  }
}

export function getToken(): string | null {
  try {
    const ls = localStorage.getItem(TOKEN_KEY);
    if (ls) return ls;
  } catch {
    /* التخزين غير متاح */
  }
  return readCookie(JS_COOKIE);
}

export function setToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* تجاهل */
  }
}

export function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
    document.cookie = JS_COOKIE + '=; Max-Age=0; path=/';
  } catch {
    /* تجاهل */
  }
}

export class ClientAuthError extends Error {
  constructor() {
    super('انتهت الجلسة');
  }
}

/** تجديد الجلسة برمز منتهٍ حديثاً (فترة سماح 12 ساعة) */
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
        'x-session-token': token,
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

/** استدعاء للـ API عبر نفس الأصل — يرسل الرمز بكل القنوات + تجديد تلقائي عند 401 */
export async function apiClient<T>(
  path: string,
  opts?: RequestInit & { json?: unknown }
): Promise<T> {
  const doFetch = async (): Promise<Response> => {
    const token = getToken();
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}`, 'x-session-token': token } : {}),
      ...((opts?.headers as Record<string, string>) ?? {}),
    };
    return fetch('/backend' + path, {
      method: opts?.method ?? 'GET',
      credentials: 'include',
      headers,
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
