import { type Prisma } from '../../generated/prisma/client.js';
import { formatDateTime } from './format.js';
import {
  button,
  details,
  type EmailContent,
  note,
  paragraph,
  type RenderContext,
  renderEmail,
  type RenderedEmail,
} from './render.js';

/** Template data is stored as JSON (queue job, Notification.payload): no Dates or classes. */
type JsonObject = Record<string, Prisma.InputJsonValue>;

/**
 * Every email the API sends and the data it needs, keyed by the name stored in
 * `Notification.template`. Feature modules add theirs here and in EMAIL_TEMPLATES
 * (spec §10), named `<area>.<event>`.
 */
export interface EmailTemplateData {
  /** Checks SMTP end to end: `pnpm --filter @carenta/api mail:test <email>`. */
  'system.test': { requestedAt: string };
  /** After registering, and on "gửi lại email xác thực". */
  'auth.verify-email': { fullName: string; verifyUrl: string };
  /** "Quên mật khẩu". */
  'auth.reset-password': { fullName: string; resetUrl: string };
}

export type EmailTemplateName = keyof EmailTemplateData;

export type EmailData<N extends EmailTemplateName> = EmailTemplateData[N];

interface EmailTemplate<T extends JsonObject> {
  /**
   * Fields replaced by `[ẩn]` in the Notification log, e.g. one-time links. The real
   * values only travel in the queue job, which is deleted once sent.
   */
  sensitive?: readonly (keyof T & string)[];
  build(data: T, context: RenderContext): EmailContent;
}

const EMAIL_TEMPLATES: { [N in EmailTemplateName]: EmailTemplate<EmailTemplateData[N]> } = {
  'system.test': {
    build: ({ requestedAt }) => ({
      subject: 'Email thử từ Carenta',
      heading: 'Email thử nghiệm',
      blocks: [
        paragraph('Nếu bạn đọc được email này, hệ thống gửi email của Carenta đang hoạt động.'),
        details([['Thời điểm gửi', formatDateTime(new Date(requestedAt))]]),
        note('Đây là email kiểm tra kỹ thuật, bạn không cần làm gì thêm.'),
      ],
    }),
  },
  'auth.verify-email': {
    sensitive: ['verifyUrl'],
    build: ({ fullName, verifyUrl }) => ({
      subject: 'Xác thực email tài khoản Carenta',
      heading: 'Xác thực email của bạn',
      preheader: 'Bấm vào link để hoàn tất đăng ký tài khoản Carenta.',
      blocks: [
        paragraph('Xin chào ', { bold: fullName }, ','),
        paragraph(
          'Cảm ơn bạn đã đăng ký Carenta. Bấm nút bên dưới để xác thực email. Sau khi xác thực, bạn có thể đặt xe, đăng xe cho thuê và nhắn tin với người dùng khác.',
        ),
        button('Xác thực email', verifyUrl),
        note(
          'Link có hiệu lực trong 24 giờ và chỉ dùng được một lần. Nếu bạn không đăng ký tài khoản Carenta, hãy bỏ qua email này.',
        ),
      ],
    }),
  },
  'auth.reset-password': {
    sensitive: ['resetUrl'],
    build: ({ fullName, resetUrl }) => ({
      subject: 'Đặt lại mật khẩu Carenta',
      heading: 'Đặt lại mật khẩu',
      preheader: 'Link đặt lại mật khẩu có hiệu lực trong 30 phút.',
      blocks: [
        paragraph('Xin chào ', { bold: fullName }, ','),
        paragraph(
          'Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản Carenta của bạn. Bấm nút bên dưới để chọn mật khẩu mới.',
        ),
        button('Đặt lại mật khẩu', resetUrl),
        note(
          'Link có hiệu lực trong 30 phút và chỉ dùng được một lần. Sau khi đổi mật khẩu, tài khoản sẽ được đăng xuất khỏi mọi thiết bị. Nếu bạn không yêu cầu, hãy bỏ qua email này: mật khẩu của bạn vẫn giữ nguyên.',
        ),
      ],
    }),
  },
};

export function buildEmail<N extends EmailTemplateName>(
  name: N,
  data: EmailData<N>,
  context: RenderContext,
): RenderedEmail {
  const template: EmailTemplate<EmailData<N>> = EMAIL_TEMPLATES[name];
  return renderEmail(template.build(data, context), context);
}

/** `data` with the template's sensitive fields masked, for the Notification log. */
export function redactEmailData<N extends EmailTemplateName>(
  name: N,
  data: EmailData<N>,
): JsonObject {
  const template: EmailTemplate<EmailData<N>> = EMAIL_TEMPLATES[name];
  return redactFields(data, template.sensitive ?? []);
}

export function redactFields(data: JsonObject, fields: readonly string[]): JsonObject {
  const redacted = { ...data };
  for (const field of fields) {
    if (field in redacted) redacted[field] = '[ẩn]';
  }
  return redacted;
}
