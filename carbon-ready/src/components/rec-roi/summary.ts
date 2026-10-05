// Plain-language summary for a project's REC ROI tab: one verdict, one
// headline sentence and a few supporting points, all derived from the same
// ProjectRecRoi the tables below it render — never a separate calculation.
import { formatNumber } from '../../lib/format';
import { REC_FEES } from '../../data/rec-fees';
import type { RecPathOk, RecRoiAssumptions } from '../../lib/rec-roi';
import type { FinancialValue, ProjectRecRoi } from '../../lib/rec-roi-project';
import type { Tone } from '../ui/Badge';
import {
  cheapestPath, REC_PRICE_SCALE_THB_PER_MWH, REC_SHARE_LOW_PCT, recNetTotal, recShareOfElectricity, recommendedMid, recommendedPath,
} from '../../lib/investor-report';
import { PATH_SHORT, pct, pricePerMwh, thb } from './format';

/**
 * Money with vs without REC, undiscounted over the ROI horizon. "Without" is
 * the measured electricity valued at the tariff (PDD override or PEA default);
 * "with" adds the recommended path's net REC at the mid price. REC figures are
 * null until a mid price and a computable path exist.
 */
export interface RecMoneyComparison {
  tariff: FinancialValue;
  years: number;
  without_year: number;
  without_total: number;
  rec_year: number | null;
  rec_total: number | null;
  with_year: number | null;
  with_total: number | null;
}

export interface RecRoiSummary {
  tone: Tone;
  /** Short verdict for the badge: คุ้ม · ยังไม่คุ้ม · รอราคา · ประเมินไม่ได้ */
  label: string;
  headline: string;
  points: string[];
  money: RecMoneyComparison;
}

/** How each path reads inside a sentence ("ขาย REC <via>ที่ราคา …"); Thai runs on, so a path ending in Latin carries its own space. */
const SELL_VIA: Record<RecPathOk['path'], string> = { own: 'โดยเปิดบัญชี Evident เอง', platform: 'ผ่าน GEM ' };

const paybackPhrase =(months: number | null) =>
  months === null ? 'ไม่คืนทุนในระยะประเมิน' : months === 0 ? 'คืนทุนทันที' : `คืนทุนใน ${months} เดือน`;

