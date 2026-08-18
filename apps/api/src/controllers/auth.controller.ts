import { Body, Controller, Get, Headers, Post, Res, UnauthorizedException, BadRequestException } from '@nestjs/common';
import type { Response } from 'express';
import { db, now } from '@cbd/db';
import { verifyPassword } from '../crypto.js';
import { encryptSecret, decryptSecret } from '../crypto.js';
import { AUTH_COOKIE, CurrentUser, Public, signAuthToken, jwtService } from '../auth.js';
import type { AuthUser } from '../auth.js';
import { audit } from '../audit.js';
import { config } from '../config.js';
import { generateTotpSecret, otpauthUri, verifyTotp } from '../totp.js';

/** أسرار 2FA قيد الإعداد (قبل التأكيد) — في الإنتاج تُنقل لـ Redis */
const pendingTotp = new Map<string, { secret: string; exp: number }>();

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: !config.DEMO_MODE,
    path: '/',
    maxAge: 15 * 60 * 1000,
  };
}

@Controller('auth')
export class AuthController {
  @Public()
  @Post('login')
  async login(@Body() body: { email: string; password: string }, @Res({ passthrough: true }) res: Response) {
    const email = String(body.email ?? '').trim().toLowerCase();
    const user = await db.get('SELECT * FROM users WHERE email = ? AND active = 1', email) as any;
    if (!user || !verifyPassword(String(body.password ?? ''), String(user.password_hash))) {
      throw new UnauthorizedException('بيانات الدخول غير صحيحة');
    }
    const authUser: AuthUser = {
      id: String(user.id),
      email: String(user.email),
      name: String(user.name),
      role: String(user.role) as AuthUser['role'],
    };

    // خطوة المصادقة الثنائية عند تفعيلها
    if (String(user.totp_secret ?? '')) {
      const temp = jwtService.sign({ sub: authUser.id, scope: 'totp' }, { expiresIn: '2m' });
      return { totpRequired: true, tempToken: temp, email: authUser.email };
    }

    const token = signAuthToken(authUser);
    res.cookie(AUTH_COOKIE, token, cookieOptions());
    await db.run('UPDATE users SET last_login_at = ? WHERE id = ?', now(), authUser.id);
    audit({ userId: authUser.id, action: 'login', entity: 'auth' });
    return { user: authUser, token };
  }

  @Public()
  @Post('2fa/verify')
  async verify2fa(@Body() body: { tempToken: string; code: string }, @Res({ passthrough: true }) res: Response) {
    let payload: { sub?: string; scope?: string };
    try {
      payload = jwtService.verify(String(body?.tempToken ?? ''));
    } catch {
      throw new UnauthorizedException('انتهت صلاحية التحقق — أعد تسجيل الدخول');
    }
    if (payload.scope !== 'totp' || !payload.sub) throw new UnauthorizedException('رمز تحقق غير صالح');

    const user = await db.get('SELECT * FROM users WHERE id = ? AND active = 1', payload.sub) as any;
    if (!user) throw new UnauthorizedException('المستخدم غير موجود');
    const secret = decryptSecret(String(user.totp_secret ?? ''));
    if (!secret || !verifyTotp(secret, String(body?.code ?? ''))) {
      throw new UnauthorizedException('كود التحقق غير صحيح');
    }

    const authUser: AuthUser = {
      id: String(user.id),
      email: String(user.email),
      name: String(user.name),
      role: String(user.role) as AuthUser['role'],
    };
    const token = signAuthToken(authUser);
    res.cookie(AUTH_COOKIE, token, cookieOptions());
    await db.run('UPDATE users SET last_login_at = ? WHERE id = ?', now(), authUser.id);
    audit({ userId: authUser.id, action: 'login_2fa', entity: 'auth' });
    return { user: authUser, token };
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return { user };
  }

