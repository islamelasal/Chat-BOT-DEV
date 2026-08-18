/**
 * إدارة المزودين — أي مزود OpenAI-compatible = صف بيانات فقط (بدون كود).
 * المفاتيح تُخزن مشفرة AES-256-GCM ولا تُعاد للواجهة أبداً.
 */
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
  Query,
} from '@nestjs/common';
import { db, id as uid, json, now } from '@cbd/db';
import { providerCreateSchema } from '@cbd/shared';
import { CurrentUser, Roles } from '../auth.js';
import type { AuthUser } from '../auth.js';
import { audit } from '../audit.js';
import { encryptSecret, decryptSecret } from '../crypto.js';
import { GatewayService } from '../gateway.service.js';

async function providerRowToProvider(r: any) {
  return {
    id: String(r.id),
    name: String(r.name),
    kind: String(r.kind),
    baseUrl: String(r.base_url ?? ''),
    hasKey: Boolean(String(r.api_key_enc ?? '')),
    apiKey: undefined, // لا يُعاد المفتاح أبداً
    tier: String(r.tier),
    limits: json<any>(r.limits_json, null),
    enabled: Number(r.enabled) === 1,
    createdAt: Number(r.created_at),
    models: (await db.all('SELECT * FROM models WHERE provider_id = ? ORDER BY free DESC, name ASC', r.id) as any[]).map((m) => ({
      id: String(m.id),
      name: String(m.name),
      contextWindow: Number(m.context_window),
      costPer1MIn: Number(m.cost_in),
      costPer1MOut: Number(m.cost_out),
      free: Number(m.free) === 1,
      enabled: Number(m.enabled) === 1,
    })),
  };
}

@Controller('providers')
export class ProvidersController {
  constructor(private readonly gateway: GatewayService) {}

  @Get()
  async list() {
    const rows = await db.all('SELECT * FROM providers ORDER BY created_at ASC') as any[];
    return Promise.all(rows.map((r: any) => providerRowToProvider(r)));
  }

  @Get('models')
  async models(@Query('providerId') providerId?: string) {
    const rows = providerId
      ? (await db.all('SELECT * FROM models WHERE provider_id = ?', providerId) as any[])
      : (await db.all('SELECT * FROM models') as any[]);
    return rows.map((m) => ({
      id: String(m.id),
      providerId: String(m.provider_id),
      name: String(m.name),
      contextWindow: Number(m.context_window),
      costPer1MIn: Number(m.cost_in),
      costPer1MOut: Number(m.cost_out),
      free: Number(m.free) === 1,
      enabled: Number(m.enabled) === 1,
    }));
  }

  @Roles('super_admin', 'operator')
  @Post()
  async create(@Body() body: unknown, @CurrentUser() user: AuthUser) {
    const parsed = providerCreateSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten().fieldErrors);
    const d = parsed.data;
    const providerId = uid('prv');
    await db.run(
      `INSERT INTO providers (id, name, kind, base_url, api_key_enc, tier, limits_json, enabled, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      providerId, d.name, d.kind, d.baseUrl, encryptSecret(d.apiKey), d.tier,
      d.limits ? JSON.stringify(d.limits) : null, now()
    );
    audit({ userId: user.id, action: 'provider.create', entity: 'provider', entityId: providerId, meta: { name: d.name, kind: d.kind } });
    return providerRowToProvider(await db.get('SELECT * FROM providers WHERE id = ?', providerId));
  }

  @Roles('super_admin', 'operator')
  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: any, @CurrentUser() user: AuthUser) {
    const r = await db.get('SELECT * FROM providers WHERE id = ?', id) as any;
    if (!r) throw new NotFoundException('مزود غير موجود');
    await db.run(
      `UPDATE providers SET name = ?, kind = ?, base_url = ?, tier = ?, limits_json = ?, enabled = ? WHERE id = ?`,
      body.name ?? r.name, body.kind ?? r.kind, body.baseUrl ?? r.base_url, body.tier ?? r.tier,
      body.limits !== undefined ? JSON.stringify(body.limits) : r.limits_json,
      (body.enabled ?? Number(r.enabled) === 1) ? 1 : 0, id
    );
    // تحديث المفتاح فقط إذا أُرسل مفتاح جديد (لا نعيد المفتاح القديم)
    if (typeof body.apiKey === 'string' && body.apiKey.length > 0) {
      await db.run('UPDATE providers SET api_key_enc = ? WHERE id = ?', encryptSecret(body.apiKey), id);
    }
    audit({ userId: user.id, action: 'provider.update', entity: 'provider', entityId: id });
    return providerRowToProvider(await db.get('SELECT * FROM providers WHERE id = ?', id));
  }

  @Roles('super_admin', 'operator')
  @Post(':id/test')
  async test(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    const r = await db.get('SELECT * FROM providers WHERE id = ?', id) as any;
    if (!r) throw new NotFoundException('مزود غير موجود');
    const adapter = this.gateway.buildAdapter(r);
    const started = Date.now();
    const health = await adapter.ping();
    const models = await adapter.listModels().catch(() => []);
    audit({ userId: user.id, action: 'provider.test', entity: 'provider', entityId: id, meta: { ok: health.ok } });
    return {
      ok: health.ok,
      latencyMs: Date.now() - started,
      message: health.message,
      quota: health.quota,
      modelsFound: models.slice(0, 20),
    };
  }

  @Roles('super_admin', 'operator')
  @Post(':id/refresh-models')
  async refreshModels(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    const r = await db.get('SELECT * FROM providers WHERE id = ?', id) as any;
    if (!r) throw new NotFoundException('مزود غير موجود');
    const adapter = this.gateway.buildAdapter(r);
    const models = await adapter.listModels().catch(() => []);
    let added = 0;
    for (const name of models) {
      const exists = await db.get('SELECT id FROM models WHERE provider_id = ? AND name = ?', id, name);
      if (!exists) {
        await db.run(
          `INSERT INTO models (id, provider_id, name, context_window, cost_in, cost_out, free, enabled)
           VALUES (?, ?, ?, 131072, 0, 0, 1, 1)`,
          uid('mdl'), id, name
        );
        added++;
      }
    }
    audit({ userId: user.id, action: 'provider.refresh_models', entity: 'provider', entityId: id, meta: { added } });
    return { found: models.length, added };
  }

  @Roles('super_admin')
  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    await db.run('DELETE FROM models WHERE provider_id = ?', id);
    await db.run('DELETE FROM providers WHERE id = ?', id);
    audit({ userId: user.id, action: 'provider.delete', entity: 'provider', entityId: id });
    return { ok: true };
  }
}
