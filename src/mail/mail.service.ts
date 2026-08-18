import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.MAIL_USER,
      pass: process.env.MAIL_PASSWORD,
    },
  });

  async sendMailVerif(email: string, code: string) {
    await this.transporter.sendMail({
      from: `"Festix" Galih & Randu`,
      to: email,
      subject: 'Verify Your Email - Festix',
      html: `
        <div style="font-family: Arial, sans-serif;">
          <h2>Verify Your Email</h2>

          <p>
            Thank you for registering on Festix.
            Use the following OTP code to verify your email:
          </p>

          <h1 style="letter-spacing: 8px;">
            ${code}
          </h1>

          <p>
            This code will expire in <strong>5 minutes</strong>.
          </p>

          <p>
            If you did not create this account, you can ignore this email.
          </p>
        </div>
      `,
    });
  }
}