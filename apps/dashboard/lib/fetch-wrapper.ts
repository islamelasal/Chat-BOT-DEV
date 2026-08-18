'use client';

import { getToken } from './client-api';

/**
 * حاقن عالمي للرمز في كل طلبات /backend/*
 * يُثبَّت عند تحميل الوحدة (قبل أي effect) فيضيف Authorization: Bearer
 * تلقائياً لكل fetch قادم من أي مكوّن — فلا يلزم تعديل المكوّنات واحداً واحداً.
 */
if (typeof window !== 'undefined' && !(window as any).__cbdFetchWrapped) {
  (window as any).__cbdFetchWrapped = true;
  const original = window.fetch.bind(window);
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    let url = '';
    if (typeof input === 'string') url = input;
    else if (input instanceof Request) url = input.url;
    else url = String(input);
    if (url.startsWith('/backend') || url.includes('/backend/')) {
      const token = getToken();
      if (token) {
        const headers = new Headers(init?.headers);
        if (!headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);
        return original(input, { ...init, headers });
      }
    }
    return original(input, init);
  }) as typeof window.fetch;
}

export {};
