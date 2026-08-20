/**
 * واجهات الودجت العامة (Public Widget API)
 * - GET  /w/config/:clientId  → إعداد العميل والثيم
 * - POST /w/session           → جلسة موقّعة
 * - POST /w/chat              → بث SSE للرد
 * - POST /w/feedback          → تقييم رسالة
 * - GET  /w/healthz           → فحص خارجي (Uptime Kuma)
 */
import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpException,
  Param,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { db, id as uid, json, now, recordUsage } from '@cbd/db';
import { chatRequestSchema, feedbackSchema, handoffSchema, leadSchema, orderTrackSchema } from '@cbd/shared';
import { Public } from '../auth.js';
import { GatewayService } from '../gateway.service.js';
import { OrderTrackingService } from '../order-tracking.service.js';
import { WidgetService } from '../widget.service.js';
import { audit } from '../audit.js';

@Public()
@Controller('w')
export class WidgetController {
  constructor(
    private readonly gateway: GatewayService,
    private readonly widgets: WidgetService,
    private readonly orders: OrderTrackingService
  ) {}

  @Get('healthz')
  healthz() {
    return { ok: true, service: 'chat-bot-dev-widget-api', at: now() };
  }

  /** إطار المحادثة (iframe) — HTML خفيف يحمّل حزمة الودجت المبنية */
  @Get('frame')
  frame(@Req() req: Request, @Res() res: Response) {
    const clientId = String(req.query.client ?? '');
    const base = req.originalUrl.split('/w/frame')[0] || '';
    res.status(200).type('html').send(`<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>المساعد الذكي</title>
<link rel="stylesheet" href="${base}/w-assets/frame.css"/>
<script>window.__CBD_WIDGET__={clientId:${JSON.stringify(clientId)},apiBase:${JSON.stringify(base)}};</script>
</head>
<body>
<div id="cbd-widget-app"></div>
<script src="${base}/w-assets/frame.js"></script>
</body>
</html>`);
  }

  @Get('config/:clientId')
  async config(@Param('clientId') clientId: string) {
    const cfg = await this.widgets.getPublicConfig(clientId);
    if (!cfg) throw new BadRequestException('عميل غير موجود أو موقوف');
    // حاسبة العروسة: الأساسيات بأسعارها الحقيقية + منتجات العروسة المتوفرة
    try {
      const [defaults, products] = await Promise.all([
        this.gateway.catalog.resolveBrideDefaults(clientId),
        this.gateway.catalog.getBrideEssentials(clientId, 8),
      ]);
      cfg.bride = {
        budget: 65000,
        defaults,
        products: products.map((p) => ({
          name: p.name, category: p.category, price: p.price, oldPrice: p.oldPrice,
          currency: p.currency, imageUrl: p.imageUrl, productUrl: p.productUrl,
          isDeal: p.isDeal, isBrideEssential: p.isBrideEssential,
        })),
      };
    } catch {
      /* الكتالوج اختياري */
    }
    return cfg;
  }

  @Post('session')
  async session(
    @Body() body: { clientId?: string; botId?: string; visitorId?: string },
    @Headers('origin') origin: string | undefined
  ) {
    const clientId = String(body.clientId ?? '');
    const botId = String(body.botId ?? '');
    const visitorId = String(body.visitorId ?? '').slice(0, 64) || 'anon';
    if (!clientId) throw new BadRequestException('clientId مطلوب');
    if (!(await this.widgets.isOriginAllowed(clientId, origin))) {
      audit({ action: 'widget_origin_blocked', entity: 'widget', entityId: clientId, meta: { origin } });
      throw new ForbiddenException('هذا النطاق غير مسموح له باستخدام البوت');
    }
    return this.widgets.createSession(clientId, botId, visitorId);
  }

