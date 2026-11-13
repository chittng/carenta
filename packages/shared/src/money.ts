const vndFormat = new Intl.NumberFormat('vi-VN');

/** Formats an integer VND amount for display, e.g. `1.500.000đ`. */
export function formatVnd(amount: number): string {
  return `${vndFormat.format(amount)}đ`;
}
