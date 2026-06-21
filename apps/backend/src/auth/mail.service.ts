import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly resend: Resend | null;
  private readonly from: string;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('RESEND_API_KEY');
    this.resend = apiKey ? new Resend(apiKey) : null;
    this.from = this.config.get<string>('MAIL_FROM') ?? 'shopee.review <onboarding@resend.dev>';
  }

  async sendVerificationEmail(email: string, token: string): Promise<void> {
    const frontendUrl = this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:5166';
    const verifyLink = `${frontendUrl}/auth/verify?token=${token}`;

    if (!this.resend) {
      this.logger.warn(`RESEND_API_KEY chưa cấu hình. Verify link cho ${email}: ${verifyLink}`);
      return;
    }

    try {
      await this.resend.emails.send({
        from: this.from,
        to: email,
        subject: 'Xác minh email - shopee.review',
        html: `
          <h2>Chào mừng đến với shopee.review!</h2>
          <p>Nhấn vào link bên dưới để xác minh email và bắt đầu đăng bài review:</p>
          <p><a href="${verifyLink}">Xác minh email</a></p>
          <p>Nếu nút không hoạt động, copy link này: ${verifyLink}</p>
        `,
      });
    } catch (error) {
      this.logger.error(`Gửi email thất bại: ${error instanceof Error ? error.message : error}`);
    }
  }
}