  @Post('chat')
  async chat(
    @Body() body: unknown,
    @Req() req: Request,
    @Res() res: Response,
    @Headers('origin') origin: string | undefined
  ) {
    const parsed = chatRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('طلب غير صالح');
    const { sessionToken, message, page } = parsed.data;

    const sess = this.widgets.verify(sessionToken);
    if (!sess) throw new ForbiddenException('الجلسة منتهية — أعد تحميل البوت');
    if (!(await this.widgets.isOriginAllowed(sess.cid, origin))) {
      throw new ForbiddenException('هذا النطاق غير مسموح له باستخدام البوت');
    }

    const ip = (req.headers['x-forwarded-for']?.toString().split(',')[0] ?? req.ip ?? 'unknown').trim();
    if (!(await this.widgets.rateLimit(ip, sess.cid, sess.vid))) {
      throw new HttpException('طلبات كثيرة جداً — حاول بعد قليل', 429);
    }

    const botRow = await db.get('SELECT * FROM bots WHERE id = ? AND active = 1', sess.bid) as any;
    if (!botRow) throw new BadRequestException('البوت غير متاح حالياً');
    const clientRow = await db.get('SELECT * FROM clients WHERE id = ? AND status = ?', sess.cid, 'active') as any;
    if (!clientRow) throw new BadRequestException('الخدمة موقوفة لهذا الموقع');

    // حدود العميل اليومية/الشهرية
    const used = await db.get(
      'SELECT COUNT(*) AS c FROM usage_events WHERE client_id = ? AND created_at > ?',
      sess.cid, now() - 86_400_000
    ) as any;
    if (Number(used?.c ?? 0) >= Number(clientRow.daily_limit)) {
      throw new HttpException('وصلنا للحد اليومي — عاود المحاولة غداً', 429);
    }

    // الفلترة الأساسية ضد حقن البرومبت
    if (/(ignore|تجاهل).*(instructions|التعليمات)/i.test(message) && message.length > 200) {
      audit({ action: 'prompt_injection_blocked', entity: 'widget', entityId: sess.cid });
    }

    // المحادثة
    const { conv } = await this.widgets.getOrCreateConversation(sess, page);
    const history = conv.messages
      .filter((m) => m.role !== 'system')
      .slice(-10)
      .map((m) => ({ role: m.role, content: m.content }));
    await this.widgets.appendMessage(conv, 'user', message);

    const bot = {
      id: String(botRow.id),
      clientId: String(botRow.client_id),
      name: String(botRow.name),
      description: '',
      persona: String(botRow.persona),
      language: String(botRow.language) as any,
      maxReplyLength: Number(botRow.max_reply_len),
      forbiddenTopics: json<string[]>(botRow.forbidden_json, []),
      knowledgeChunks: [],
      routing: json<any>(botRow.routing_json, { strategy: 'priority-failover', tiers: [] }),
      active: true,
      createdAt: Number(botRow.created_at),
    };
    const botFallback = String(botRow.fallback_msg ?? '');

    const result = await this.gateway.chat(
      { bot, clientId: sess.cid, history, page },
      message
    );

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    let assistantText = '';
    let errored = false;
    let assistantMsgId: string | null = null;
    let products: any[] = [];
    try {
      for await (const chunk of result.stream) {
        if (res.writableEnded || res.destroyed) break;
        if (chunk.type === 'delta' && chunk.text) {
          assistantText += chunk.text;
          res.write(`data: ${JSON.stringify({ type: 'delta', text: chunk.text })}\n\n`);
        } else if (chunk.type === 'error') {
          errored = true;
        }
      }

      // الرد الاحتياطي للشخصية (مواصفة كنز الشوا) عند انقطاع النموذج
      if (!assistantText && errored && botFallback) {
        assistantText = botFallback;
        for (const word of botFallback.split(/(\s+)/)) {
          if (res.writableEnded || res.destroyed) break;
          res.write(`data: ${JSON.stringify({ type: 'delta', text: word })}\n\n`);
        }
        errored = false;
      }

      if (!errored && assistantText) {
        const msg = await this.widgets.appendMessage(conv, 'assistant', assistantText);
        assistantMsgId = msg.id;
      }

      // خوارزمية المنتجات الموصى بها: منتجان مطابقان أسفل الإجابة (أو أول منتجين عند الاحتياطي)
      try {
        const matched = await this.gateway.catalog.matchProducts(sess.cid, message, assistantText, 2);
        if (matched.length) {
          products = matched;
        } else if (assistantText === botFallback) {
          products = await this.gateway.catalog.firstProducts(sess.cid, 2);
        }
      } catch {
        /* الكتالوج اختياري */
      }

      res.write(
        `data: ${JSON.stringify({
          type: 'done',
          conversationId: conv.id,
          assistantMessageId: assistantMsgId,
          products: products.map((p) => ({
            name: p.name,
            category: p.category,
            price: p.price,
            oldPrice: p.oldPrice,
            currency: p.currency,
            imageUrl: p.imageUrl,
            productUrl: p.productUrl,
            isDeal: p.isDeal,
            isBrideEssential: p.isBrideEssential,
          })),
        })}\n\n`
      );
    } catch (err) {
      res.write(`data: ${JSON.stringify({ type: 'error', message: (err as Error).message })}\n\n`);
    } finally {
      await result.finalize();
      if (!res.writableEnded) res.end();
    }
  }

