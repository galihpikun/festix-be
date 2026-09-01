import { Module } from '@nestjs/common';
import { AuthModule } from 'src/auth/auth.module';
import { PrismaModule } from 'src/prisma/prisma.module';
import { EventsService } from './events.service';
import { EventsController } from './events.controller';
import { CloudinaryModule } from 'src/cloudinary/cloudinary.module';

@Module({
    imports:[PrismaModule,AuthModule, CloudinaryModule],
    providers:[EventsService],
    controllers:[EventsController]
})
export class EventsModule {}
