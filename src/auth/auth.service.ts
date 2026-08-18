import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class AuthService {
    constructor(private readonly prisma: PrismaService) {}

    getMe(id: string) {
        return this.prisma.user.findUnique({
            where:{
                id: id
            }
        })
    }

    logIn(email:string, password:string) {}
    signUp(fullName:string, email:string, password: string) {}

    
}
