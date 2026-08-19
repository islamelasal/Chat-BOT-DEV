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

  @Get('jobs/:jobId')
  job(@Param('jobId') jobId: string) {
    const job = this.catalog.getJob(jobId);
    if (!job) throw new BadRequestException('الوظيفة غير موجودة');
    return job;
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

  /** رفع فيد يدوي (مواصفة v2): نص الفيد يُحلل فوراً — حتى 8MB */
  @Roles('super_admin', 'operator')
  @Post(':clientId/upload')
  async upload(@Param('clientId') clientId: string, @Body() body: { feed: string }, @CurrentUser() user: AuthUser) {
    const feed = String(body?.feed ?? '').trim();
    if (!feed) throw new BadRequestException('نص الفيد فارغ');
    if (feed.length > 64 * 1024 * 1024) throw new BadRequestException('حجم الفيد يتجاوز 64 ميجابايت');
    const { jobId, alreadyRunning } = this.catalog.startSyncJob(clientId, { feedText: feed });
    audit({
      userId: user.id,
      action: 'catalog.upload',
      entity: 'catalog',
      entityId: clientId,
      meta: { jobId, alreadyRunning: Boolean(alreadyRunning), feedSize: feed.length },
    });
    return { async: true, jobId, alreadyRunning: Boolean(alreadyRunning) };
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
    const { jobId, alreadyRunning } = this.catalog.startSyncJob(clientId, { sourceUrl: override || undefined });
    audit({
      userId: user.id,
      action: 'catalog.sync',
      entity: 'catalog',
      entityId: clientId,
      meta: { jobId, alreadyRunning: Boolean(alreadyRunning) },
    });
    return { async: true, jobId, alreadyRunning: Boolean(alreadyRunning) };
  }
}
