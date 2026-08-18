import { Controller, Get, Post } from '@nestjs/common';

@Controller('auth')
export class AuthController {
    @Get('me')
    getMe() {}

    @Post('login')
    logIn() {}

    @Post('signup')
    signUp() {}
}
