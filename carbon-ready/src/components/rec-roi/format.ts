import { formatNumber } from '../../lib/format';
import type { RecPath, RecPathResult, RecRoiMissing } from '../../lib/rec-roi';

export const PATH_LABEL: Record<RecPath, string> = {
  own: 'ก · เปิดบัญชี Evident เอง',
  platform: 'ข · ผ่านแพลตฟอร์ม',
};
export const PATH_SHORT: Record<RecPath, string> = { own: 'บัญชีเอง', platform: 'ผ่านแพลตฟอร์ม' };

export const MISSING_LABEL: Record<RecRoiMissing, string> = {
  price: 'ยังไม่กรอกราคา REC (กลาง)',
  platform_fee: 'ยังไม่กรอกค่าบริการแพลตฟอร์ม → เส้นทาง ข คำนวณไม่ได้',
  fx: 'ยังไม่กรอกอัตรา EUR→THB → เส้นทาง ก คำนวณไม่ได้',
};

export const thb = (n: number, digits = 0) => `฿${formatNumber(n, digits)}`;
export const pricePerMwh = (n: number) => formatNumber(n, 2);
export const pct = (n: number | null) => (n === null ? '—' : `${n >= 0 ? '+' : ''}${formatNumber(n, 1)}%`);

/** Break-even cell text for a path: number, or why there is none. */
export function breakEvenText(p: RecPathResult): string {
  if (p.status === 'ok') return pricePerMwh(p.break_even_price_thb);
  return '—';
}

export function paybackText(months: number | null): string {
  if (months === null) return 'ไม่คืนทุนในระยะประเมิน';
  if (months === 0) return 'ทันที';
  return `${months} เดือน`;
}
