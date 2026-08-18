import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { db, json } from '@cbd/db';

@Controller('conversations')
export class ConversationsController {
  @Get()
  async list(@Query('clientId') clientId?: string, @Query('limit') limit?: string) {
    const lim = Math.min(Number(limit ?? 50), 200);
    const rows = clientId
      ? (await db.all('SELECT * FROM conversations WHERE client_id = ? ORDER BY updated_at DESC LIMIT ?', clientId, lim) as any[])
      : (await db.all('SELECT * FROM conversations ORDER BY updated_at DESC LIMIT ?', lim) as any[]);
    return rows.map((r) => {
      const messages = json<any[]>(r.messages_json, []);
      const lastUser = [...messages].reverse().find((m) => m.role === 'user');
      return {
        id: String(r.id),
        clientId: String(r.client_id),
        botId: String(r.bot_id),
        visitorId: String(r.visitor_id),
        pagePath: r.page_path ? String(r.page_path) : null,
        messageCount: messages.length,
        lastMessage: lastUser ? String(lastUser.content).slice(0, 120) : '',
        updatedAt: Number(r.updated_at),
      };
    });
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const r = await db.get('SELECT * FROM conversations WHERE id = ?', id) as any;
    if (!r) throw new NotFoundException('محادثة غير موجودة');
    return {
      id: String(r.id),
      clientId: String(r.client_id),
      botId: String(r.bot_id),
      visitorId: String(r.visitor_id),
      pagePath: r.page_path ? String(r.page_path) : null,
      messages: json<any[]>(r.messages_json, []),
      createdAt: Number(r.created_at),
      updatedAt: Number(r.updated_at),
    };
  }
}
