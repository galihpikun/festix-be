import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { IssuedTicketsModule } from '../issued-tickets/issued-tickets.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({
  imports: [PrismaModule, IssuedTicketsModule],
  controllers: [PaymentsController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
