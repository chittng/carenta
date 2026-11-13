/**
 * Emails are built from a few block types instead of hand-written HTML: every text value
 * is escaped, the look stays consistent, and the plain-text part comes for free.
 */

/** A run of text, optionally bold. */
export type Inline = string | { bold: string };

export type Block =
  | { type: 'paragraph'; content: Inline | Inline[] }
  | { type: 'button'; label: string; url: string }
  /** Label/value rows, e.g. booking details. */
  | { type: 'details'; rows: [label: string, value: string][] }
  /** Small grey text, e.g. "Link có hiệu lực trong 30 phút." */
  | { type: 'note'; content: string };

export interface EmailContent {
  subject: string;
  /** Shown as the inbox preview line; defaults to the heading. */
  preheader?: string;
  heading: string;
  blocks: Block[];
}

export interface RenderContext {
  /** Web origin, e.g. https://carenta.vn, for links in the body and footer. */
  webUrl: string;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export const paragraph = (...content: Inline[]): Block => ({ type: 'paragraph', content });
export const button = (label: string, url: string): Block => ({ type: 'button', label, url });
export const details = (rows: [string, string][]): Block => ({ type: 'details', rows });
export const note = (content: string): Block => ({ type: 'note', content });

const COLORS = {
  brand: '#0f766e',
  text: '#1f2937',
  muted: '#6b7280',
  border: '#e5e7eb',
  background: '#f3f4f6',
};

const FONT = "-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** Only http(s) links may appear in emails, so a stray `javascript:` value cannot. */
function safeUrl(url: string): string {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error(`Refusing non-http link in email: ${url}`);
  }
  return parsed.toString();
}

function inlines(content: Inline | Inline[]): Inline[] {
  return Array.isArray(content) ? content : [content];
}

function inlineHtml(content: Inline | Inline[]): string {
  return inlines(content)
    .map((part) =>
      typeof part === 'string' ? escapeHtml(part) : `<strong>${escapeHtml(part.bold)}</strong>`,
    )
    .join('');
}

function inlineText(content: Inline | Inline[]): string {
  return inlines(content)
    .map((part) => (typeof part === 'string' ? part : part.bold))
    .join('');
}

function blockHtml(block: Block): string {
  if (block.type === 'paragraph') {
    return `<p style="margin:0 0 16px;font-size:15px;line-height:24px;color:${COLORS.text}">${inlineHtml(block.content)}</p>`;
  }
  if (block.type === 'button') {
    return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px"><tr><td style="border-radius:8px;background:${COLORS.brand}"><a href="${escapeHtml(safeUrl(block.url))}" style="display:inline-block;padding:12px 24px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px">${escapeHtml(block.label)}</a></td></tr></table>`;
  }
  if (block.type === 'details') {
    const rows = block.rows.map(
      ([label, value]) =>
        `<tr><td style="padding:8px 12px;font-size:14px;color:${COLORS.muted};width:40%">${escapeHtml(label)}</td><td style="padding:8px 12px;font-size:14px;color:${COLORS.text};font-weight:600">${escapeHtml(value)}</td></tr>`,
    );
    return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 16px;border:1px solid ${COLORS.border};border-radius:8px">${rows.join('')}</table>`;
  }
  return `<p style="margin:0 0 16px;font-size:13px;line-height:20px;color:${COLORS.muted}">${escapeHtml(block.content)}</p>`;
}

function blockText(block: Block): string {
  if (block.type === 'paragraph') return inlineText(block.content);
  if (block.type === 'button') return `${block.label}: ${safeUrl(block.url)}`;
  if (block.type === 'details') {
    return block.rows.map(([label, value]) => `${label}: ${value}`).join('\n');
  }
  return block.content;
}

const FOOTER_TEXT = 'Email này được gửi tự động từ Carenta, vui lòng không trả lời email này.';

export function renderEmail(content: EmailContent, context: RenderContext): RenderedEmail {
  const webUrl = safeUrl(context.webUrl);
  const preheader = content.preheader ?? content.heading;
  const html = `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(content.subject)}</title>
</head>
<body style="margin:0;padding:0;background:${COLORS.background};font-family:${FONT}">
<div style="display:none;max-height:0;overflow:hidden">${escapeHtml(preheader)}</div>
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:${COLORS.background}">
<tr><td align="center" style="padding:24px 12px">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px">
<tr><td style="padding:0 0 16px"><a href="${escapeHtml(webUrl)}" style="font-size:22px;font-weight:700;color:${COLORS.brand};text-decoration:none">Carenta</a></td></tr>
<tr><td style="background:#ffffff;border-radius:12px;padding:32px 28px">
<h1 style="margin:0 0 20px;font-size:20px;line-height:28px;color:${COLORS.text}">${escapeHtml(content.heading)}</h1>
${content.blocks.map(blockHtml).join('\n')}
</td></tr>
<tr><td style="padding:16px 4px;font-size:12px;line-height:18px;color:${COLORS.muted}">${escapeHtml(FOOTER_TEXT)}<br><a href="${escapeHtml(webUrl)}" style="color:${COLORS.muted}">${escapeHtml(new URL(webUrl).host)}</a></td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  const text = [
    content.heading,
    '',
    ...content.blocks.map((block) => `${blockText(block)}\n`),
    '--',
    FOOTER_TEXT,
    webUrl,
  ].join('\n');

  return { subject: content.subject, html, text };
}
