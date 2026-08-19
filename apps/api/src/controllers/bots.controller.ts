import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { db, id as uid, json, now } from '@cbd/db';
import { botCreateSchema, knowledgeChunkSchema, routingPolicySchema } from '@cbd/shared';
import { CurrentUser, Roles } from '../auth.js';
import type { AuthUser } from '../auth.js';
import { audit } from '../audit.js';
import { crawlUrl, isPrivateUrl } from '../crawl.js';
import { config } from '../config.js';

async function botRowToBot(r: any) {
  return {
    id: String(r.id),
    clientId: String(r.client_id),
    name: String(r.name),
    description: String(r.description ?? ''),
    persona: String(r.persona),
    language: String(r.language),
    maxReplyLength: Number(r.max_reply_len),
    forbiddenTopics: json<string[]>(r.forbidden_json, []),
    knowledgeChunks: (await db.all('SELECT * FROM knowledge_chunks WHERE bot_id = ? ORDER BY created_at DESC', r.id) as any[]).map((k) => ({
      id: String(k.id),
      title: String(k.title),
      content: String(k.content),
      source: String(k.source),
    })),
    routing: json<any>(r.routing_json, { strategy: 'priority-failover', tiers: [] }),
    active: Number(r.active) === 1,
    isDefault: Number(r.is_default) === 1,
    welcomeMsg: String(r.welcome_msg ?? ''),
    suggestions: json<string[]>(r.suggestions_json, []),
    fallbackMsg: String(r.fallback_msg ?? ''),
    createdAt: Number(r.created_at),
  };
}

@Controller('bots')
export class BotsController {
  @Get()
  async list(@Query('clientId') clientId?: string) {
    const rows = clientId
      ? (await db.all('SELECT * FROM bots WHERE client_id = ? ORDER BY created_at DESC', clientId) as any[])
      : (await db.all('SELECT * FROM bots ORDER BY created_at DESC') as any[]);
    return Promise.all(rows.map((r: any) => botRowToBot(r)));
  }

  @Roles('super_admin', 'operator')
  @Post()
  async create(@Body() body: unknown, @CurrentUser() user: AuthUser) {
    const parsed = botCreateSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten().fieldErrors);
    const d = parsed.data;
    const client = await db.get('SELECT id FROM clients WHERE id = ?', d.clientId) as any;
    if (!client) throw new BadRequestException('العميل غير موجود');
    const botId = uid('bot');
    await db.run(
      `INSERT INTO bots (id, client_id, name, description, persona, language, max_reply_len, forbidden_json, routing_json, active, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      botId, d.clientId, d.name, d.description, d.persona, d.language, d.maxReplyLength,
      JSON.stringify(d.forbiddenTopics),
      JSON.stringify({ strategy: 'smart-auto', tiers: [] }),
      d.active ? 1 : 0, now()
    );
    audit({ userId: user.id, action: 'bot.create', entity: 'bot', entityId: botId, meta: { name: d.name, clientId: d.clientId } });
    return botRowToBot(await db.get('SELECT * FROM bots WHERE id = ?', botId));
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const r = await db.get('SELECT * FROM bots WHERE id = ?', id) as any;
    if (!r) throw new NotFoundException('بوت غير موجود');
    return botRowToBot(r);
  }

  @Roles('super_admin', 'operator')
  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: Partial<Record<string, any>>, @CurrentUser() user: AuthUser) {
    const r = await db.get('SELECT * FROM bots WHERE id = ?', id) as any;
    if (!r) throw new NotFoundException('بوت غير موجود');
    await db.run(
      `UPDATE bots SET name = ?, description = ?, persona = ?, language = ?, max_reply_len = ?, forbidden_json = ?, active = ? WHERE id = ?`,
      body.name ?? r.name, body.description ?? r.description, body.persona ?? r.persona,
      body.language ?? r.language, body.maxReplyLength ?? r.max_reply_len,
      JSON.stringify(body.forbiddenTopics ?? json<string[]>(r.forbidden_json, [])),
      (body.active ?? Number(r.active) === 1) ? 1 : 0, id
    );
    audit({ userId: user.id, action: 'bot.update', entity: 'bot', entityId: id });
    return botRowToBot(await db.get('SELECT * FROM bots WHERE id = ?', id));
  }

  @Roles('super_admin', 'operator')
  @Put(':id/routing')
  async routing(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: AuthUser) {
    const parsed = routingPolicySchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten().fieldErrors);
    const r = await db.get('SELECT id FROM bots WHERE id = ?', id) as any;
    if (!r) throw new NotFoundException('بوت غير موجود');
    await db.run('UPDATE bots SET routing_json = ? WHERE id = ?', JSON.stringify(parsed.data), id);
    audit({ userId: user.id, action: 'bot.routing', entity: 'bot', entityId: id, meta: { strategy: parsed.data.strategy } });
    return { routing: parsed.data };
  }

  @Roles('super_admin', 'operator')
  @Post(':id/knowledge')
  async knowledge(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: AuthUser) {
    const parsed = knowledgeChunkSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten().fieldErrors);
    const r = await db.get('SELECT id FROM bots WHERE id = ?', id) as any;
    if (!r) throw new NotFoundException('بوت غير موجود');
    const chunkId = uid('kn');
    await db.run(
      `INSERT INTO knowledge_chunks (id, bot_id, title, content, source, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
      chunkId, id, parsed.data.title, parsed.data.content, parsed.data.source, now()
    );
    audit({ userId: user.id, action: 'bot.knowledge_add', entity: 'bot', entityId: id, meta: { title: parsed.data.title } });
    return { id: chunkId, ...parsed.data };
  }

