/**
 * المصادقة والتفويض — JWT قصير العمر + كعكة httpOnly + أدوار (RBAC)
 */
import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { config } from './config.js';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: 'super_admin' | 'operator' | 'support';
}

export const jwtService = new JwtService({
  secret: config.JWT_SECRET,
  signOptions: { expiresIn: '15m' },
});

export const AUTH_COOKIE = 'cbd_token';

export function signAuthToken(user: AuthUser): string {
  return jwtService.sign({ sub: user.id, email: user.email, role: user.role });
}

export function verifyAuthToken(token: string): AuthUser | null {
  try {
    const payload = jwtService.verify<{ sub: string; email: string; role: AuthUser['role'] }>(token);
    return { id: payload.sub, email: payload.email, name: '', role: payload.role };
  } catch {
    return null;
  }
}

function extractToken(req: Request): string | null {
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) return auth.slice(7);
  // رأس مخصص — بعض البروكسيات الوسيطة تشيل Authorization، هذا ينجو منها
  const xt = req.headers['x-session-token'];
  if (typeof xt === 'string' && xt.length > 10) return xt;
  const cookie = (req as any).cookies?.[AUTH_COOKIE];
  if (cookie) return cookie;
  return null;
}

export const IS_PUBLIC_KEY = 'cbd_public';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

@Injectable()
export class JwtAuthGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const isPublic =
      Reflect.getMetadata(IS_PUBLIC_KEY, ctx.getHandler()) === true ||
      Reflect.getMetadata(IS_PUBLIC_KEY, ctx.getClass()) === true;
    const req = ctx.switchToHttp().getRequest<Request>();
    const token = extractToken(req);
    const user = token ? verifyAuthToken(token) : null;
    if (isPublic) {
      if (user) (req as any).user = user; // اختياري — إن وُجد
      return true;
    }
    if (!user) {
      // سجل تشخيصي دقيق — يوضح أي قناة وصلت وأيها لم تصل
      const bearer = Boolean(req.headers.authorization);
      const xt = Boolean(req.headers['x-session-token']);
      const cookie = Boolean((req as any).cookies?.[AUTH_COOKIE]);
      console.warn(`[auth:401] ${req.method} ${req.url} | bearer:${bearer} x-session-token:${xt} cookie:${cookie}`);
      throw new UnauthorizedException('انتهت الجلسة — سجل الدخول مجدداً');
    }
    (req as any).user = user;
    return true;
  }
}

export const ROLES_KEY = 'cbd_roles';
export const Roles = (...roles: AuthUser['role'][]) => SetMetadata(ROLES_KEY, roles);

@Injectable()
export class RolesGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request>();
    const required = Reflect.getMetadata(ROLES_KEY, ctx.getHandler()) as AuthUser['role'][] | undefined;
    if (!required || !required.length) return true;
    const user = (req as any).user as AuthUser | undefined;
    if (!user) throw new UnauthorizedException();
    if (!required.includes(user.role)) throw new ForbiddenException('صلاحيات غير كافية');
    return true;
  }
}

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser => {
  const req = ctx.switchToHttp().getRequest<Request>();
  return (req as any).user;
});
