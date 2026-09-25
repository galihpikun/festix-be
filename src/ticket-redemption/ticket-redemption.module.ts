import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { TicketRedemptionController } from './ticket-redemption.controller';
import { TicketRedemptionService } from './ticket-redemption.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [TicketRedemptionController],
  providers: [TicketRedemptionService],
})
export class TicketRedemptionModule {}
