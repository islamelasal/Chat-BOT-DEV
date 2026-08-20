/**
 * Webhooks الصادرة — إدارة نقاط الوصول لكل عميل
 * GET/POST /clients/:clientId/webhooks · PATCH/DELETE /clients/:clientId/webhooks/:id
 * POST :id/test · POST :id/reveal · GET :id/deliveries · POST :id/deliveries/:deliveryId/retry
 */
import { randomBytes } from 'node:crypto';
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
import { z } from 'zod';
import { db, id, json, now } from '@cbd/db';
import { CurrentUser, Roles } from '../auth.js';
import type { AuthUser } from '../auth.js';
import { audit } from '../audit.js';
import { WEBHOOK_EVENTS, WebhooksService, validateWebhookUrl } from '../webhooks.service.js';
import type { WebhookEndpointRow, WebhookDeliveryRow } from '../webhooks.service.js';

const createSchema = z.object({
  name: z.string().trim().min(1, 'الاسم مطلوب').max(80, 'الاسم طويل جداً'),
  url: z.string().trim().min(1, 'الرابط مطلوب'),
  secret: z.string().trim().max(200, 'السر طويل جداً').optional().default(''),
  events: z
    .array(z.enum(WEBHOOK_EVENTS))
    .min(1, 'اختر حدثاً واحداً على الأقل')
    .transform((a) => [...new Set(a)]),
});
const updateSchema = createSchema
  .partial()
  .extend({ active: z.boolean().optional() });

const mask = (s: string) => (s.length > 8 ? `${s.slice(0, 4)}••••${s.slice(-4)}` : '••••••••');

function toDto(r: WebhookEndpointRow) {
  return {
    id: String(r.id),
    clientId: String(r.client_id),
    name: String(r.name),
    url: String(r.url),
    secretMasked: r.secret ? mask(r.secret) : '',
    events: json<string[]>(r.events_json, []),
    active: r.active === 1,
    lastStatus: String(r.last_status),
    lastStatusAt: r.last_status_at ? Number(r.last_status_at) : null,
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
  };
}

function toDeliveryDto(r: WebhookDeliveryRow) {
  let payloadPreview = '';
  try {
    payloadPreview = JSON.stringify(JSON.parse(r.payload_json)).slice(0, 600);
  } catch {
    payloadPreview = r.payload_json.slice(0, 600);
  }
  return {
    id: String(r.id),
    endpointId: String(r.endpoint_id),
    event: String(r.event),
    payloadPreview,
    status: String(r.status),
    attempts: Number(r.attempts),
    nextAttemptAt: Number(r.next_attempt_at),
    responseCode: r.response_code == null ? null : Number(r.response_code),
    responseBody: String(r.response_body).slice(0, 500),
    error: String(r.error),
    durationMs: r.duration_ms == null ? null : Number(r.duration_ms),
    createdAt: Number(r.created_at),
  };
}

@Controller('clients/:clientId/webhooks')
export class WebhooksController {
  constructor(private readonly webhooks: WebhooksService) {}

  private async mustClient(clientId: string) {
    const row = await db.get('SELECT id FROM clients WHERE id = ?', clientId);
    if (!row) throw new NotFoundException('العميل غير موجود');
  }

  private async mustEndpoint(clientId: string, endpointId: string) {
    const row = (await db.get(
      'SELECT * FROM webhook_endpoints WHERE id = ? AND client_id = ?',
      endpointId, clientId
    )) as unknown as WebhookEndpointRow | undefined;
    if (!row) throw new NotFoundException('نقطة الوصول غير موجودة');
    return row;
  }

  @Roles('super_admin', 'operator')
  @Get()
  async list(@Param('clientId') clientId: string) {
    await this.mustClient(clientId);
    const rows = (await db.all(
      'SELECT * FROM webhook_endpoints WHERE client_id = ? ORDER BY created_at DESC',
      clientId
    )) as unknown as WebhookEndpointRow[];
    return { events: WEBHOOK_EVENTS, endpoints: rows.map(toDto) };
  }

