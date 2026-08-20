import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard, RolesGuard } from './auth.js';
import { GatewayService } from './gateway.service.js';
import { WidgetService } from './widget.service.js';
import { AuthController } from './controllers/auth.controller.js';
import { RootController } from './controllers/root.controller.js';
import { ClientsController } from './controllers/clients.controller.js';
import { BotsController } from './controllers/bots.controller.js';
import { ProvidersController } from './controllers/providers.controller.js';
import { GatewayController } from './controllers/gateway.controller.js';
import { WidgetController } from './controllers/widget.controller.js';
import { StatusController } from './controllers/status.controller.js';
import { UsageController } from './controllers/usage.controller.js';
import { ConversationsController } from './controllers/conversations.controller.js';
import { LeadsController } from './controllers/leads.controller.js';
import { CatalogController } from './controllers/catalog.controller.js';
import { CatalogService } from './catalog.service.js';
import { OrderTrackingService } from './order-tracking.service.js';
import { WebhooksService } from './webhooks.service.js';
import { WebhooksController } from './controllers/webhooks.controller.js';

@Module({
  providers: [
    GatewayService,
    WidgetService,
    CatalogService,
    OrderTrackingService,
    WebhooksService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  controllers: [
    RootController,
    AuthController,
    ClientsController,
    BotsController,
    ProvidersController,
    GatewayController,
    WidgetController,
    StatusController,
    UsageController,
    ConversationsController,
    LeadsController,
    CatalogController,
    WebhooksController,
  ],
})
export class AppModule {}
