import { Module } from '@nestjs/common';
import { AuthModule } from 'src/auth/auth.module';
import { PrismaModule } from 'src/prisma/prisma.module';
import { OrganizerService } from './organizer.service';
import { OrganizerController } from './organizer.controller';
import { CloudinaryModule } from 'src/cloudinary/cloudinary.module';

@Module({
imports: [PrismaModule, AuthModule, CloudinaryModule],
providers:[OrganizerService],
controllers:[OrganizerController]    
})
export class OrganizerModule {}
