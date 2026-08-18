import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { randomInt } from 'crypto';
import * as bcrypt from 'bcrypt';
import { MailService } from 'src/mail/mail.service';
import { LoginDto } from './dto/login.dto';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const existingUser = await this.prisma.user.findUnique({
      where: {
        email: dto.email,
      },
    });
    if (existingUser) {
      throw new ConflictException('Email Already Exists'); // ConflictException adalah built in throw error buat menandakan data yang konflik/sama
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10); // Enkripsi pw pake bkrip

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        password: hashedPassword,
        fullName: dto.fullName,
      },
    });

    const code = randomInt(100000, 1000000).toString(); //Generate kode OTP 6 digit random
    const otpHash = await bcrypt.hash(code, 10); // Enkrip biar aman nyoh

    await this.prisma.otp.create({
      data: {
        userId: user.id,
        identifier: user.email,
        code: otpHash,
        type: 'VERIFY_EMAIL',
        expiresAt: new Date(Date.now() + 5 * 60 * 1000), // OTP dalam 5 menit expired
      },
    });

    await this.mailService.sendMailVerif(user.email, code); //Kirim email pakai modul yang kita bikin

    return {
      message: 'User registered successfully, please verify the email of',
      email: user.email,
    };
  }

  async verifyEmail(dto: VerifyEmailDto) {
    const user = await this.prisma.user.findUnique({
      where: {
        email: dto.email,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid Email or Code'); // UnauthorizedException adalah built in throw error buat menandakan data yang tidak valid
    }

    if (user.emailVerified) {
      throw new ConflictException('Email Already Verified');
    }

    const otp = await this.prisma.otp.findFirst({
      //Cari otp yang sesuai, diurutkan dari terbaru
      where: {
        userId: user.id,
        identifier: user.email,
        isUsed: false,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (!otp) {
      throw new UnauthorizedException('Invalid Email or Code');
    }

    if (otp.expiresAt < new Date()) {
      throw new UnauthorizedException('Verification code has expired');
    }

    const isValid = await bcrypt.compare(dto.code, otp.code); //Compare otp

    if (!isValid) {
      throw new UnauthorizedException('Invalid verification code');
    }

    await this.prisma.$transaction([
      // Transaction untuk update user dan otp sekaligus biar aman, transaction biar kalau satu gagal, semua gagal
      this.prisma.user.update({
        where: {
          id: user.id,
        },
        data: {
          emailVerified: true,
        },
      }),

      this.prisma.otp.update({
        where: {
          id: otp.id,
        },
        data: {
          isUsed: true,
        },
      }),
    ]);

    return {
      message: `Email ${user.email} verified successfully`,
    };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: {
        email: dto.email,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid Email or Password');
    }

    if (!user.emailVerified) {
      throw new UnauthorizedException('Email not Verified');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid Email or Password');
    }

    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const accessToken = await this.jwtService.signAsync(payload); // ga seperti express, di nest kita lansung pakai jwtService untuk bikin token

    return {
      message: 'Login successful',
      access_token: accessToken,
    };
  }
}