/** Null when there is nothing to summarise (not electricity, or no measured data). */
export function buildRecRoiSummary(r: ProjectRecRoi, a: RecRoiAssumptions): RecRoiSummary | null {
  if (!r.eligible || r.annual.status !== 'ok' || !r.roi) return null;
  const { roi, annual } = r;
  const H = a.horizon_years;
  const ok = [roi.own, roi.platform].filter((p): p is RecPathOk => p.status === 'ok');
  // The path needing the lowest price is the one to aim for when nothing pays yet.
  const cheapest = cheapestPath(roi);

  const points: string[] = [
    `ผลิตได้ประมาณ ${formatNumber(annual.annual_mwh, 1)} MWh/ปี = ${formatNumber(annual.annual_mwh, 0)} REC/ปี `
      + `(จากข้อมูลวัดจริง ${annual.coverage_days} วัน${annual.partial ? ' ประมาณเป็นรายปี' : ''})`,
  ];
  if (roi.own.status === 'ok' && roi.platform.status === 'ok' && a.eur_thb !== null
      && roi.own.break_even_price_thb > roi.platform.break_even_price_thb) {
    points.push(`เปิดบัญชี Evident เองต้องขายได้อย่างน้อย ${pricePerMwh(roi.own.break_even_price_thb)} ฿/MWh `
      + `เทียบกับ${PATH_SHORT.platform} ${pricePerMwh(roi.platform.break_even_price_thb)} ฿/MWh — `
      + `ค่าบัญชี €${formatNumber(REC_FEES.account_annual_eur, 0)}/ปี (≈ ${thb(REC_FEES.account_annual_eur * a.eur_thb)}) กินรายได้เกือบทั้งหมด`);
  }
  const u = r.uplift;
  if (u?.status === 'ok' && u.without.irr_pct !== null && u.with.irr_pct !== null) {
    points.push(`REC เพิ่ม IRR ของโครงการโซลาร์จาก ${formatNumber(u.without.irr_pct, 2)}% เป็น ${formatNumber(u.with.irr_pct, 2)}%`);
  } else if (u?.status === 'missing_investment') {
    points.push('ยังประเมินผลต่อ IRR ของโครงการไม่ได้ — ไม่มีข้อมูลเงินลงทุน');
  }

  const tariff = r.financial_basis.elec_price_thb_kwh;
  const withoutYear = annual.annual_mwh * 1000 * tariff.value;
  const best = recommendedPath(roi);
  const mid = recommendedMid(roi);
  const recTotal = recNetTotal(r);   // one source for the REC net, shared with the investor report
  const money: RecMoneyComparison = {
    tariff, years: H,
    without_year: withoutYear,
    without_total: withoutYear * H,
    rec_year: recTotal === null ? null : recTotal / H,
    rec_total: recTotal,
    with_year: recTotal === null ? null : withoutYear + recTotal / H,
    with_total: recTotal === null ? null : withoutYear * H + recTotal,
  };

  if (!cheapest || !best) {
    return { tone: 'gray', label: 'ประเมินไม่ได้', points, money,
      headline: 'ยังประเมินไม่ได้ — ต้องมีค่าบริการ GEM หรืออัตรา EUR→THB อย่างน้อยหนึ่งค่า' };
  }
  const target = `ต้องขายได้อย่างน้อย ${pricePerMwh(cheapest.break_even_price_thb)} ฿/MWh (${PATH_SHORT[cheapest.path]}) จึงจะคุ้มทุนใน ${H} ปี`;
  if (!mid) {
    return { tone: 'gray', label: 'รอราคา', points, money, headline: `ยังไม่มีราคา REC — ${target}` };
  }
  if (mid.net_thb >= 0) {
    return { tone: 'green', label: 'คุ้ม', points, money,
      headline: `ขาย REC ${SELL_VIA[best.path]}ที่ราคา ${pricePerMwh(mid.price_thb)} ฿/MWh ได้กำไรสุทธิ ${thb(mid.net_thb)} `
        + `ใน ${H} ปี (ROI ${pct(mid.roi_pct)}) ${paybackPhrase(mid.payback_months)}` };
  }
  const where = ok.length === 2 ? 'ขาดทุนทั้งสองทาง' : `ขาดทุน (${PATH_SHORT[best.path]})`;
  return { tone: 'amber', label: 'ยังไม่คุ้ม', points, money,
    headline: `ที่ราคา ${pricePerMwh(mid.price_thb)} ฿/MWh ${where} — ${target}` };
}

const unsignedPct = (n: number) => `${formatNumber(Math.abs(n), 2)}%`;

const NEEDS_PRICE_AND_FEES = 'ต้องมีราคา REC และค่าธรรมเนียมครบ จึงบอกได้ว่า REC คิดเป็นกี่ % ของมูลค่าไฟ — ส่วนสิทธิ์ claim ไฟสะอาดดูหน้าถัดไป';
// Inputs are complete but REC loses money at this price: the alternative is keeping the claim.
const LOSS_REDEEM_INSTEAD = 'REC ขาดทุนที่ราคานี้ — ถ้าเก็บ REC ไว้ redeem เอง อ้างสิทธิ์ claim ไฟสะอาดได้แทนรายได้ ตามเกณฑ์ market-based / RE100 ของผู้ใช้ (ดูหน้าถัดไป)';

/**
 * The investor report's three executive-summary bullets, from the same
 * evaluation as everything else on the page. Bullet 2 has four distinct states
 * (net >= 0, net < 0, price but no computable path, no mid price); bullet 3
 * judges the size of REC income only when there is a real share to judge.
 * Null when there is nothing to summarise.
 */
