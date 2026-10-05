import { formatNumber } from '../../lib/format';
import type { RecPath, RecPathOk, RecPathResult, RecRoiMissing, RecRoiResult } from '../../lib/rec-roi';
import type { FinancialValue } from '../../lib/rec-roi-project';
import type { Tone } from '../ui/Badge';
import { recommendedMid, recommendedPath } from '../../lib/investor-report';

export const PATH_LABEL: Record<RecPath, string> = {
  own: 'เปิดบัญชี Evident เอง',
  platform: 'ขายผ่าน GEM',
};
export const PATH_SHORT: Record<RecPath, string> = { own: 'เปิดบัญชีเอง', platform: 'ขายผ่าน GEM' };

export const MISSING_LABEL: Record<RecRoiMissing, string> = {
  price: 'ยังไม่กรอกราคา REC (กลาง)',
  platform_fee: 'ยังไม่กรอกค่าบริการ GEM → ทางขายผ่าน GEM คำนวณไม่ได้',
  fx: 'ยังไม่กรอกอัตรา EUR→THB → ทางเปิดบัญชีเองคำนวณไม่ได้',
};

/** Money-table column headers, shared by the app tab and the investor report. */
export const MONEY_HEAD = {
  without: 'มูลค่าไฟ (ไม่มี REC)',
  withRec: 'มูลค่าไฟ + REC สุทธิ',
  diff: 'ส่วนต่างจาก REC',
} as const;

/** Footnote under the money table: what the figures are (not profit) and where each input comes from. */
export function moneyFootnote(tariff: FinancialValue, recNote: string | null): string {
  return `มูลค่าไฟ = ค่าไฟที่ประหยัดได้หรือรายได้จากการขายไฟ คิดจาก kWh จริง × ค่าไฟ ${formatNumber(tariff.value, 2)} ฿/kWh `
    + `(${tariff.source === 'pdd' ? 'จาก PDD' : 'ค่าเริ่มต้น PEA'}) — ไม่ใช่กำไร · `
    + `มูลค่าไฟ + REC สุทธิ = บวกรายได้ REC สุทธิหลังหักค่าธรรมเนียม${recNote ? ` (${recNote})` : ''} · ไม่คิดส่วนลดและการเสื่อมของแผง`;
}

/** Baht amount; negatives get a typographic minus before the symbol ("−฿392,481"). */
export function thb(n: number, digits = 0): string {
  const abs = formatNumber(Math.abs(n), digits);
  const isZero = /^[0.,]*$/.test(abs); // -0 or a tiny negative that rounds to 0 shows no sign
  return `${n < 0 && !isZero ? '\u2212' : ''}฿${abs}`;
}
/** Baht with an explicit sign, for an amount added on top of something ("+฿27", "−฿1,200"). */
export const signedThb = (n: number, digits = 0) => (n >= 0 ? `+${thb(n, digits)}` : thb(n, digits));
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
  const best = recommendedPath(roi);
  if (!best) return null;
  const name = PATH_SHORT[best.path];
  const single = ok.length === 1;
  const mid = recommendedMid(roi);
  if (!mid) {
    return { tone: 'gray', text: single ? `${name} (คำนวณได้ทางเดียว)` : `${name} · คุ้มทุนต่ำกว่า` };
  }
  if (mid.net_thb >= 0) {
    return { tone: 'green', text: single ? `${name} (คำนวณได้ทางเดียว)` : name };
  }
  return { tone: 'amber', text: single ? `ไม่คุ้ม (${name})` : 'ไม่คุ้มทั้งสองทาง' };
}
