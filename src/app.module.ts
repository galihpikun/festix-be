import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { MailModule } from './mail/mail.module';
import { CategoriesModule } from './categories/categories.module';
import { OrganizerModule } from './organizer/organizer.module';
import { CloudinaryModule } from './cloudinary/cloudinary.module';
import { EventsModule } from './events/events.module';

@Module({
  imports: [PrismaModule, AuthModule, MailModule, CategoriesModule, OrganizerModule, CloudinaryModule, EventsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
