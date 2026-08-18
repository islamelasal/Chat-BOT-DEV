/**
 * WidgetService — خدمة الودجت العامة:
 * - جلسات موقّعة HMAC قصيرة العمر
 * - التحقق من Origin ضد قائمة نطاقات العميل (وفي وضع الديمو: سماح مُراقَب)
 * - حدود معدل لكل زائر وكل عميل
 * - حفظ المحادثات في DB
 */
import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { cache, db, id, json, now } from '@cbd/db';
import type { Conversation, PageContext, ThemeConfig } from '@cbd/shared';
import { config } from './config.js';
import { signSession, verifySession } from './crypto.js';

export interface WidgetSession {
  sid: string;
  cid: string; // clientId
  bid: string; // botId
  vid: string; // visitorId
  exp: number;
}

export interface WidgetPublicConfig {
  clientId: string;
  botId: string;
  clientName: string;
  theme: ThemeConfig;
  language: string;
}

const DEFAULT_THEME: ThemeConfig = {
  primary: '#0F766E',
  secondary: '#F59E0B',
  background: '#FFFFFF',
  bubbleText: 'أهلاً! محتاج مساعدة؟',
  headerText: '#FFFFFF',
  font: 'Cairo',
  position: 'bottom-left',
  bubbleStyle: 'pill',
  windowMode: 'docked',
  welcomeTitle: 'مساعد ذكي',
  welcomeText: 'أهلاً بيك! إزاي أقدر أساعدك؟',
  suggestions: [],
  showBrand: true,
  logoUrl: null,
  poweredBy: true,
};

@Injectable()
export class WidgetService {
  async createSession(clientId: string, botId: string, visitorId: string): Promise<{ token: string; expiresAt: number }> {
    let bid = botId;
    if (!bid) {
      const bot = await db.get('SELECT id FROM bots WHERE client_id = ? AND active = 1 ORDER BY created_at ASC LIMIT 1', clientId) as any;
      bid = bot ? String(bot.id) : '';
    }
    const token = signSession({ sid: id('ses'), cid: clientId, bid, vid: visitorId }, 300);
    const payload = verifySession(token)!;
    return { token, expiresAt: payload.exp };
  }

  verify(token: string): WidgetSession | null {
    const p = verifySession(token);
    if (!p) return null;
    return { sid: String(p.sid), cid: String(p.cid), bid: String(p.bid), vid: String(p.vid), exp: Number(p.exp) };
  }

  async getPublicConfig(clientId: string): Promise<WidgetPublicConfig | null> {
    const client = await db.get('SELECT * FROM clients WHERE id = ? AND status != ?', clientId, 'suspended') as any;
    if (!client) return null;
    const bot = await db.get('SELECT * FROM bots WHERE client_id = ? AND active = 1 ORDER BY created_at ASC LIMIT 1', clientId) as any;
    if (!bot) return null;
    const theme = { ...DEFAULT_THEME, ...json<Partial<ThemeConfig>>(client.theme_json, {}) };
    const brand = json<{ logoUrl: string | null }>(client.brand_json, { logoUrl: null });
    if (brand.logoUrl) theme.logoUrl = brand.logoUrl;
    return {
      clientId,
      botId: String(bot.id),
      clientName: String(client.name),
      theme,
      language: String(bot.language ?? 'ar'),
    };
  }

  /** التحقق من النطاق — في الإنتاج: صارم ضد allowlist. في الديمو: سماح مع تسجيل. */
  async isOriginAllowed(clientId: string, origin: string | undefined): Promise<boolean> {
    if (!origin) return true; // طلبات بلا Origin (أدوات/تجارب) — تُقبل مع حدود المعدل
    let host = '';
    try {
      host = new URL(origin).host.toLowerCase();
    } catch {
      return false;
    }
    const domains = await db.all('SELECT domain FROM domains WHERE client_id = ?', clientId) as Array<{ domain: string }>;
    const allowed = domains.some((d) => {
      const dd = d.domain.toLowerCase().replace(/^www\./, '');
      return host === dd || host.endsWith('.' + dd);
    });
    if (allowed) return true;
    if (config.DEMO_MODE) {
      console.warn(`[demo] origin ${origin} مقبول خارج القائمة (DEMO_MODE)`);
      return true;
    }
    return false;
  }