  @Post('lead')
  async lead(
    @Body() body: unknown,
    @Req() req: Request,
    @Headers('origin') origin: string | undefined
  ) {
    const parsed = leadSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('بيانات غير صالحة');
    const { sessionToken, name, email, phone, message } = parsed.data;
    const sess = this.widgets.verify(sessionToken);
    if (!sess) throw new ForbiddenException('الجلسة منتهية — أعد تحميل البوت');
    if (!(await this.widgets.isOriginAllowed(sess.cid, origin))) {
      throw new ForbiddenException('هذا النطاق غير مسموح له باستخدام البوت');
    }
    const ip = (req.headers['x-forwarded-for']?.toString().split(',')[0] ?? req.ip ?? 'unknown').trim();
    if (!(await this.widgets.rateLimit(ip, sess.cid, sess.vid))) {
      throw new HttpException('طلبات كثيرة جداً — حاول بعد قليل', 429);
    }
    const page = req.body?.page ?? undefined;
    const result = await this.widgets.saveLead(sess, { name, email, phone, message }, page);
    audit({ action: 'widget.lead_captured', entity: 'widget', entityId: sess.cid, meta: { email } });
    return { ok: true, id: result.id };
  }

  @Post('handoff')
  async handoff(
    @Body() body: unknown,
    @Req() req: Request,
    @Headers('origin') origin: string | undefined
  ) {
    const parsed = handoffSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('طلب غير صالح');
    const sess = this.widgets.verify(parsed.data.sessionToken);
    if (!sess) throw new ForbiddenException('الجلسة منتهية');
    if (!(await this.widgets.isOriginAllowed(sess.cid, origin))) {
      throw new ForbiddenException('هذا النطاق غير مسموح له باستخدام البوت');
    }
    const ip = (req.headers['x-forwarded-for']?.toString().split(',')[0] ?? req.ip ?? 'unknown').trim();
    if (!(await this.widgets.rateLimit(ip, sess.cid, sess.vid))) {
      throw new HttpException('طلبات كثيرة جداً — حاول بعد قليل', 429);
    }
    // تسجيل الحدث في العدادات (status=handoff) لتظهر التحويلات في التقارير
    await recordUsage({
      id: uid('use'),
      clientId: sess.cid,
      botId: sess.bid,
      providerId: 'human',
      model: `human-handoff:${parsed.data.method}`,
      tokensIn: 0,
      tokensOut: 0,
      latencyMs: 0,
      status: 'handoff',
      costUsd: 0,
      createdAt: now(),
    });
    audit({ action: 'widget.handoff', entity: 'widget', entityId: sess.cid, meta: { method: parsed.data.method } });
    return { ok: true };
  }

  /** تتبع الطلبات عبر CS-Cart REST API — يرد بنبرة كنز الشوا */
  @Post('order')
  async trackOrder(
    @Body() body: unknown,
    @Req() req: Request,
    @Headers('origin') origin: string | undefined
  ) {
    const parsed = orderTrackSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('رقم الطلب مطلوب');
    const sess = this.widgets.verify(parsed.data.sessionToken);
    if (!sess) throw new ForbiddenException('الجلسة منتهية — أعد تحميل البوت');
    if (!(await this.widgets.isOriginAllowed(sess.cid, origin))) {
      throw new ForbiddenException('هذا النطاق غير مسموح له باستخدام البوت');
    }
    const ip = (req.headers['x-forwarded-for']?.toString().split(',')[0] ?? req.ip ?? 'unknown').trim();
    if (!(await this.widgets.rateLimit(ip, sess.cid, sess.vid))) {
      throw new HttpException('طلبات كثيرة جداً — حاول بعد قليل', 429);
    }
    const result = await this.orders.track(sess.cid, parsed.data.orderId, parsed.data.email || undefined);
    audit({ action: 'widget.order_track', entity: 'widget', entityId: sess.cid, meta: { orderId: parsed.data.orderId, ok: result.ok } });
    return { ok: result.ok, reply: this.orders.kanzReply(result) };
  }

  @Post('feedback')
  async feedback(@Body() body: unknown) {
    const parsed = feedbackSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('طلب غير صالح');
    const ok = await this.widgets.setFeedback(parsed.data.conversationId, parsed.data.messageId, parsed.data.feedback);
    return { ok };
  }
}
