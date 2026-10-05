import { describe, it, expect } from 'vitest';
import { computeRecRoi, type RecRoiAssumptions } from '../../lib/rec-roi';
import { recommendationBadge, thb } from './format';

const inputs = { capacity_kwp: 250, annual_mwh: 36.5, issuance_type: 'Normal' as const, digital_meter_exempt: false };
const A = (o: Partial<RecRoiAssumptions>): RecRoiAssumptions => ({
  price_low_thb: null, price_mid_thb: null, price_high_thb: null,
  platform_fee_pct: null, eur_thb: null, horizon_years: 5, ...o,
});
const badge = (o: Partial<RecRoiAssumptions>) => recommendationBadge(computeRecRoi(inputs, A(o)));

describe('recommendationBadge', () => {
  it('is null when no path is computable', () => {
    expect(badge({ price_mid_thb: 25 })).toBeNull();
  });
  it('both paths ok, mid price, net >= 0 → green path', () => {
    expect(badge({ price_mid_thb: 25, platform_fee_pct: 10, eur_thb: 40 })).toEqual({ tone: 'green', text: 'ผ่านแพลตฟอร์ม' });
  });
  it('both paths ok, mid price, net < 0 → amber "neither pays"', () => {
    expect(badge({ price_mid_thb: 1, platform_fee_pct: 10, eur_thb: 40 })).toEqual({ tone: 'amber', text: 'ไม่คุ้มทั้งสองทาง' });
  });
  it('one path ok, mid price, net >= 0 → green with single-path caveat', () => {
    expect(badge({ price_mid_thb: 25, platform_fee_pct: 10 })).toEqual({ tone: 'green', text: 'ผ่านแพลตฟอร์ม (คำนวณได้ทางเดียว)' });
  });
  it('one path ok, mid price, net < 0 → amber, names the path, not "both"', () => {
    expect(badge({ price_mid_thb: 1, platform_fee_pct: 10 })).toEqual({ tone: 'amber', text: 'ไม่คุ้ม (ผ่านแพลตฟอร์ม)' });
  });
  it('no mid price, both ok → gray "lower break-even"', () => {
    expect(badge({ platform_fee_pct: 10, eur_thb: 40 })).toEqual({ tone: 'gray', text: 'ผ่านแพลตฟอร์ม · คุ้มทุนต่ำกว่า' });
  });
  it('no mid price, one ok → gray single-path caveat', () => {
    expect(badge({ platform_fee_pct: 10 })).toEqual({ tone: 'gray', text: 'ผ่านแพลตฟอร์ม (คำนวณได้ทางเดียว)' });
    expect(badge({ eur_thb: 40 })).toEqual({ tone: 'gray', text: 'บัญชีเอง (คำนวณได้ทางเดียว)' });
  });
});

describe('thb', () => {
  it('positive: ฿ then grouped number', () => {
    expect(thb(13543)).toBe('฿13,543');
  });
  it('zero has no sign', () => {
    expect(thb(0)).toBe('฿0');
    expect(thb(-0)).toBe('฿0');
    expect(thb(-0.2)).toBe('฿0');
  });
  it('negative: typographic minus before the symbol', () => {
    expect(thb(-392481)).toBe('\u2212฿392,481');
    expect(thb(-1234.5, 1)).toBe('\u2212฿1,234.5');
  });
});
