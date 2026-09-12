/**
 * أدوات التشفير المركزية:
 * - AES-256-GCM لمفاتيح المزودين (مع مفتاح من بيئة التشغيل)
 * - HMAC-SHA256 لتوقيع جلسات الودجت
 * - scrypt لكلمات المرور (يُعاد تصديرها من @cbd/db seed)
 */
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { config } from './config.js';

const encKey = (): Buffer => {
  const key = config.ENCRYPTION_KEY;
  // نشتق مفتاح 32 بايت من أي سلسلة
  return Buffer.from(createHash('sha256').update(key).digest());
};

export function encryptSecret(plain: string): string {
  if (!plain) return '';
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString('base64')}.${tag.toString('base64')}.${enc.toString('base64')}`;
}

export function decryptSecret(stored: string): string {
  if (!stored) return '';
  try {
    const [v, ivB64, tagB64, dataB64] = stored.split('.');
    if (v !== 'v1' || !ivB64 || !tagB64 || !dataB64) return '';
    const decipher = createDecipheriv('aes-256-gcm', encKey(), Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    return '';
  }
}

/** جلسات الودجت — رمز قصير موقّع بـ HMAC */
export function signSession(payload: Record<string, unknown>, ttlSeconds = 300): string {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + ttlSeconds * 1000 })).toString('base64url');
  const sig = createHmac('sha256', config.JWT_SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifySession(token: string): Record<string, any> | null {
  try {
    const [body, sig] = token.split('.');
    if (!body || !sig) return null;
    const expected = createHmac('sha256', config.JWT_SECRET).update(body).digest('base64url');
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (typeof payload.exp !== 'number' || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export { hashPassword, verifyPassword } from '@cbd/db/seed';
