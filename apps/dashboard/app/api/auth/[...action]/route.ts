/**
 * بروكسي مصادقة من نفس أصل اللوحة (Same-Origin Auth Proxy)
 * ──────────────────────────────────────────────────────
 * المشكلة: عندما يمر تسجيل الدخول عبر Rewrite إلى الـ API الداخلي، تُسجَّل
 * الكعكة باسم نطاق داخلي، فيرفض المتصفح تخزينها → حلقة دخول لا تنتهي.
 * الحل: هذا الـ Route Handler يعمل داخل أصل اللوحة نفسه، فيُخزَّن Set-Cookie
 * باسم النطاق الذي يراه المستخدم فعلاً (حتى خلف بروكسي المعاينة).
 */
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const API = process.env.API_INTERNAL_URL || 'http://127.0.0.1:4000';
const COOKIE_NAME = 'cbd_token';
const ALLOWED = new Set(['login', 'logout', 'me', 'refresh', '2fa/verify', 'cookie-sync']);

async function handler(req: NextRequest, ctx: { params: Promise<{ action: string[] }> }) {
  const { action } = await ctx.params;
  const path = action.join('/');
  if (!ALLOWED.has(path)) {
    return NextResponse.json({ message: 'Not found' }, { status: 404 });
  }

  // خطة الطوارئ: مزامنة كعكة من رمز محفوظ محلياً في المتصفح
  if (path === 'cookie-sync' && req.method === 'POST') {
    try {
      const body = (await req.json()) as { token?: string };
      const token = String(body?.token ?? '');
      if (!token || token.length > 2000) {
        return NextResponse.json({ ok: false }, { status: 400 });
      }
      const res = NextResponse.json({ ok: true });
      res.cookies.set(COOKIE_NAME, token, {
        httpOnly: true,
        sameSite: 'lax',
        // خلف بروكسي HTTPS ينتهي فيه TLS: secure:false يضمن العمل في كل الحالات
        secure: false,
        path: '/',
        maxAge: 15 * 60,
      });
      return res;
    } catch {
      return NextResponse.json({ ok: false }, { status: 400 });
    }
  }

  // تمرير الطلب للـ API الداخلي مع إعادة توجيه الكعكات
  let upstream: Response;
  try {
    upstream = await fetch(`${API}/auth/${path}`, {
      method: req.method,
      headers: {
        'content-type': 'application/json',
        cookie: req.headers.get('cookie') ?? '',
        authorization: req.headers.get('authorization') ?? '',
        'x-forwarded-for': req.headers.get('x-forwarded-for') ?? '',
      },
      body: req.method === 'GET' ? undefined : await req.text(),
    });
  } catch {
    return NextResponse.json(
      { message: 'تعذر الوصول لخدمة الـ API — تأكد أنها تعمل' },
      { status: 502 }
    );
  }

  const json = await upstream.json().catch(() => null);
  const response = NextResponse.json(json, { status: upstream.status });
  // إعادة توجيه كعكات الـ API كما هي — ستُرتبط بأصل اللوحة في المتصفح
  for (const cookie of upstream.headers.getSetCookie()) {
    response.headers.append('Set-Cookie', cookie);
  }
  return response;
}

export { handler as GET, handler as POST };
