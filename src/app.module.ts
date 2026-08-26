import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { MailModule } from './mail/mail.module';
import { CategoriesModule } from './categories/categories.module';
import { OrganizerService } from './organizer/organizer.service';
import { OrganizerController } from './organizer/organizer.controller';
import { OrganizerModule } from './organizer/organizer.module';
import { CloudinaryModule } from './cloudinary/cloudinary.module';

@Module({
  imports: [PrismaModule, AuthModule, MailModule, CategoriesModule, OrganizerModule, CloudinaryModule],
  controllers: [AppController, OrganizerController],
  providers: [AppService, OrganizerService],
})
export class AppModule {}