  /**
   * تجديد الجلسة مع فترة سماح (Sliding Session) — المعيار الاحترافي لحل الخروج المفاجئ:
   * - الرموز المنتهية حديثاً (خلال 12 ساعة) تُجدَّد تلقائياً برمز جديد 15 دقيقة.
   * - التوقيع يُتحقق دائماً (حتى للرمز المنتهي) فلا يمكن تزوير التجديد.
   * - الدور والصلاحيات تُقرأ من قاعدة البيانات عند كل تجديد (تسري الإيقافات فوراً).
   */
  @Public()
  @Post('refresh')
  async refresh(@Headers('authorization') auth: string | undefined, @Res({ passthrough: true }) res: Response) {
    const token = auth?.startsWith('Bearer ') ? auth.slice(7).trim() : '';
    if (!token) throw new UnauthorizedException('رمز غير موجود');
    let payload: any;
    try {
      payload = jwtService.verify(token, { ignoreExpiration: true });
    } catch {
      throw new UnauthorizedException('رمز غير صالح');
    }
    const GRACE_MS = 12 * 3600_000;
    if (typeof payload?.exp !== 'number' || Date.now() > payload.exp * 1000 + GRACE_MS) {
      throw new UnauthorizedException('انتهت الجلسة — سجل الدخول مجدداً');
    }
    const user = await db.get('SELECT * FROM users WHERE id = ? AND active = 1', payload.sub) as any;
    if (!user) throw new UnauthorizedException('المستخدم غير موجود');
    const authUser: AuthUser = {
      id: String(user.id),
      email: String(user.email),
      name: String(user.name),
      role: String(user.role) as AuthUser['role'],
    };
    const newToken = signAuthToken(authUser);
    res.cookie(AUTH_COOKIE, newToken, cookieOptions());
    audit({ userId: authUser.id, action: 'session.refresh', entity: 'auth' });
    return { user: authUser, token: newToken };
  }

  @Post('logout')
  logout(@CurrentUser() user: AuthUser, @Res({ passthrough: true }) res: Response) {
    res.clearCookie(AUTH_COOKIE, { path: '/' });
    audit({ userId: user.id, action: 'logout', entity: 'auth' });
    return { ok: true };
  }

  // ─────────────────── المصادقة الثنائية (2FA) ───────────────────

  @Get('2fa/status')
  async twoFaStatus(@CurrentUser() user: AuthUser) {
    const row = await db.get('SELECT totp_secret FROM users WHERE id = ?', user.id) as any;
    return { enabled: Boolean(row && String(row.totp_secret ?? '')) };
  }

  @Post('2fa/setup')
  async twoFaSetup(@CurrentUser() user: AuthUser) {
    const secret = generateTotpSecret();
    pendingTotp.set(user.id, { secret, exp: now() + 10 * 60_000 });
    audit({ userId: user.id, action: '2fa.setup_start', entity: 'auth' });
    return {
      secret,
      uri: otpauthUri(secret, user.email),
      instructions: [
        'افتح Google Authenticator (أو أي تطبيق TOTP).',
        'اضغط + ثم «إدخال مفتاح» والصق السر يدوياً، أو امسح رمز QR عبر الرابط التالي.',
        'أدخل الكود الظاهر في التطبيق لتأكيد التفعيل.',
      ],
    };
  }

  @Post('2fa/confirm')
  async twoFaConfirm(@CurrentUser() user: AuthUser, @Body() body: { code: string }) {
    const pending = pendingTotp.get(user.id);
    if (!pending || pending.exp < now()) {
      throw new BadRequestException('انتهت صلاحية الإعداد — ابدأ من جديد');
    }
    if (!verifyTotp(pending.secret, String(body?.code ?? ''))) {
      throw new UnauthorizedException('كود غير صحيح — تأكد من تطبيق المصادقة');
    }
    await db.run('UPDATE users SET totp_secret = ? WHERE id = ?', encryptSecret(pending.secret), user.id);
    pendingTotp.delete(user.id);
    audit({ userId: user.id, action: '2fa.enabled', entity: 'auth' });
    return { ok: true };
  }

  @Post('2fa/disable')
  async twoFaDisable(@CurrentUser() user: AuthUser, @Body() body: { code: string }) {
    const row = await db.get('SELECT totp_secret FROM users WHERE id = ?', user.id) as any;
    const secret = decryptSecret(String(row?.totp_secret ?? ''));
    if (!secret || !verifyTotp(secret, String(body?.code ?? ''))) {
      throw new UnauthorizedException('كود غير صحيح');
    }
    await db.run("UPDATE users SET totp_secret = '' WHERE id = ?", user.id);
    audit({ userId: user.id, action: '2fa.disabled', entity: 'auth' });
    return { ok: true };
  }
}
