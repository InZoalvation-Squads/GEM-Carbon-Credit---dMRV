import { describe, it, expect } from 'vitest';
import type { MonitoringRecord, Project } from '../../types';
import { EMPTY_REC_ROI_SETTINGS, type RecRoiAssumptions } from '../../lib/rec-roi';
import { evaluateProjectRecRoi, defaultProjectSetting } from '../../lib/rec-roi-project';
import { buildRecRoiSummary } from './summary';

// Synthetic arithmetic inputs, not market data — never copy into fixtures or seeds.
const PROJECT: Project = {
  id: 'prj-s', organization_id: 'org', name: 'Summary Solar', location: 'Bangkok, Thailand',
  capacity_kwp: 500, commission_date: '2025-01-01', status: 'active', lifecycle_stage: 'registered',
  created_at: '2025-01-01T00:00:00Z', updated_at: '2025-01-01T00:00:00Z',
};

/** 365 days × kWh/day so the annual figure is exact: 700 MWh/yr at 1917.808… kWh/day. */
function yearOf(kwhPerDay: number): MonitoringRecord[] {
  const start = Date.parse('2025-01-01T00:00:00Z');
  return Array.from({ length: 365 }, (_, i) => ({
    id: `m${i}`, project_id: 'prj-s', record_date: new Date(start + i * 86_400_000).toISOString().slice(0, 10),
    generation_kwh: kwhPerDay, source: 'csv', uploaded_at: '2025-01-01T00:00:00Z',
  }));
}

const evalWith = (a: Partial<RecRoiAssumptions>, investment: number | null = null) => {
  const assumptions = { ...EMPTY_REC_ROI_SETTINGS, ...a };
  const r = evaluateProjectRecRoi({
    project: PROJECT, records: yearOf(700_000 / 365), pdds: [], methodologies: [], factors: [], assumptions,
    setting: { ...defaultProjectSetting('prj-s'), investment_mthb: investment },
  });
  return buildRecRoiSummary(r, assumptions);
};

