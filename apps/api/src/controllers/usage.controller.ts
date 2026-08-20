/**
 * العدادات والاستهلاك — ملخصات، سلاسل زمنية، مصالحات
 * + الأسئلة غير المجابة (لتغذية قاعدة المعرفة)
 */
import { Body, Controller, Get, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { db } from '@cbd/db';
import { CurrentUser, Roles } from '../auth.js';
import type { AuthUser } from '../auth.js';
import { audit } from '../audit.js';

@Controller('usage')
export class UsageController {
  @Get('summary')
  async summary(@Query('clientId') clientId?: string, @Query('range') range?: string) {
    const hours = range === '7d' ? 168 : range === '30d' ? 720 : 24;
    const since = Date.now() - hours * 3600_000;
    const where = clientId ? 'client_id = ?' : '1=1';
    const params = clientId ? [clientId, since] : [since];

    const totals = await db.get(
      `SELECT COUNT(*) AS msgs, COALESCE(SUM(tokens_in),0) AS tin, COALESCE(SUM(tokens_out),0) AS tout,
              COALESCE(SUM(cost_usd),0) AS cost, COALESCE(AVG(latency_ms),0) AS avgLat
       FROM usage_events WHERE ${where} AND created_at >= ?`,
      ...params
    ) as any;

    const byProvider = await db.all(
      `SELECT provider_id, COALESCE(SUM(tokens_in),0) AS tin, COALESCE(SUM(tokens_out),0) AS tout,
              COUNT(*) AS msgs, COALESCE(SUM(cost_usd),0) AS cost
       FROM usage_events WHERE ${where} AND created_at >= ?
       GROUP BY provider_id ORDER BY msgs DESC`,
      ...params
    ) as any[];

    const byModel = await db.all(
      `SELECT model, COUNT(*) AS msgs, COALESCE(SUM(tokens_in),0) AS tin, COALESCE(SUM(tokens_out),0) AS tout,
              COALESCE(SUM(cost_usd),0) AS cost
       FROM usage_events WHERE ${where} AND created_at >= ?
       GROUP BY model ORDER BY msgs DESC LIMIT 15`,
      ...params
    ) as any[];

    const byStatus = await db.all(
      `SELECT status, COUNT(*) AS c FROM usage_events WHERE ${where} AND created_at >= ? GROUP BY status`,
      ...params
    ) as any[];

    return {
      totals: {
        messages: Number(totals.msgs ?? 0),
        tokensIn: Number(totals.tin ?? 0),
        tokensOut: Number(totals.tout ?? 0),
        costUsd: Number(totals.cost ?? 0),
        avgLatencyMs: Math.round(Number(totals.avgLat ?? 0)),
      },
      byProvider: byProvider.map((r) => ({
        providerId: String(r.provider_id),
        messages: Number(r.msgs),
        tokensIn: Number(r.tin),
        tokensOut: Number(r.tout),
        costUsd: Number(r.cost),
      })),
      byModel: byModel.map((r) => ({
        model: String(r.model),
        messages: Number(r.msgs),
        tokensIn: Number(r.tin),
        tokensOut: Number(r.tout),
        costUsd: Number(r.cost),
      })),
      byStatus: Object.fromEntries(byStatus.map((r) => [String(r.status), Number(r.c)])),
    };
  }

  @Get('series')
  async series(@Query('clientId') clientId?: string, @Query('range') range?: string) {
    const hours = range === '7d' ? 168 : 24;
    const since = Date.now() - hours * 3600_000;
    const bucketMs = 3600_000;
    const where = clientId ? 'client_id = ? AND ' : '';
    const params = clientId ? [clientId, since] : [since];
    const rows = await db.all(
      `SELECT created_at, tokens_in, tokens_out, cost_usd FROM usage_events
       WHERE ${where} created_at >= ? ORDER BY created_at ASC`,
      ...params
    ) as any[];
    const buckets = new Map<number, { t: number; messages: number; tokensIn: number; tokensOut: number; costUsd: number }>();
    for (const r of rows) {
      const bucket = Math.floor(Number(r.created_at) / bucketMs) * bucketMs;
      const b = buckets.get(bucket) ?? { t: bucket, messages: 0, tokensIn: 0, tokensOut: 0, costUsd: 0 };
      b.messages++;
      b.tokensIn += Number(r.tokens_in ?? 0);
      b.tokensOut += Number(r.tokens_out ?? 0);
      b.costUsd += Number(r.cost_usd ?? 0);
      buckets.set(bucket, b);
    }
    return [...buckets.values()].sort((a, b) => a.t - b.t);
  }

  /** الأسئلة غير المجابة — الأكثر تكراراً لكل عميل/بوت (مرتبة تنازلياً بالعدّاد) */
  @Get('unanswered')
  async unanswered(
    @Query('clientId') clientId?: string,
    @Query('botId') botId?: string,
    @Query('status') status?: string,
    @Query('limit') limit?: string
  ) {
    const lim = Math.min(Number(limit ?? 50), 200);
    const conds: string[] = [];
    const params: unknown[] = [];
    if (clientId) { conds.push('client_id = ?'); params.push(clientId); }
    if (botId) { conds.push('bot_id = ?'); params.push(botId); }
    if (status === 'open' || status === 'resolved') { conds.push('status = ?'); params.push(status); }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const rows = await db.all(
      `SELECT * FROM unanswered_questions ${where} ORDER BY count DESC, last_at DESC LIMIT ?`,
      ...params, lim
    ) as any[];
    const bots = await db.all('SELECT id, name FROM bots') as any[];
    return rows.map((r) => ({
      id: String(r.id),
      clientId: String(r.client_id),
      botId: String(r.bot_id),
      botName: bots.find((b) => String(b.id) === String(r.bot_id))?.name ?? String(r.bot_id),
      question: String(r.question),
      count: Number(r.count),
      status: String(r.status),
      firstAt: Number(r.first_at),
      lastAt: Number(r.last_at),
    }));
  }

  /** حلّ/تجاهل سؤال غير مجاب (بعد إضافة محتواه لقاعدة المعرفة مثلاً) */
  @Roles('super_admin', 'operator')
  @Post('unanswered/:id/resolve')
  async resolveUnanswered(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthUser
  ) {
    const row = await db.get('SELECT id FROM unanswered_questions WHERE id = ?', id);
    if (!row) throw new NotFoundException('السؤال غير موجود');
    const status = (body as { status?: string })?.status === 'open' ? 'open' : 'resolved';
    await db.run('UPDATE unanswered_questions SET status = ? WHERE id = ?', status, id);
    audit({ userId: user.id, action: 'unanswered.resolve', entity: 'unanswered', entityId: id, meta: { status } });
    return { ok: true, status };
  }

  @Get('reconciliation')
  async reconciliation() {
    // مقارنة عداداتنا بمجموع الجداول اليومية (تحقق الاتساق الداخلي)
    const events = await db.get(
      `SELECT COUNT(*) AS c, COALESCE(SUM(tokens_in),0) AS tin, COALESCE(SUM(tokens_out),0) AS tout FROM usage_events`
    ) as any;
    const daily = await db.get(
      `SELECT COALESCE(SUM(msg_count),0) AS c, COALESCE(SUM(tokens_in),0) AS tin, COALESCE(SUM(tokens_out),0) AS tout FROM usage_daily`
    ) as any;
    const driftMsgs = Number(events.c ?? 0) - Number(daily.c ?? 0);
    return {
      status: Math.abs(driftMsgs) <= 2 ? 'ok' : 'drift',
      events: { messages: Number(events.c ?? 0), tokensIn: Number(events.tin ?? 0), tokensOut: Number(events.tout ?? 0) },
      dailyRollups: { messages: Number(daily.c ?? 0), tokensIn: Number(daily.tin ?? 0), tokensOut: Number(daily.tout ?? 0) },
      driftMessages: driftMsgs,
      note: 'المصالحات مع فواتير المزودين تُفعَّل تلقائياً عند توفر مفتاح يستدعي /usage.',
    };
  }
}
