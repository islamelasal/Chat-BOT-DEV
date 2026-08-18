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
} from '@nestjs/common';
import { db, id as uid, json, now } from '@cbd/db';
import { brandUpdateSchema, clientCreateSchema, clientUpdateSchema, themeUpdateSchema } from '@cbd/shared';
import { CurrentUser, Roles } from '../auth.js';
import type { AuthUser } from '../auth.js';
import { audit } from '../audit.js';

async function clientRowToClient(r: any) {
  return {
    id: String(r.id),
    name: String(r.name),
    siteUrl: String(r.site_url),
    email: String(r.email),
    phone: r.phone ? String(r.phone) : null,
    plan: String(r.plan),
    status: String(r.status),
    brand: json<any>(r.brand_json, {}),
    theme: json<any>(r.theme_json, {}),
    domains: (await db.all('SELECT domain FROM domains WHERE client_id = ?', r.id) as any[]).map((d) => String(d.domain)),
    monthlyLimit: Number(r.monthly_limit),
    dailyLimit: Number(r.daily_limit),
    createdAt: Number(r.created_at),
  };
}

@Controller('clients')
export class ClientsController {
  @Get()
  async list(@CurrentUser() user: AuthUser) {
    const rows = await db.all('SELECT * FROM clients ORDER BY created_at DESC') as any[];
    return Promise.all(rows.map((r: any) => clientRowToClient(r)));
  }

