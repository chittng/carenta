import { formatDateTime } from './format.js';
import { buildEmail, redactEmailData, redactFields } from './index.js';
import { button, details, note, paragraph, renderEmail } from './render.js';

const context = { webUrl: 'https://carenta.vn' };

describe('renderEmail', () => {
  const content = {
    subject: 'Đơn thuê đã được xác nhận',
    heading: 'Chuyến của bạn đã sẵn sàng',
    blocks: [
      paragraph('Xin chào ', { bold: 'Minh <script>' }, ','),
      button('Xem chuyến', 'https://carenta.vn/chuyen-cua-toi/1?a=1&b=2'),
      details([
        ['Xe', 'VinFast VF 8'],
        ['Nhận xe', '08:00 14/11/2026'],
      ]),
      note('Link có hiệu lực trong 30 phút.'),
    ],
  };

  it('builds a Vietnamese HTML email with escaped values', () => {
    const { subject, html } = renderEmail(content, context);

    expect(subject).toBe('Đơn thuê đã được xác nhận');
    expect(html).toContain('<html lang="vi">');
    expect(html).toContain('<strong>Minh &lt;script&gt;</strong>');
    expect(html).not.toContain('<script>');
    expect(html).toContain('href="https://carenta.vn/chuyen-cua-toi/1?a=1&amp;b=2"');
    expect(html).toContain('VinFast VF 8');
    expect(html).toContain('Email này được gửi tự động từ Carenta');
  });

  it('uses the heading as the inbox preview unless a preheader is given', () => {
    expect(renderEmail(content, context).html).toMatch(
      /display:none[^>]*>Chuyến của bạn đã sẵn sàng</,
    );
    expect(renderEmail({ ...content, preheader: 'Nhận xe lúc 8 giờ' }, context).html).toMatch(
      /display:none[^>]*>Nhận xe lúc 8 giờ</,
    );
  });

  it('builds a matching plain-text part', () => {
    expect(renderEmail(content, context).text).toBe(
      [
        'Chuyến của bạn đã sẵn sàng',
        '',
        'Xin chào Minh <script>,',
        '',
        'Xem chuyến: https://carenta.vn/chuyen-cua-toi/1?a=1&b=2',
        '',
        'Xe: VinFast VF 8\nNhận xe: 08:00 14/11/2026',
        '',
        'Link có hiệu lực trong 30 phút.',
        '',
        '--',
        'Email này được gửi tự động từ Carenta, vui lòng không trả lời email này.',
        'https://carenta.vn/',
      ].join('\n'),
    );
  });

  it('refuses links that are not http(s)', () => {
    expect(() =>
      renderEmail({ ...content, blocks: [button('Bấm', 'javascript:alert(1)')] }, context),
    ).toThrow('Refusing non-http link');
  });
});

describe('templates', () => {
  it('renders system.test with the time in Vietnam', () => {
    const email = buildEmail('system.test', { requestedAt: '2026-11-13T07:30:00Z' }, context);

    expect(email.subject).toBe('Email thử từ Carenta');
    expect(email.text).toContain('Thời điểm gửi: 14:30 13/11/2026');
  });

  it('renders car review results with the reason and a link to the car', () => {
    const email = buildEmail(
      'car.rejected',
      {
        fullName: 'Minh',
        carId: 'abc',
        carName: 'VinFast VF 8 2024 (51K-123.45)',
        reason: 'Ảnh giấy đăng ký bị mờ.',
      },
      context,
    );

    expect(email.subject).toBe('Xe của bạn chưa được duyệt');
    expect(email.text).toContain(
      'Xe: VinFast VF 8 2024 (51K-123.45)\nLý do: Ảnh giấy đăng ký bị mờ.',
    );
    expect(email.text).toContain('Xem xe của tôi: https://carenta.vn/xe-cua-toi/abc');
    expect(
      buildEmail('car.approved', { fullName: 'Minh', carId: 'abc', carName: 'Xe' }, context).text,
    ).not.toContain('Lý do');
  });

  it('renders the account lock with its reason', () => {
    const email = buildEmail('account.locked', { fullName: 'Minh', reason: 'Gian lận.' }, context);

    expect(email.subject).toBe('Tài khoản Carenta của bạn đã bị khoá');
    expect(email.text).toContain('Lý do: Gian lận.');
  });

  it('logs payloads as-is when a template has no sensitive fields', () => {
    expect(redactEmailData('system.test', { requestedAt: 'x' })).toEqual({ requestedAt: 'x' });
  });

  it('masks sensitive fields', () => {
    expect(
      redactFields({ name: 'An', resetUrl: 'https://carenta.vn/dat-lai?token=abc' }, [
        'resetUrl',
        'missing',
      ]),
    ).toEqual({ name: 'An', resetUrl: '[ẩn]' });
  });
});

describe('formatDateTime', () => {
  it('formats in Asia/Ho_Chi_Minh, across midnight UTC', () => {
    expect(formatDateTime(new Date('2026-12-31T17:05:00Z'))).toBe('00:05 01/01/2027');
  });
});
