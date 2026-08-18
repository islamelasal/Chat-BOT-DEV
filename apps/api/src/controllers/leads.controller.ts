/**
 * العملاء المحتملون (Leads) — المُجمَّعة من ودجت مواقع العملاء
 * مع تصدير CSV جاهز لأي CRM.
 */
import { Controller, Delete, Get, NotFoundException, Param, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { db } from '@cbd/db';
import { CurrentUser, Roles } from '../auth.js';
import type { AuthUser } from '../auth.js';
import { audit } from '../audit.js';

@Controller('leads')
export class LeadsController {
  @Get()
  async list(@Query('clientId') clientId?: string, @Query('limit') limit?: string) {
    const lim = Math.min(Number(limit ?? 200), 1000);
    const rows = clientId
      ? (await db.all('SELECT * FROM leads WHERE client_id = ? ORDER BY created_at DESC LIMIT ?', clientId, lim) as any[])
      : (await db.all('SELECT * FROM leads ORDER BY created_at DESC LIMIT ?', lim) as any[]);
    return rows.map((r) => ({
      id: String(r.id),
      clientId: String(r.client_id),
      botId: String(r.bot_id),
      conversationId: r.conversation_id ? String(r.conversation_id) : null,
      name: String(r.name),
      email: String(r.email),
      phone: String(r.phone),
      message: String(r.message),
      pagePath: r.page_path ? String(r.page_path) : null,
      createdAt: Number(r.created_at),
    }));
  }

  @Get('export.csv')
  async exportCsv(@Query('clientId') clientId: string | undefined, @Res() res: Response) {
    const rows = clientId
      ? (await db.all('SELECT * FROM leads WHERE client_id = ? ORDER BY created_at DESC LIMIT 10000', clientId) as any[])
      : (await db.all('SELECT * FROM leads ORDER BY created_at DESC LIMIT 10000') as any[]);
    const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const header = ['التاريخ', 'العميل', 'الاسم', 'البريد', 'الهاتف', 'رسالة العميل', 'الصفحة'].join(',');
    const lines = rows.map((r) =>
      [
        new Date(Number(r.created_at)).toLocaleString('ar-EG'),
        r.client_id,
        r.name,
        r.email,
        r.phone,
        r.message,
        r.page_path ?? '',
      ]
        .map(escape)
        .join(',')
    );
    const csv = '\uFEFF' + [header, ...lines].join('\n'); // BOM لدعم Excel العربي
    res.status(200);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="leads-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csv);
  }

  @Roles('super_admin')
  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    const r = await db.get('SELECT id FROM leads WHERE id = ?', id);
    if (!r) throw new NotFoundException('غير موجود');
    await db.run('DELETE FROM leads WHERE id = ?', id);
    audit({ userId: user.id, action: 'lead.delete', entity: 'lead', entityId: id });
    return { ok: true };
  }
}