  @Roles('super_admin', 'operator')
  @Post()
  async create(
    @Param('clientId') clientId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthUser
  ) {
    await this.mustClient(clientId);
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((i) => i.message).join(' · '));
    }
    const { name, url, secret, events } = parsed.data;
    const check = await validateWebhookUrl(url);
    if (!check.ok) throw new BadRequestException(check.reason);
    const finalSecret = secret || randomBytes(24).toString('base64url');
    const t = now();
    const endpointId = id('whe');
    await db.run(
      `INSERT INTO webhook_endpoints
         (id, client_id, name, url, secret, events_json, active, last_status, last_status_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, '', NULL, ?, ?)`,
      endpointId, clientId, name, url.trim(), finalSecret, JSON.stringify(events), t, t
    );
    audit({ userId: user.id, action: 'webhook.create', entity: 'webhook', entityId: endpointId, meta: { clientId, events } });
    return { ...toDto((await this.mustEndpoint(clientId, endpointId))), secret };
  }

  @Roles('super_admin', 'operator')
  @Patch(':id')
  async update(
    @Param('clientId') clientId: string,
    @Param('id') endpointId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthUser
  ) {
    const current = await this.mustEndpoint(clientId, endpointId);
    const parsed = updateSchema.safeParse(body ?? {});
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((i) => i.message).join(' · '));
    }
    const patch = parsed.data as Record<string, unknown>;
    if (patch.url !== undefined) {
      const check = await validateWebhookUrl(String(patch.url));
      if (!check.ok) throw new BadRequestException(check.reason);
    }
    const sets: string[] = [];
    const args: unknown[] = [];
    if (patch.name !== undefined) { sets.push('name = ?'); args.push(String(patch.name)); }
    if (patch.url !== undefined) { sets.push('url = ?'); args.push(String(patch.url).trim()); }
    if (patch.secret !== undefined) { sets.push('secret = ?'); args.push(String(patch.secret)); }
    if (patch.events !== undefined) {
      sets.push('events_json = ?'); args.push(JSON.stringify(patch.events));
      // إعادة تفعيل تلقائية عند تعديل الأحداث حتى لو آخر حالة كانت خطأ
      sets.push('active = 1');
    }
    if (patch.active !== undefined) { sets.push('active = ?'); args.push(patch.active ? 1 : 0); }
    if (!sets.length) throw new BadRequestException('لا يوجد شيء للتعديل');
    sets.push('updated_at = ?'); args.push(now());
    args.push(endpointId);
    await db.run(`UPDATE webhook_endpoints SET ${sets.join(', ')} WHERE id = ?`, ...args);
    audit({ userId: user.id, action: 'webhook.update', entity: 'webhook', entityId: endpointId, meta: { clientId, fields: Object.keys(patch) } });
    return toDto(await this.mustEndpoint(clientId, endpointId));
  }

  @Roles('super_admin', 'operator')
  @Post(':id/reveal')
  async reveal(
    @Param('clientId') clientId: string,
    @Param('id') endpointId: string,
    @CurrentUser() user: AuthUser
  ) {
    const row = await this.mustEndpoint(clientId, endpointId);
    audit({ userId: user.id, action: 'webhook.secret_revealed', entity: 'webhook', entityId: endpointId, meta: { clientId } });
    return { secret: row.secret };
  }

  @Roles('super_admin', 'operator')
  @Post(':id/test')
  async test(
    @Param('clientId') clientId: string,
    @Param('id') endpointId: string,
    @CurrentUser() user: AuthUser
  ) {
    await this.mustEndpoint(clientId, endpointId);
    audit({ userId: user.id, action: 'webhook.test', entity: 'webhook', entityId: endpointId, meta: { clientId } });
    return this.webhooks.testEndpoint(endpointId);
  }

  @Roles('super_admin', 'operator')
  @Delete(':id')
  async remove(
    @Param('clientId') clientId: string,
    @Param('id') endpointId: string,
    @CurrentUser() user: AuthUser
  ) {
    await this.mustEndpoint(clientId, endpointId);
    await db.run('DELETE FROM webhook_deliveries WHERE endpoint_id = ?', endpointId);
    await db.run('DELETE FROM webhook_endpoints WHERE id = ?', endpointId);
    audit({ userId: user.id, action: 'webhook.delete', entity: 'webhook', entityId: endpointId, meta: { clientId } });
    return { ok: true };
  }

  @Roles('super_admin', 'operator')
  @Get(':id/deliveries')
  async deliveries(
    @Param('clientId') clientId: string,
    @Param('id') endpointId: string,
    @Query('limit') limit?: string
  ) {
    await this.mustEndpoint(clientId, endpointId);
    const lim = Math.min(Number(limit ?? 50), 200);
    const rows = (await db.all(
      'SELECT * FROM webhook_deliveries WHERE endpoint_id = ? ORDER BY created_at DESC LIMIT ?',
      endpointId, lim
    )) as unknown as WebhookDeliveryRow[];
    return rows.map(toDeliveryDto);
  }

  @Roles('super_admin', 'operator')
  @Post(':id/deliveries/:deliveryId/retry')
  async retry(
    @Param('clientId') clientId: string,
    @Param('id') endpointId: string,
    @Param('deliveryId') deliveryId: string,
    @CurrentUser() user: AuthUser
  ) {
    await this.mustEndpoint(clientId, endpointId);
    try {
      await this.webhooks.retryDelivery(deliveryId);
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }
    audit({ userId: user.id, action: 'webhook.delivery_retry', entity: 'webhook', entityId: endpointId, meta: { deliveryId } });
    return { ok: true };
  }
}
