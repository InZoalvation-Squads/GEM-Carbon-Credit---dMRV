import { formatNumber } from '../../lib/format';
import type { RecPath, RecPathOk, RecPathResult, RecRoiMissing, RecRoiResult } from '../../lib/rec-roi';
import type { Tone } from '../ui/Badge';

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

/**
 * Recommendation chip for a project. Never overstates: a path is only shown as
 * a green recommendation when it earns >= 0 at the mid price; with no mid price
 * the chip is neutral and only says which break-even is lower.
 */
export function recommendationBadge(roi: RecRoiResult): { tone: Tone; text: string } | null {
  const ok = [roi.own, roi.platform].filter((p): p is RecPathOk => p.status === 'ok');
  if (ok.length === 0 || !roi.recommended) return null;
  const path = roi.recommended;
  const best = ok.find((p) => p.path === path) ?? ok[0];
  const name = PATH_SHORT[best.path];
  const single = ok.length === 1;
  const mid = best.scenarios.find((s) => s.scenario === 'mid');
  if (!mid) {
    return { tone: 'gray', text: single ? `${name} (คำนวณได้ทางเดียว)` : `${name} · คุ้มทุนต่ำกว่า` };
  }
  if (mid.net_thb >= 0) {
    return { tone: 'green', text: single ? `${name} (คำนวณได้ทางเดียว)` : name };
  }
  return { tone: 'amber', text: single ? `ไม่คุ้ม (${name})` : 'ไม่คุ้มทั้งสองทาง' };
}
