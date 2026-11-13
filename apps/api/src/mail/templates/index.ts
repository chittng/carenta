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
  /** Console review of a new car (spec §10). `carName`: make, model, year and plate. */
  'car.approved': CarEmail;
  'car.rejected': CarEmail & { reason: string };
  /** Console review of changes to an approved car (spec §12.3). */
  'car.revision-approved': CarEmail;
  'car.revision-rejected': CarEmail & { reason: string };
  /** An admin hid a listed car (it can come back) or removed it for good. */
  'car.hidden': CarEmail & { reason: string };
  'car.unhidden': CarEmail;
  'car.removed': CarEmail & { reason: string };
  /** An admin locked or unlocked the account (spec §12.5). */
  'account.locked': { fullName: string; reason: string };
  'account.unlocked': { fullName: string };
}

// A type alias, not an interface: interfaces are not assignable to JsonObject.
type CarEmail = {
  fullName: string;
  carId: string;
  carName: string;
};

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
  'car.approved': {
    build: (data, context) =>
      carEmail(data, context, {
        subject: 'Xe của bạn đã được duyệt',
        heading: 'Xe đã được duyệt',
        message:
          'Xe của bạn đã được duyệt và đang hiển thị trên Carenta. Người thuê đã có thể tìm và đặt xe.',
      }),
  },
  'car.rejected': {
    build: (data, context) =>
      carEmail(data, context, {
        subject: 'Xe của bạn chưa được duyệt',
        heading: 'Xe chưa được duyệt',
        message: 'Rất tiếc, xe của bạn chưa được duyệt.',
        reason: data.reason,
        next: 'Bạn có thể chỉnh sửa thông tin theo lý do trên rồi gửi duyệt lại.',
      }),
  },
  'car.revision-approved': {
    build: (data, context) =>
      carEmail(data, context, {
        subject: 'Thay đổi thông tin xe đã được duyệt',
        heading: 'Thay đổi đã được duyệt',
        message: 'Thay đổi thông tin xe của bạn đã được duyệt và áp dụng.',
      }),
  },
  'car.revision-rejected': {
    build: (data, context) =>
      carEmail(data, context, {
        subject: 'Thay đổi thông tin xe chưa được duyệt',
        heading: 'Thay đổi chưa được duyệt',
        message: 'Thay đổi thông tin xe của bạn chưa được duyệt. Xe vẫn giữ thông tin cũ.',
        reason: data.reason,
        next: 'Bạn có thể sửa lại và gửi thay đổi mới.',
      }),
  },
  'car.hidden': {
    build: (data, context) =>
      carEmail(data, context, {
        subject: 'Xe của bạn đã bị tạm ẩn',
        heading: 'Xe đã bị tạm ẩn',
        message:
          'Xe của bạn đã bị tạm ẩn khỏi kết quả tìm kiếm. Các chuyến đã xác nhận vẫn giữ nguyên.',
        reason: data.reason,
        next: 'Vui lòng cập nhật xe theo lý do trên hoặc liên hệ Carenta để được hiển thị lại.',
      }),
  },
  'car.unhidden': {
    build: (data, context) =>
      carEmail(data, context, {
        subject: 'Xe của bạn đã hiển thị lại',
        heading: 'Xe đã hiển thị lại',
        message: 'Xe của bạn đã được hiển thị lại trên Carenta.',
      }),
  },
  'car.removed': {
    build: (data, context) =>
      carEmail(data, context, {
        subject: 'Xe của bạn đã bị gỡ khỏi Carenta',
        heading: 'Xe đã bị gỡ',
        message:
          'Xe của bạn đã bị gỡ khỏi Carenta và không thể cho thuê nữa. Các chuyến đã xác nhận vẫn giữ nguyên.',
        reason: data.reason,
      }),
  },
  'account.locked': {
    build: ({ fullName, reason }) => ({
      subject: 'Tài khoản Carenta của bạn đã bị khoá',
      heading: 'Tài khoản đã bị khoá',
      blocks: [
        paragraph('Xin chào ', { bold: fullName }, ','),
        paragraph(
          'Tài khoản Carenta của bạn đã bị khoá và được đăng xuất khỏi mọi thiết bị. Bạn không thể đăng nhập cho đến khi tài khoản được mở khoá.',
        ),
        details([['Lý do', reason]]),
        note('Nếu bạn cho rằng đây là nhầm lẫn, vui lòng liên hệ bộ phận hỗ trợ của Carenta.'),
      ],
    }),
  },
  'account.unlocked': {
    build: ({ fullName }, { webUrl }) => ({
      subject: 'Tài khoản Carenta của bạn đã được mở khoá',
      heading: 'Tài khoản đã được mở khoá',
      blocks: [
        paragraph('Xin chào ', { bold: fullName }, ','),
        paragraph('Tài khoản Carenta của bạn đã được mở khoá. Bạn có thể đăng nhập lại.'),
        button('Đăng nhập', `${webUrl}/dang-nhap`),
      ],
    }),
  },
};

/** Body shared by the car review emails: greeting, message, reason, link to the car. */
function carEmail(
  { fullName, carId, carName }: CarEmail,
  { webUrl }: RenderContext,
  content: { subject: string; heading: string; message: string; reason?: string; next?: string },
): EmailContent {
  return {
    subject: content.subject,
    heading: content.heading,
    blocks: [
      paragraph('Xin chào ', { bold: fullName }, ','),
      paragraph(content.message),
      details([
        ['Xe', carName],
        ...(content.reason === undefined ? [] : [['Lý do', content.reason] as [string, string]]),
      ]),
      ...(content.next === undefined ? [] : [paragraph(content.next)]),
      button('Xem xe của tôi', `${webUrl}/xe-cua-toi/${carId}`),
    ],
  };
}

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
