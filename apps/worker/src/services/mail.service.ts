import nodemailer, { Transporter } from 'nodemailer';
import { env } from '@email-scheduler/config';
import { logger } from '../utils/logger.js';

export interface SendMailOptions {
  from: string;
  to: string;
  subject: string;
  body: string;
}

export interface SendMailResult {
  messageId: string;
  previewUrl?: string | null;
}

export class MailService {
  private transporter: Transporter | null = null;
  private isTestMock = false;
  private mockSendFn: ((options: SendMailOptions) => Promise<SendMailResult>) | null = null;

  /**
   * Configures a mock send handler for unit/integration tests.
   */
  setMockHandler(fn: ((options: SendMailOptions) => Promise<SendMailResult>) | null): void {
    this.mockSendFn = fn;
    this.isTestMock = fn !== null;
  }

  /**
   * Initializes or returns the cached Nodemailer SMTP transporter (Production SMTP or Ethereal).
   */
  async getTransporter(): Promise<Transporter> {
    if (!this.transporter) {
      // 1. Production SMTP Configuration (Amazon SES, SendGrid, Postmark, Resend, etc.)
      if (env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS) {
        logger.info(`Initializing production SMTP transport for host: ${env.SMTP_HOST}`);
        this.transporter = nodemailer.createTransport({
          host: env.SMTP_HOST,
          port: env.SMTP_PORT || 587,
          secure: env.SMTP_SECURE ?? env.SMTP_PORT === 465,
          auth: {
            user: env.SMTP_USER,
            pass: env.SMTP_PASS,
          },
        });
        return this.transporter;
      }

      // 2. Development / Testing Ethereal SMTP
      const user = env.ETHEREAL_USER;
      const pass = env.ETHEREAL_PASS;

      // If placeholder credentials in non-test runtime, create an Ethereal test account dynamically
      if ((user === 'your-ethereal-user' || !user) && env.NODE_ENV !== 'test') {
        try {
          const testAccount = await nodemailer.createTestAccount();
          this.transporter = nodemailer.createTransport({
            host: testAccount.smtp.host,
            port: testAccount.smtp.port,
            secure: testAccount.smtp.secure,
            auth: {
              user: testAccount.user,
              pass: testAccount.pass,
            },
          });
          logger.info(`Created dynamic Ethereal test account: ${testAccount.user}`);
          return this.transporter;
        } catch (err) {
          logger.warn('Could not create dynamic Ethereal account, using fallback credentials.', {
            error: String(err),
          });
        }
      }

      this.transporter = nodemailer.createTransport({
        host: env.ETHEREAL_HOST,
        port: env.ETHEREAL_PORT,
        secure: env.ETHEREAL_SECURE,
        auth: {
          user,
          pass,
        },
      });
    }

    return this.transporter;
  }

  /**
   * Sends an email via SMTP and captures the messageId and preview URL.
   */
  async sendEmail(options: SendMailOptions): Promise<SendMailResult> {
    if (this.isTestMock && this.mockSendFn) {
      return await this.mockSendFn(options);
    }

    const transporter = await this.getTransporter();

    const info = await transporter.sendMail({
      from: options.from,
      to: options.to,
      subject: options.subject,
      html: options.body,
      text: options.body.replace(/<[^>]*>?/gm, ''), // Plaintext fallback
    });

    const previewUrl = nodemailer.getTestMessageUrl(info);
    if (previewUrl) {
      logger.info(`Ethereal preview URL generated`, { previewUrl });
    }

    return {
      messageId: info.messageId,
      previewUrl: typeof previewUrl === 'string' ? previewUrl : null,
    };
  }
}

export const mailService = new MailService();
