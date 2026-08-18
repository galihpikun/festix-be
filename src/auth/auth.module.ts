import { Module } from '@nestjs/common';
import { MailModule } from 'src/mail/mail.module';
import { PrismaModule } from 'src/prisma/prisma.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
    imports:[MailModule,PrismaModule],
    controllers:[AuthController],
    providers:[AuthService],
})
export class AuthModule {
}
