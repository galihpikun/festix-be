import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { IssuedTicketsController } from './issued-tickets.controller';
import { IssuedTicketsService } from './issued-tickets.service';

@Module({
  imports: [PrismaModule],
  controllers: [IssuedTicketsController],
  providers: [IssuedTicketsService],
  exports: [IssuedTicketsService],
})
export class IssuedTicketsModule {}