describe('buildRecRoiSummary — one plain-language verdict per project', () => {
  it('worthwhile at the mid price: green, names the path, net, ROI and payback', () => {
    const s = evalWith({ price_mid_thb: 25, platform_fee_pct: 10, eur_thb: 40 })!;
    expect(s.tone).toBe('green');
    expect(s.label).toBe('คุ้ม');
    expect(s.headline).toBe('ขาย REC ผ่าน GEM ที่ราคา 25.00 ฿/MWh ได้กำไรสุทธิ ฿71,625 ใน 5 ปี (ROI +451.2%) คืนทุนใน 4 เดือน');
  });

  it('explains why the own Evident account costs more', () => {
    const s = evalWith({ price_mid_thb: 25, platform_fee_pct: 10, eur_thb: 40 })!;
    expect(s.points).toContain('เปิดบัญชี Evident เองต้องขายได้อย่างน้อย 122.04 ฿/MWh เทียบกับขายผ่าน GEM 2.26 ฿/MWh — ค่าบัญชี €2,000/ปี (≈ ฿80,000) กินรายได้เกือบทั้งหมด');
  });

  it('states the measured production basis', () => {
    const s = evalWith({ price_mid_thb: 25, platform_fee_pct: 10, eur_thb: 40 })!;
    expect(s.points[0]).toBe('ผลิตได้ประมาณ 700.0 MWh/ปี = 700 REC/ปี (จากข้อมูลวัดจริง 365 วัน)');
  });

  it('own-account phrasing reads naturally when that path wins (no platform fee entered)', () => {
    const s = evalWith({ price_mid_thb: 200, eur_thb: 40 })!;
    expect(s.tone).toBe('green');
    expect(s.headline).toMatch(/^ขาย REC โดยเปิดบัญชี Evident เองที่ราคา 200\.00 ฿\/MWh ได้กำไรสุทธิ ฿[\d,]+ ใน 5 ปี/);
  });

  it('not worthwhile at the mid price: amber, says the minimum price needed', () => {
    const s = evalWith({ price_mid_thb: 1, platform_fee_pct: 10, eur_thb: 40 })!;
    expect(s.tone).toBe('amber');
    expect(s.label).toBe('ยังไม่คุ้ม');
    expect(s.headline).toBe('ที่ราคา 1.00 ฿/MWh ขาดทุนทั้งสองทาง — ต้องขายได้อย่างน้อย 2.26 ฿/MWh (ขายผ่าน GEM) จึงจะคุ้มทุนใน 5 ปี');
  });

  it('no price yet: neutral, gives the break-even to aim for', () => {
    const s = evalWith({ platform_fee_pct: 10, eur_thb: 40 })!;
    expect(s.tone).toBe('gray');
    expect(s.label).toBe('รอราคา');
    expect(s.headline).toBe('ยังไม่มีราคา REC — ต้องขายได้อย่างน้อย 2.26 ฿/MWh (ขายผ่าน GEM) จึงจะคุ้มทุนใน 5 ปี');
  });

  it('nothing computable: says which inputs unlock it', () => {
    const s = evalWith({})!;
    expect(s.tone).toBe('gray');
    expect(s.label).toBe('ประเมินไม่ได้');
    expect(s.headline).toBe('ยังประเมินไม่ได้ — ต้องมีค่าบริการ GEM หรืออัตรา EUR→THB อย่างน้อยหนึ่งค่า');
  });

  it('reports the IRR uplift when investment is known, and the gap when not', () => {
    const withInv = evalWith({ price_mid_thb: 25, platform_fee_pct: 10, eur_thb: 40 }, 10)!;
    expect(withInv.points.some((p) => /^REC เพิ่ม IRR ของโครงการโซลาร์จาก \d+\.\d{2}% เป็น \d+\.\d{2}%$/.test(p))).toBe(true);
    const noInv = evalWith({ price_mid_thb: 25, platform_fee_pct: 10, eur_thb: 40 })!;
    expect(noInv.points).toContain('ยังประเมินผลต่อ IRR ของโครงการไม่ได้ — ไม่มีข้อมูลเงินลงทุน');
  });

  it('money with vs without REC: electricity value + net REC, per year and over the horizon', () => {
    const s = evalWith({ price_mid_thb: 25, platform_fee_pct: 10, eur_thb: 40 })!;
    // 700 MWh × 1,000 × 4.18 ฿/kWh (PEA default) = 2,926,000 ฿/yr; REC net 71,625 over 5 yr.
    expect(s.money.tariff).toEqual({ value: 4.18, source: 'pea_default' });
    expect(s.money.without_year).toBeCloseTo(2_926_000, 0);
    expect(s.money.without_total).toBeCloseTo(14_630_000, 0);
    expect(s.money.rec_year).toBeCloseTo(14_325, 3);
    expect(s.money.rec_total).toBeCloseTo(71_625, 3);
    expect(s.money.with_year).toBeCloseTo(2_940_325, 0);
    expect(s.money.with_total).toBeCloseTo(14_701_625, 0);
  });

  it('money without a REC price: only the no-REC side, REC figures null', () => {
    const s = evalWith({ platform_fee_pct: 10, eur_thb: 40 })!;
    expect(s.money.without_year).toBeCloseTo(2_926_000, 0);
    expect(s.money.rec_year).toBeNull();
    expect(s.money.with_total).toBeNull();
  });

  it('money counts a loss-making REC path as a negative add-on', () => {
    const s = evalWith({ price_mid_thb: 1, platform_fee_pct: 10, eur_thb: 40 })!;
    expect(s.money.rec_total!).toBeLessThan(0);
    expect(s.money.with_total!).toBeLessThan(s.money.without_total);
  });

  it('returns null when there is no ROI to summarise (no data or not electricity)', () => {
    const assumptions = { ...EMPTY_REC_ROI_SETTINGS };
    const r = evaluateProjectRecRoi({ project: PROJECT, records: [], pdds: [], methodologies: [], factors: [], assumptions });
    expect(buildRecRoiSummary(r, assumptions)).toBeNull();
  });
});
