import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { EventsService } from './events.service';
import { EventsController } from './events.controller';
import { CloudinaryModule } from '../cloudinary/cloudinary.module';
import { RefundsModule } from '../refunds/refunds.module';

@Module({
  imports: [PrismaModule, AuthModule, CloudinaryModule, RefundsModule],
  providers: [EventsService],
  controllers: [EventsController],
  exports: [EventsService],
})
export class EventsModule {}