export function buildExecutiveSummary(r: ProjectRecRoi, a: RecRoiAssumptions): [string, string, string] | null {
  const summary = buildRecRoiSummary(r, a);
  if (!summary || r.annual.status !== 'ok') return null;
  const { money } = summary;
  const mwh = r.annual.annual_mwh;
  const share = recShareOfElectricity(money, mwh);
  const cheapest = cheapestPath(r);
  const mid = recommendedMid(r);
  const path = recommendedPath(r);

  const first = `โครงการผลิตไฟ ${formatNumber(mwh, 1)} MWh/ปี คิดเป็นมูลค่าไฟประมาณ ${thb(money.without_year)}/ปี `
    + `(ค่าไฟ ${formatNumber(money.tariff.value, 2)} ฿/kWh · ${money.tariff.source === 'pdd' ? 'จาก PDD' : 'ค่าเริ่มต้น PEA'})`;

  if (a.price_mid_thb === null) {
    return [first,
      `ยังไม่มีราคากลาง REC — ทุก +${REC_PRICE_SCALE_THB_PER_MWH} ฿/MWh ของราคาขาย (หน่วยเทียบขนาด ไม่ใช่ราคาตลาด) `
        + `เพิ่มรายได้ ${thb(share.per10_thb)}/ปี ก่อนหักค่าธรรมเนียม`
        + (cheapest ? ` · ต้องขายได้อย่างน้อย ${pricePerMwh(cheapest.break_even_price_thb)} ฿/MWh จึงคุ้มค่าธรรมเนียม` : ''),
      NEEDS_PRICE_AND_FEES];
  }
  if (!mid || !path || money.rec_year === null) {
    return [first, 'มีราคา REC แล้ว แต่ยังคำนวณไม่ได้ — ขาดค่าบริการ GEM หรืออัตรา EUR→THB', NEEDS_PRICE_AND_FEES];
  }
  if (money.rec_year < 0) {
    return [first,
      `ที่ราคากลาง ${pricePerMwh(mid.price_thb)} ฿/MWh REC ขาดทุนสุทธิ ${thb(Math.abs(money.rec_year))}/ปี `
        + `(${share.share_pct === null ? '—' : unsignedPct(share.share_pct)} ของมูลค่าไฟ) — ยังไม่คุ้มค่าธรรมเนียม`
        + (cheapest ? ` · ต้องขายได้อย่างน้อย ${pricePerMwh(cheapest.break_even_price_thb)} ฿/MWh` : ''),
      LOSS_REDEEM_INSTEAD];
  }
  const second = `ถ้าขาย REC ${formatNumber(mwh, 0)} ใบ/ปี ที่ราคากลาง ${pricePerMwh(mid.price_thb)} ฿/MWh (${PATH_SHORT[path.path]}) `
    + `ได้เพิ่มสุทธิ ${thb(money.rec_year)}/ปี = ${share.share_pct === null ? '—' : unsignedPct(share.share_pct)} ของมูลค่าไฟ`;
  if (share.share_pct === null) return [first, second, NEEDS_PRICE_AND_FEES];
  return [first, second, share.share_pct < REC_SHARE_LOW_PCT
    ? 'รายได้จาก REC น้อยเมื่อเทียบกับมูลค่าไฟ — คุณค่าหลักของ REC คือสิทธิ์ claim ว่าใช้ไฟสะอาด ซึ่งเป็นของผู้ที่ถือหรือ redeem REC (ถ้าขาย REC ไป สิทธิ์นี้เป็นของผู้ซื้อ) — ดูหน้าถัดไป'
    : `REC เพิ่มรายได้ ${unsignedPct(share.share_pct)} ของมูลค่าไฟ — ถ้าเก็บ REC ไว้ redeem เอง อ้างสิทธิ์ claim ไฟสะอาดได้แทนรายได้ ตามเกณฑ์ market-based / RE100 ของผู้ใช้ (ดูหน้าถัดไป)`];
}
