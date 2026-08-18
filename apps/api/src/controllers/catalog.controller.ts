/**
 * كتالوج منتجات العملاء — الفيد الحي
 * GET  /catalog                      → حالة كل الكتالوجات
 * GET  /catalog/:clientId/products   → منتجات (بحث/تصنيف/ترقيم صفحات)
 * GET  /catalog/:clientId/stats      → إحصائيات + سجل التغييرات
 * POST /catalog/:clientId/sync       → مزامنة يدوية فورية (مشرف/مشغّل)
 */
import { BadRequestException, Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { Roles } from '../auth.js';
import type { AuthUser } from '../auth.js';
import { CurrentUser } from '../auth.js';
import { audit } from '../audit.js';
import { CatalogService } from '../catalog.service.js';
import { config } from '../config.js';

@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  async list() {
    return this.catalog.listCatalogs();
  }

  @Get(':clientId/products')
  async products(
    @Param('clientId') clientId: string,
    @Query('q') q?: string,
    @Query('category') category?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string
  ) {
    return this.catalog.getProducts(clientId, {
      q: q?.trim() || undefined,
      category: category?.trim() || undefined,
      limit: Number(limit ?? 100),
      offset: Number(offset ?? 0),
    });
  }

  @Get(':clientId/stats')
  async stats(@Param('clientId') clientId: string) {
    return this.catalog.getStats(clientId);
  }

  @Roles('super_admin', 'operator')
  @Post(':clientId/sync')
  async sync(
    @Param('clientId') clientId: string,
    @Body() body: { sourceUrl?: string },
    @CurrentUser() user: AuthUser
  ) {
    // تجاوز الرابط مسموح فقط في وضع الديمو (للاختبار المحلي) — الإنتاج يلتزم بالرابط المضبوط
    const override = body?.sourceUrl?.trim();
    if (override && !config.DEMO_MODE) {
      throw new BadRequestException('تغيير رابط الفيد غير مسموح في وضع الإنتاج');
    }
    const summary = await this.catalog.syncClientCatalog(clientId, { sourceUrl: override || undefined });
    audit({
      userId: user.id,
      action: 'catalog.sync',
      entity: 'catalog',
      entityId: clientId,
      meta: { ok: summary.ok, total: summary.total, inserted: summary.inserted, updated: summary.updated, error: summary.error },
    });
    return summary;
  }
}
