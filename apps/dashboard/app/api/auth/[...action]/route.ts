/**
 * بروكسي مصادقة من نفس أصل اللوحة (Same-Origin Auth Proxy)
 * ──────────────────────────────────────────────────────
 * المشكلة الجذرية: في بيئة المعاينة المدمجة (iframe + بروكسي) تُحجب
 * كعكات SameSite=Lax ويُشال أحياناً رأس Authorization من البروكسي.
 * الحل هنا:
 *  - الكعكات تُضبط بـ SameSite=None; Secure على https (تعمل داخل الإطارات)
 *  - كعكة مزدوجة: httpOnly (للخادم) + cbd_tk مقروءة JS (خطة طوارئ)
 *  - رأس مخصص x-session-token يمر مع كل الطلبات
 *  - نقطة /diag تعرض ما وصل فعلاً (تشخيص فوري بدل التخمين)
 */
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const API = process.env.API_INTERNAL_URL || 'http://127.0.0.1:4000';
const COOKIE_NAME = 'cbd_token';
const JS_COOKIE = 'cbd_tk';
const ALLOWED = new Set(['login', 'logout', 'me', 'refresh', '2fa/verify', 'cookie-sync', 'diag']);

function isHttps(req: NextRequest): boolean {
  const proto = req.headers.get('x-forwarded-proto');
  if (proto) return proto.split(',')[0]!.trim() === 'https';
  return req.nextUrl.protocol === 'https:';
}

/** ضبط الكعكتين (httpOnly + JS) بالسمات الصحيحة للبيئة */
function setAuthCookies(res: NextResponse, token: string, https: boolean) {
  const sameSite = https ? 'none' : 'lax';
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite,
    secure: https,
    path: '/',
    maxAge: 15 * 60,
  });
  res.cookies.set(JS_COOKIE, token, {
    httpOnly: false,
    sameSite,
    secure: https,
    path: '/',
    maxAge: 15 * 60,
  });
}

function clearAuthCookies(res: NextResponse) {
  res.cookies.set(COOKIE_NAME, '', { maxAge: 0, path: '/' });
  res.cookies.set(JS_COOKIE, '', { maxAge: 0, path: '/' });
}

async function handler(req: NextRequest, ctx: { params: Promise<{ action: string[] }> }) {
  const { action } = await ctx.params;
  const path = action.join('/');
  if (!ALLOWED.has(path)) {
    return NextResponse.json({ message: 'Not found' }, { status: 404 });
  }

  const https = isHttps(req);

  // ── تشخيص: يعرض ما يصل من المتصفح فعلاً (ويُسجَّل في سجلات الخادم) ──
  if (path === 'diag' && req.method === 'GET') {
    const diag = {
      proto: https ? 'https' : 'http',
      cookieHeader: Boolean(req.headers.get('cookie')),
      bearerHeader: Boolean(req.headers.get('authorization')),
      xtHeader: Boolean(req.headers.get('x-session-token')),
      apiReachable: false,
      apiStatus: 0,
    };
    try {
      const token = getTokenFromRequest(req);
      const check = await fetch(`${API}/auth/me`, {
        headers: {
          cookie: req.headers.get('cookie') ?? '',
          ...(token ? { authorization: `Bearer ${token}`, 'x-session-token': token } : {}),
        },
        signal: AbortSignal.timeout(6000),
      });
      diag.apiStatus = check.status;
      diag.apiReachable = true;
    } catch {
      /* غير متاحة */
    }
    console.log('[auth-diag]', JSON.stringify(diag));
    return NextResponse.json({ ok: true, diag });
  }

  // ── مزامنة كعكة من رمز محفوظ محلياً — مع تحقق فعلي من الصلاحية ──
  if (path === 'cookie-sync' && req.method === 'POST') {
    try {
      const body = (await req.json()) as { token?: string };
      const token = String(body?.token ?? '');
      if (!token || token.length > 2000) {
        return NextResponse.json({ ok: false }, { status: 400 });
      }
      let valid = false;
      try {
        const check = await fetch(`${API}/auth/me`, {
          headers: { authorization: `Bearer ${token}`, 'x-session-token': token },
          signal: AbortSignal.timeout(6000),
        });
        valid = check.ok;
      } catch {
        valid = false;
      }
      const res = NextResponse.json({ ok: valid, https });
      if (valid) {
        setAuthCookies(res, token, https);
      } else {
        clearAuthCookies(res); // رمز منتهٍ/غير صالح — امسح أي كعكة قديمة
      }
      return res;
    } catch {
      return NextResponse.json({ ok: false }, { status: 400 });
    }
  }

  // ── تمرير الطلب للـ API الداخلي ──
  let upstream: Response;
  try {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      cookie: req.headers.get('cookie') ?? '',
      'x-forwarded-for': req.headers.get('x-forwarded-for') ?? '',
    };
    const auth = req.headers.get('authorization');
    const xt = req.headers.get('x-session-token');
    if (auth) headers.authorization = auth;
    if (xt) headers['x-session-token'] = xt;
    upstream = await fetch(`${API}/auth/${path}`, {
      method: req.method,
      headers,
      body: req.method === 'GET' ? undefined : await req.text(),
    });
  } catch {
    console.log('[auth-proxy] API unreachable:', path);
    return NextResponse.json({ message: 'تعذر الوصول لخدمة الـ API — تأكد أنها تعمل' }, { status: 502 });
  }

  const json = await upstream.json().catch(() => null);
  console.log(
    '[auth-proxy]',
    path,
    'status=' + upstream.status,
    'cookie?=' + Boolean(req.headers.get('cookie')),
    'bearer?=' + Boolean(req.headers.get('authorization')),
    'xt?=' + Boolean(req.headers.get('x-session-token'))
  );

  const response = NextResponse.json(json, { status: upstream.status });

  // تعطيل: امسح الكعكتين
  if (path === 'logout') {
    clearAuthCookies(response);
    return response;
  }

  // نجاح الدخول/التجديد/التحقق → اضبط الكعكتين من الرمز الصادر (بسمات بيئة صحيحة)
  if ((path === 'login' || path === 'refresh' || path === '2fa/verify') && json?.token) {
    setAuthCookies(response, json.token, https);
  }

  return response;
}

/** استخراج الرمز من أي قناة في الطلب الوارد */
function getTokenFromRequest(req: NextRequest): string | null {
  const auth = req.headers.get('authorization');
  if (auth?.startsWith('Bearer ')) return auth.slice(7).trim();
  const xt = req.headers.get('x-session-token');
  if (xt && xt.length > 10) return xt;
  const cookie = req.headers.get('cookie') ?? '';
  const m = cookie.match(new RegExp('(?:^|; )' + COOKIE_NAME + '=([^;]*)'));
  if (m && m[1] !== undefined) return decodeURIComponent(m[1]);
  const m2 = cookie.match(new RegExp('(?:^|; )' + JS_COOKIE + '=([^;]*)'));
  return m2 && m2[1] !== undefined ? decodeURIComponent(m2[1]) : null;
}

export { handler as GET, handler as POST };
