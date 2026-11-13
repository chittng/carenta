import { type Prisma } from '../../generated/prisma/client.js';
import { formatDateTime } from './format.js';
import {
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
