/**
 * OrderTrackingService — تتبع الطلبات عبر CS-Cart REST API
 * ─────────────────────────────────────────────────────────────
 * السيناريو الاحترافي: الزائر يطلب تتبع طلبه → الخدمة تستدعي
 * GET {storeUrl}/api/orders/{orderId} بBasic Auth (إيميل حساب البوت + مفتاح API)
 * → تترجم الحالة العربية → يرد البوت بنبرة كنز الشوا.
 *
 * الأمان:
 *  - المفتاح مخزن مشفراً (AES-256-GCM) في cs_cart_json — لا يغادر الخادم أبداً
 *  - التحقق (رقم الطلب + الإيميل) إن كان مفعلاً — لا يمكن تتبع طلب غير طلبك
 *  - حدود معدل مطبقة على مستوى الودجت
 */
import { Injectable, Logger } from '@nestjs/common';
import { db, json } from '@cbd/db';
import { decryptSecret } from './crypto.js';

/** خريطة حالات CS-Cart → عربي (fallback للنص الأصلي) */
const CS_CART_STATUS: Record<string, string> = {
  O: 'مفتوح — لسه قيد المراجعة',
  P: 'قيد المعالجة — بيتجهز دلوقتي',
  A: 'بانتظار التأكيد',
  C: 'مكتمل — تم التسليم ✅',
  F: 'فشل — تواصل مع خدمة العملاء',
  D: 'مرفوض — تواصل مع خدمة العملاء',
  B: 'طلب متأخر — المنتج بيتوفر قريباً',
};

export interface TrackResult {
  ok: boolean;
  orderId: string;
  statusRaw: string;
  statusAr: string;
  email?: string;
  total?: string;
  date?: string;
  error?: string;
}

@Injectable()
export class OrderTrackingService {
  private readonly logger = new Logger('Orders');

  private async getCsCartConfig(clientId: string): Promise<{ storeUrl: string; apiEmail: string; apiKey: string } | null> {
    try {
      const row = await db.get('SELECT cs_cart_json FROM clients WHERE id = ?', clientId) as any;
      if (!row?.cs_cart_json) return null;
      const cfg = json<any>(row.cs_cart_json, null);
      if (!cfg?.storeUrl || !cfg?.apiEmail || !cfg?.apiKeyEnc) return null;
      const apiKey = decryptSecret(String(cfg.apiKeyEnc));
      if (!apiKey) return null;
      return { storeUrl: String(cfg.storeUrl), apiEmail: String(cfg.apiEmail), apiKey };
    } catch {
      return null;
    }
  }

  /** تتبع طلب عبر CS-Cart REST API */
  async track(clientId: string, orderId: string, email?: string): Promise<TrackResult> {
    const cfg = await this.getCsCartConfig(clientId);
    if (!cfg) {
      return {
        ok: false, orderId, statusRaw: '', statusAr: '',
        error: 'تكامل تتبع الطلبات غير مفعل لهذا المتجر بعد — فعّل CS-Cart API من إعدادات العميل',
      };
    }

    try {
      const base = cfg.storeUrl.replace(/\/+$/, '');
      const auth = Buffer.from(`${cfg.apiEmail}:${cfg.apiKey}`).toString('base64');
      const res = await fetch(`${base}/api/orders/${encodeURIComponent(orderId)}`, {
        headers: {
          authorization: `Basic ${auth}`,
          accept: 'application/json',
        },
        signal: AbortSignal.timeout(10_000),
      });

      if (!res.ok) {
        if (res.status === 404) {
          return { ok: false, orderId, statusRaw: '', statusAr: '', error: 'مفيش طلب بالرقم ده — راجع رقم الطلب وجرب تاني' };
        }
        if (res.status === 401 || res.status === 403) {
          this.logger.warn(`CS-Cart auth فشل لعميل ${clientId}`);
          return { ok: false, orderId, statusRaw: '', statusAr: '', error: 'تعذر الاتصال بنظام الطلبات — جرب بعد قليل أو كلمنا على 16959' };
        }
        return { ok: false, orderId, statusRaw: '', statusAr: '', error: `نظام الطلبات رد بـ HTTP ${res.status} — جرب بعد قليل` };
      }

      const data = (await res.json()) as any;
      // التحقق الاختياري: الإيميل إن أُرسل يجب أن يطابق (أمان — لا تتبع طلبات الآخرين)
      if (email && data.email && String(data.email).toLowerCase() !== email.toLowerCase()) {
        return { ok: false, orderId, statusRaw: '', statusAr: '', error: 'الإيميل مش مطابق لصاحب الطلب — تأكد من البيانات' };
      }
      const statusRaw = String(data.status ?? '');
      const statusAr = CS_CART_STATUS[statusRaw.toUpperCase()] ?? `حالة الطلب: ${statusRaw || 'غير محددة'}`;
      return {
        ok: true,
        orderId,
        statusRaw: statusRaw.toUpperCase(),
        statusAr,
        email: data.email ? String(data.email) : undefined,
        total: data.total != null ? String(data.total) : undefined,
        date: data.timestamp ? new Date(Number(data.timestamp) * 1000).toLocaleDateString('ar-EG') : undefined,
      };
    } catch (err) {
      this.logger.warn(`CS-Cart order tracking فشل: ${(err as Error).message}`);
      return { ok: false, orderId, statusRaw: '', statusAr: '', error: 'تعذر الوصول لنظام الطلبات — جرب بعد قليل أو كلمنا على 16959' };
    }
  }

  /** صياغة رد كنز الشوا على نتيجة التتبع */
  kanzReply(r: TrackResult): string {
    if (!r.ok) return r.error ?? 'تعذر تتبع الطلب';
    return [
      `تفضل يا فندم، حالة طلبك 📦`,
      ``,
      `▎رقم الطلب: ${r.orderId}`,
      `▎الحالة: ${r.statusAr}`,
      r.total ? `▎الإجمالي: ${r.total} ج.م` : '',
      r.date ? `▎تاريخ الطلب: ${r.date}` : '',
      ``,
      `لو محتاج تفاصيل أكتر أو حاجة اتأخرت، كلمنا على 16959 من السبت للخميس 9ص–5م — وعينيا ليك 👑`,
    ].filter((l) => l !== '').join('\n');
  }
}