  @Roles('super_admin', 'operator')
  @Post()
  async create(@Body() body: unknown, @CurrentUser() user: AuthUser) {
    const parsed = clientCreateSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten().fieldErrors);
    const d = parsed.data;
    const clientId = uid('clt');
    await db.run(
      `INSERT INTO clients (id, name, site_url, email, phone, plan, status, brand_json, theme_json, monthly_limit, daily_limit, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'active', '{}', '{}', ?, ?, ?)`,
      clientId, d.name, d.siteUrl, d.email, d.phone ?? null, d.plan, d.monthlyMsgLimit, d.dailyMsgLimit, now()
    );
    for (const domain of d.domains) {
      await db.run('INSERT INTO domains (client_id, domain) VALUES (?, ?) ON CONFLICT DO NOTHING', clientId, domain);
    }
    audit({ userId: user.id, action: 'client.create', entity: 'client', entityId: clientId, meta: { name: d.name } });
    return clientRowToClient(await db.get('SELECT * FROM clients WHERE id = ?', clientId));
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const r = await db.get('SELECT * FROM clients WHERE id = ?', id) as any;
    if (!r) throw new NotFoundException('عميل غير موجود');
    return clientRowToClient(r);
  }

  @Roles('super_admin', 'operator')
  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: AuthUser) {
    const parsed = clientUpdateSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten().fieldErrors);
    const r = await db.get('SELECT * FROM clients WHERE id = ?', id) as any;
    if (!r) throw new NotFoundException('عميل غير موجود');
    const d = parsed.data;
    await db.run(
      `UPDATE clients SET name = ?, site_url = ?, email = ?, phone = ?, plan = ?, status = ?, monthly_limit = ?, daily_limit = ? WHERE id = ?`,
      d.name ?? r.name, d.siteUrl ?? r.site_url, d.email ?? r.email,
      d.phone !== undefined ? d.phone : r.phone, d.plan ?? r.plan, d.status ?? r.status,
      d.monthlyMsgLimit ?? r.monthly_limit, d.dailyMsgLimit ?? r.daily_limit, id
    );
    audit({ userId: user.id, action: 'client.update', entity: 'client', entityId: id });
    return clientRowToClient(await db.get('SELECT * FROM clients WHERE id = ?', id));
  }

  @Roles('super_admin')
  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    await db.run('DELETE FROM domains WHERE client_id = ?', id);
    await db.run('DELETE FROM clients WHERE id = ?', id);
    audit({ userId: user.id, action: 'client.delete', entity: 'client', entityId: id });
    return { ok: true };
  }

  @Roles('super_admin', 'operator')
  @Put(':id/brand')
  async brand(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: AuthUser) {
    const parsed = brandUpdateSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten().fieldErrors);
    const r = await db.get('SELECT * FROM clients WHERE id = ?', id) as any;
    if (!r) throw new NotFoundException('عميل غير موجود');
    const brand = { ...json<any>(r.brand_json, {}), ...parsed.data };
    await db.run('UPDATE clients SET brand_json = ? WHERE id = ?', JSON.stringify(brand), id);
    audit({ userId: user.id, action: 'client.brand', entity: 'client', entityId: id });
    return { brand };
  }

  @Roles('super_admin', 'operator')
  @Put(':id/theme')
  async theme(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: AuthUser) {
    const parsed = themeUpdateSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten().fieldErrors);
    const r = await db.get('SELECT * FROM clients WHERE id = ?', id) as any;
    if (!r) throw new NotFoundException('عميل غير موجود');
    await db.run('UPDATE clients SET theme_json = ? WHERE id = ?', JSON.stringify(parsed.data), id);
    audit({ userId: user.id, action: 'client.theme', entity: 'client', entityId: id });
    return { theme: parsed.data };
  }

  @Roles('super_admin', 'operator')
  @Put(':id/domains')
  async domains(@Param('id') id: string, @Body() body: { domains: string[] }, @CurrentUser() user: AuthUser) {
    if (!Array.isArray(body?.domains)) throw new BadRequestException('قائمة domains مطلوبة');
    await db.run('DELETE FROM domains WHERE client_id = ?', id);
    for (const domain of body.domains.slice(0, 50)) {
      const clean = String(domain).trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
      if (clean) await db.run('INSERT INTO domains (client_id, domain) VALUES (?, ?) ON CONFLICT DO NOTHING', id, clean);
    }
    audit({ userId: user.id, action: 'client.domains', entity: 'client', entityId: id });
    return { domains: (await db.all('SELECT domain FROM domains WHERE client_id = ?', id) as any[]).map((d) => String(d.domain)) };
  }

  @Get(':id/snippet')
  async snippet(@Param('id') id: string) {
    const r = await db.get('SELECT * FROM clients WHERE id = ?', id) as any;
    if (!r) throw new NotFoundException('عميل غير موجود');
    const scriptSrc = process.env.WIDGET_SCRIPT_URL || '/w.js';
    return {
      snippet: `<!-- Chat Bot Dev — ${r.name} -->\n<script src="${scriptSrc}?id=${id}" async defer></script>`,
      instructions: [
        'الصق المقتطف قبل وسم </body> مباشرة في قالب موقعك.',
        'CS-Cart / Unitheme2: من لوحة التحكم → التصميم → التخطيطات، أضف كتلة HTML بالمقتطف، أو عبر إضافة خاصة (متوفرة لاحقاً).',
        'WordPress: من المظهر → محرر ملفات القالب (footer.php) أو عبر إضافة Header/Footer scripts.',
        'أي موقع HTML: داخل index.html قبل </body>.',
        'بعد التركيب: امسح كاش الموقع ثم اختبر على صفحة منتج وصفحة سياسة.',
      ],
    };
  }

  @Get(':id/stats')
  async stats(@Param('id') id: string) {
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const q = async (since: number) =>
      db.get(
        `SELECT COUNT(*) AS msgs, COALESCE(SUM(tokens_in),0) AS tin, COALESCE(SUM(tokens_out),0) AS tout, COALESCE(SUM(cost_usd),0) AS cost
         FROM usage_events WHERE client_id = ? AND created_at >= ?`,
        id, since
      ) as any;
    const today = await q(dayStart.getTime());
    const month = await q(monthStart.getTime());
    const convs = await db.get(
      'SELECT COUNT(DISTINCT visitor_id) AS visitors, COUNT(*) AS convs FROM conversations WHERE client_id = ? AND updated_at >= ?',
      id, dayStart.getTime()
    ) as any;
    return {
      today: { messages: Number(today.msgs ?? 0), tokensIn: Number(today.tin ?? 0), tokensOut: Number(today.tout ?? 0), costUsd: Number(today.cost ?? 0) },
      month: { messages: Number(month.msgs ?? 0), tokensIn: Number(month.tin ?? 0), tokensOut: Number(month.tout ?? 0), costUsd: Number(month.cost ?? 0) },
      visitorsToday: Number(convs.visitors ?? 0),
      conversationsToday: Number(convs.convs ?? 0),
    };
  }
}
