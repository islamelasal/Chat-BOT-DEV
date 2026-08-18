/**
 * ملعب تجريبي إداري — تجربة أي بوت من اللوحة قبل النشر (بث SSE)
 */
import { BadRequestException, Body, Controller, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { db } from '@cbd/db';
import { playgroundSchema } from '@cbd/shared';
import { GatewayService } from '../gateway.service.js';

@Controller('gateway')
export class GatewayController {
  constructor(private readonly gateway: GatewayService) {}

  @Post('playground')
  async playground(@Body() body: unknown, @Res() res: Response) {
    const parsed = playgroundSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('طلب غير صالح');
    const { botId, message, history } = parsed.data;

    const row = await db.get('SELECT * FROM bots WHERE id = ?', botId) as any;
    if (!row) throw new BadRequestException('بوت غير موجود');

    const bot = {
      id: String(row.id),
      clientId: String(row.client_id),
      name: String(row.name),
      description: '',
      persona: String(row.persona),
      language: String(row.language) as any,
      maxReplyLength: Number(row.max_reply_len),
      forbiddenTopics: JSON.parse(String(row.forbidden_json ?? '[]')),
      knowledgeChunks: [],
      routing: JSON.parse(String(row.routing_json ?? '{}')),
      active: true,
      createdAt: Number(row.created_at),
    };

    const result = await this.gateway.chat({ bot, clientId: bot.clientId, history }, message);

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    try {
      for await (const chunk of result.stream) {
        if (res.writableEnded || res.destroyed) break;
        if (chunk.type === 'delta' && chunk.text) {
          res.write(`data: ${JSON.stringify({ type: 'delta', text: chunk.text })}\n\n`);
        } else if (chunk.type === 'error') {
          res.write(`data: ${JSON.stringify({ type: 'error', message: chunk.message })}\n\n`);
        }
      }
      res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    } finally {
      const outcome = await result.finalize();
      res.write(`data: ${JSON.stringify({ type: 'meta', providerId: outcome.providerId, model: outcome.model, latencyMs: outcome.latencyMs, fallbackUsed: outcome.fallbackUsed, attempts: outcome.attempts, costUsd: outcome.costUsd })}\n\n`);
      if (!res.writableEnded) res.end();
    }
  }
}
