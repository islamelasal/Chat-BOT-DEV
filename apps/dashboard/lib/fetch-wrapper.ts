'use client';

import { getToken, setToken, clearToken } from './client-api';

/**
 * حاقن عالمي للرمز في كل طلبات /backend/*
 * - يضيف Authorization + x-session-token تلقائياً لكل fetch
 * - عند 401: يجدد الجلسة تلقائياً (فترة سماح 12 ساعة) ويعيد المحاولة مرة واحدة
 * - لو فشل التجديد: يمسح الرمز ويوجه لصفحة الدخول (بدل حلقة 401 لا نهائية)
 */
if (typeof window !== 'undefined' && !(window as any).__cbdFetchWrapped) {
  (window as any).__cbdFetchWrapped = true;
  const original = window.fetch.bind(window);

  const isBackendUrl = (url: string) => url.startsWith('/backend') || url.includes('/backend/');

  const refreshQuietly = async (): Promise<boolean> => {
    const token = getToken();
    if (!token) return false;
    try {
      const res = await original('/backend/auth/refresh', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'content-type': 'application/json',
          Authorization: `Bearer ${token}`,
          'x-session-token': token,
        },
      });
      if (!res.ok) return false;
      const j = (await res.json().catch(() => null)) as { token?: string } | null;
      if (j?.token) {
        setToken(j.token);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
    if (!isBackendUrl(url)) return original(input, init);

    const buildInit = (token: string | null): RequestInit => {
      const headers = new Headers(init?.headers);
      if (token) {
        if (!headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);
        if (!headers.has('x-session-token')) headers.set('x-session-token', token);
      }
      return { ...init, headers };
    };

    let token = getToken();
    let res = await original(input, buildInit(token));
    if (res.status === 401) {
      // جلسة منتهية → تجديد تلقائي + محاولة واحدة
      const renewed = await refreshQuietly();
      if (renewed) {
        token = getToken();
        res = await original(input, buildInit(token));
      }
    }
    if (res.status === 401) {
      clearToken();
      if (window.location.pathname !== '/login') window.location.href = '/login';
    }
    return res;
  }) as typeof window.fetch;
}

export {};