  /** حدود المعدل متعددة الطبقات:
   *  1. لكل جلسة زائر (أدق من IP — يعمل حتى خلف CGNAT)
   *  2. لكل IP (حماية عامة بسقف أرحم للشبكات المشتركة)
   *  3. لكل عميل/ساعة (سقف الخدمة الكلي) */
  async rateLimit(ip: string, clientId: string, visitorId: string): Promise<boolean> {
    if (config.RATE_LIMIT_DISABLED) return true;
    const minute = Math.floor(Date.now() / 60_000);
    const hour = Math.floor(Date.now() / 3600_000);
    const perSession = await cache.incr(`rl:visitor:${visitorId}:${minute}`, 60);
    const perIp = await cache.incr(`rl:ip:${ip}:${minute}`, 60);
    const perClient = await cache.incr(`rl:client:${clientId}:${hour}`, 3600);
    return (
      perSession <= config.RATE_LIMIT_PER_SESSION_MIN &&
      perIp <= config.RATE_LIMIT_PER_IP_MIN &&
      perClient <= config.RATE_LIMIT_PER_CLIENT_HOUR
    );
  }

  async getOrCreateConversation(sess: WidgetSession, page?: PageContext): Promise<{ conv: Conversation; isNew: boolean }> {
    const existing = await db.get(
      "SELECT * FROM conversations WHERE client_id = ? AND visitor_id = ? AND bot_id = ? AND updated_at > ? ORDER BY updated_at DESC LIMIT 1",
      sess.cid, sess.vid, sess.bid, now() - 6 * 3600_000
    ) as any;
    if (existing) {
      return {
        conv: {
          id: String(existing.id),
          clientId: sess.cid,
          botId: sess.bid,
          visitorId: sess.vid,
          pagePath: page?.path ?? null,
          messages: json<Conversation['messages']>(existing.messages_json, []),
          createdAt: Number(existing.created_at),
          updatedAt: Number(existing.updated_at),
        },
        isNew: false,
      };
    }
    return {
      conv: {
        id: id('cnv'),
        clientId: sess.cid,
        botId: sess.bid,
        visitorId: sess.vid,
        pagePath: page?.path ?? null,
        messages: [],
        createdAt: now(),
        updatedAt: now(),
      },
      isNew: true,
    };
  }

  async appendMessage(conv: Conversation, role: 'user' | 'assistant', content: string, feedback: 'up' | 'down' | null = null): Promise<Conversation['messages'][number]> {
    const message = { id: id('msg'), role, content, feedback, createdAt: now() };
    conv.messages.push(message);
    conv.updatedAt = now();
    const save = async () =>
      db.run(
        `INSERT INTO conversations (id, client_id, bot_id, visitor_id, page_path, messages_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET messages_json = excluded.messages_json, updated_at = excluded.updated_at, page_path = excluded.page_path`,
        conv.id, conv.clientId, conv.botId, conv.visitorId, conv.pagePath,
        JSON.stringify(conv.messages.slice(-80)), conv.createdAt, conv.updatedAt
      );
    await save();
    return message;
  }

  async saveLead(sess: WidgetSession, lead: { name: string; email: string; phone: string; message: string }, page?: PageContext): Promise<{ id: string }> {
    const leadId = id('ld_');
    await db.run(
      `INSERT INTO leads (id, client_id, bot_id, conversation_id, name, email, phone, message, page_path, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      leadId, sess.cid, sess.bid, sess.sid, lead.name, lead.email, lead.phone, lead.message,
      page?.path ?? null, now()
    );
    return { id: leadId };
  }

  async setFeedback(conversationId: string, messageId: string, feedback: 'up' | 'down'): Promise<boolean> {
    const row = await db.get('SELECT * FROM conversations WHERE id = ?', conversationId) as any;
    if (!row) return false;
    const messages = json<Conversation['messages']>(row.messages_json, []);
    const msg = messages.find((m) => m.id === messageId);
    if (!msg) return false;
    msg.feedback = feedback;
    await db.run(
      'UPDATE conversations SET messages_json = ?, updated_at = ? WHERE id = ?',
      JSON.stringify(messages), now(), conversationId
    );
    return true;
  }
}
