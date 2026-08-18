import { Body, Controller, Get, Post, Res, UnauthorizedException } from '@nestjs/common';
import type { Response } from 'express';
import { db, now } from '@cbd/db';
import { verifyPassword } from '../crypto.js';
import { AUTH_COOKIE, CurrentUser, Public, signAuthToken } from '../auth.js';
import type { AuthUser } from '../auth.js';
import { audit } from '../audit.js';
import { config } from '../config.js';

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
    const token = signAuthToken(authUser);
    const cookieOpts = {
      httpOnly: true,
      sameSite: 'lax' as const,
      secure: !config.DEMO_MODE,
      path: '/',
      maxAge: 15 * 60 * 1000,
    };
    res.cookie(AUTH_COOKIE, token, cookieOpts);
    await db.run('UPDATE users SET last_login_at = ? WHERE id = ?', now(), authUser.id);
    audit({ userId: authUser.id, action: 'login', entity: 'auth' });
    return { user: authUser, token };
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return { user };
  }

  @Post('refresh')
  refresh(@CurrentUser() user: AuthUser, @Res({ passthrough: true }) res: Response) {
    const token = signAuthToken(user);
    res.cookie(AUTH_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: !config.DEMO_MODE,
      path: '/',
      maxAge: 15 * 60 * 1000,
    });
    return { user, token };
  }

  @Post('logout')
  logout(@CurrentUser() user: AuthUser, @Res({ passthrough: true }) res: Response) {
    res.clearCookie(AUTH_COOKIE, { path: '/' });
    audit({ userId: user.id, action: 'logout', entity: 'auth' });
    return { ok: true };
  }
}