  @Roles('super_admin', 'operator')
  @Post(':id/crawl')
  async crawl(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: AuthUser) {
    const r = await db.get('SELECT id FROM bots WHERE id = ?', id) as any;
    if (!r) throw new NotFoundException('بوت غير موجود');
    const urls = (Array.isArray((body as any)?.urls) ? (body as any).urls : [])
      .map((u: unknown) => String(u).trim())
      .filter((u: string) => /^https?:\/\/[^\s]+$/.test(u))
      .slice(0, 10);
    if (!urls.length) throw new BadRequestException('أدخل رابطاً صحيحاً واحداً على الأقل (يبدأ بـ http)');

    // حارس SSRF (مع DNS Pinning): منع زحف الشبكات الداخلية إلا في وضع الديمو
    if (!config.CRAWL_ALLOW_PRIVATE) {
      for (const u of urls) {
        if (await isPrivateUrl(u)) {
          throw new BadRequestException(`ممنوع زحف العناوين الداخلية: ${u}`);
        }
      }
    }

    let added = 0;
    let skipped = 0;
    const errors: Array<{ url: string; error: string }> = [];
    const titles: string[] = [];

    for (const url of urls) {
      try {
        const result = await crawlUrl(url);
        titles.push(result.title);
        for (const chunk of result.chunks) {
          // منع تكرار نفس المصدر عند إعادة الزحف
          const exists = await db.get(
            'SELECT id FROM knowledge_chunks WHERE bot_id = ? AND source = ? AND title = ?',
            id, url, chunk.title
          );
          if (exists) {
            skipped++;
            continue;
          }
          await db.run(
            `INSERT INTO knowledge_chunks (id, bot_id, title, content, source, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
            uid('kn'), id, chunk.title, chunk.content, url, now()
          );
          added++;
        }
      } catch (err) {
        errors.push({ url, error: (err as Error).message });
      }
    }

    audit({
      userId: user.id,
      action: 'bot.crawl',
      entity: 'bot',
      entityId: id,
      meta: { urls, added, skipped, errors: errors.length },
    });

    return {
      added,
      skipped,
      errors,
      titles: titles.slice(0, 5),
      total: (await db.get('SELECT COUNT(*) AS c FROM knowledge_chunks WHERE bot_id = ?', id) as any)?.c,
    };
  }

  @Roles('super_admin', 'operator')
  @Delete(':id/knowledge/:chunkId')
  async removeKnowledge(@Param('id') id: string, @Param('chunkId') chunkId: string, @CurrentUser() user: AuthUser) {
    await db.run('DELETE FROM knowledge_chunks WHERE id = ? AND bot_id = ?', chunkId, id);
    audit({ userId: user.id, action: 'bot.knowledge_remove', entity: 'bot', entityId: id });
    return { ok: true };
  }

  @Roles('super_admin')
  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    await db.run('DELETE FROM knowledge_chunks WHERE bot_id = ?', id);
    await db.run('DELETE FROM bots WHERE id = ?', id);
    audit({ userId: user.id, action: 'bot.delete', entity: 'bot', entityId: id });
    return { ok: true };
  }
}
