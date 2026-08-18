/**
 * العدادات والاستهلاك — ملخصات، سلاسل زمنية، مصالحات
 */
import { Controller, Get, Query } from '@nestjs/common';
import { db } from '@cbd/db';

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
