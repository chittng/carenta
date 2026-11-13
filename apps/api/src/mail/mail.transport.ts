import { createTransport } from 'nodemailer';

import { type AppConfigService } from '../config/env.js';

export interface OutgoingMail {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
}

/** The part of a Nodemailer transport the app uses; tests swap in a fake. */
export interface MailTransport {
  sendMail(mail: OutgoingMail): Promise<unknown>;
  close(): void;
}

export const MAIL_TRANSPORT = Symbol('MAIL_TRANSPORT');

export function createSmtpTransport(config: AppConfigService): MailTransport {
  const user = config.get('SMTP_USER', { infer: true });
  const pass = config.get('SMTP_PASSWORD', { infer: true });
  return createTransport({
    host: config.get('SMTP_HOST', { infer: true }),
    port: config.get('SMTP_PORT', { infer: true }),
    secure: config.get('SMTP_SECURE', { infer: true }),
    auth: user ? { user, pass } : undefined,
  });
}
