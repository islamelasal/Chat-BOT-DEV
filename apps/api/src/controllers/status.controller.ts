/**
 * حالة النظام الحية — نبضات، دوائر، تنبيهات، إحصاءات
 * (النقطة الوحيدة التي تعرض فيها اللوحة كل شيء في شاشة واحدة)
 */
import { Controller, Get, Param, Post } from '@nestjs/common';
import { cache, db, getProviderHealthRaw, now } from '@cbd/db';
import { GatewayService } from '../gateway.service.js';
import { CurrentUser, Roles } from '../auth.js';
import type { AuthUser } from '../auth.js';
import { audit } from '../audit.js';

@Controller('status')
export class StatusController {
  constructor(private readonly gateway: GatewayService) {}

  @Get('overview')
  async overview() {
    const providers = await db.all('SELECT * FROM providers WHERE enabled = 1') as any[];
    const providerStatus = await Promise.all(providers.map(async (p) => {
      const h = await getProviderHealthRaw(String(p.id));
      const circuits = this.gateway.breakers
        .allStatuses()
        .filter((s) => s.key.startsWith(`${p.id}:`));
      return {
        providerId: String(p.id),
        providerName: String(p.name),
        kind: String(p.kind),
        tier: String(p.tier),
        hasKey: Boolean(String(p.api_key_enc ?? '')),
        lastPulse: h.lastPulse,
        ok: h.ok,
        ewmaLatencyMs: h.ewmaLatencyMs,
        successRate: h.successRate,
        circuits: circuits.map((c) => ({
          model: c.key.split(':').slice(1).join(':'),
          state: c.state,
          failures: c.failures,
          retryAt: c.retryAt,
        })),
      };
    }));

    const workerPulse = await cache.get('worker:pulse:main');
    const workerAlive = workerPulse != null && now() - Number(workerPulse) < 180_000;

    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const today = await db.get(
      `SELECT COUNT(*) AS msgs, COALESCE(SUM(tokens_in),0) AS tin, COALESCE(SUM(tokens_out),0) AS tout, COALESCE(SUM(cost_usd),0) AS cost
       FROM usage_events WHERE created_at >= ?`,
      dayStart.getTime()
    ) as any;
    const errs = await db.get(
      `SELECT COUNT(*) AS c FROM usage_events WHERE status = 'error' AND created_at >= ?`,
      dayStart.getTime()
    ) as any;
    const alerts = await db.all(
      `SELECT * FROM alerts WHERE resolved_at IS NULL ORDER BY created_at DESC LIMIT 20`
    ) as any[];

    return {
      worker: { alive: workerAlive, lastPulse: workerPulse ? Number(workerPulse) : null },
      providers: providerStatus,
      today: {
        messages: Number(today.msgs ?? 0),
        tokensIn: Number(today.tin ?? 0),
        tokensOut: Number(today.tout ?? 0),
        costUsd: Number(today.cost ?? 0),
        errors: Number(errs.c ?? 0),
      },
      alerts: alerts.map((a) => ({
        id: String(a.id),
        type: String(a.type),
        severity: String(a.severity),
        title: String(a.title),
        body: String(a.body),
        createdAt: Number(a.created_at),
      })),
      circuits: this.gateway.breakers.allStatuses(),
    };
  }

  @Get('heartbeats')
  async heartbeats() {
    const rows = await db.all(
      `SELECT h.*, p.name AS provider_name FROM heartbeat_logs h
       LEFT JOIN providers p ON p.id = h.provider_id
       ORDER BY h.at DESC LIMIT 200`
    ) as any[];
    return rows.map((r) => ({
      id: String(r.id),
      providerId: String(r.provider_id),
      providerName: String(r.provider_name ?? r.provider_id),
      ok: Number(r.ok) === 1,
      latencyMs: Number(r.latency_ms),
      message: String(r.message),
      at: Number(r.at),
    }));
  }

  @Roles('super_admin', 'operator')
  @Post('pulse-now')
  async pulseNow(@CurrentUser() user: AuthUser) {
    // نبضة فورية يدوية (يستخدمها العامل المشترك)
    audit({ userId: user.id, action: 'status.pulse_now', entity: 'status' });
    return { ok: true, note: 'النابض الدوري يعمل تلقائياً كل 30 ثانية' };
  }

  @Roles('super_admin')
  @Post('alerts/:id/resolve')
  async resolveAlert(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    await db.run('UPDATE alerts SET resolved_at = ? WHERE id = ?', now(), id);
    audit({ userId: user.id, action: 'alert.resolve', entity: 'alert', entityId: id });
    return { ok: true };
  }
}
