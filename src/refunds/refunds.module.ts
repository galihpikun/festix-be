import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { RefundsController } from './refunds.controller';
import { RefundsAdminController } from './refunds-admin.controller';
import { RefundsWebhookController } from './refunds-webhook.controller';
import { RefundsService } from './refunds.service';
import { RefundsCalculator } from './refunds.calculator';
import { RefundsXenditService } from './refunds-xendit.service';

@Module({
  imports: [PrismaModule, AuditLogsModule],
  controllers: [
    RefundsController,
    RefundsAdminController,
    RefundsWebhookController,
  ],
  providers: [RefundsService, RefundsCalculator, RefundsXenditService],
  exports: [RefundsService],
})
export class RefundsModule {}
