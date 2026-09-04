import { Module } from '@nestjs/common';
import { AuthModule } from 'src/auth/auth.module';
import { PrismaModule } from 'src/prisma/prisma.module';
import { TicketTypesService } from './ticket-types.service';
import { TicketTypesController } from './ticket-types.controller';

@Module({
    imports: [PrismaModule, AuthModule],
    providers: [TicketTypesService],
    controllers: [TicketTypesController]
})
export class TicketTypesModule {}
