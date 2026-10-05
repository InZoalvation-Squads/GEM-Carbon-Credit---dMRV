# Investor Report (REC ROI + Scope 2) — Design

**Date:** 2026-10-06
**Status:** Approved (brainstorming) — awaiting spec review

## สรุป (ภาษาไทย)

รายงานสวยสำหรับนักลงทุน (ผู้ลงทุน/เจ้าของโครงการโซลาร์) ดาวน์โหลดเป็น PDF จากเว็บ
อิงเลย์เอาต์รายงาน Serwiz แต่ใช้แบรนด์ GEM (สี/ฟอนต์เดิม)
- ฉบับรวมพอร์ต (หน้าภาพรวม + 2 หน้าต่อโครงการ) จากหน้า `/rec-roi`
- ฉบับเดี่ยว (2 หน้า) จากแท็บ REC ROI ของแต่ละโครงการ
- หน้า 1 = การเงิน REC · หน้า 2 = Scope 2 ช่วยอะไร + เทียบ 3 ทาง (T-VER / ขาย REC / เก็บ REC redeem เอง)
- ข้อมูลจริงเท่านั้น: ขาดอะไรบอกว่าขาด ไม่ใส่ตัวเลขเดา

## Decisions (from brainstorming, all on recommended defaults)

1. Reader: investors / owners of the solar projects. Thai copy, technical terms in English.
2. Scope: portfolio report (overview page + 2 pages per project) **and** single-project report (2 pages).
3. Period: snapshot at download time, covering all measured data (same 365-day window the REC ROI uses).
4. Delivery: **Approach A** — an in-app A4 print page; the user saves it as PDF via the browser
   (`window.print()`), the same pattern as the SF-02/SF-04 official forms. Rejected: server-side PDF
   (new infra), offline script (numbers drift from the app).
5. Brand: GEM Carbon Credit, original look (memory `feedback-keep-original-look`: `brand-*` emerald,
   `ink-*` slate, Inter/Anuphan; green text uses `brand-700`, lightest text `ink-500`).
6. Length: 2 pages per project.
7. REC price: the org's REC ROI assumptions (mid price); none entered → break-even shown instead.
8. Investment: none recorded today → the IRR block says it is missing.
9. Load / grid import / export data: not available → those blocks are omitted (no Serwiz-style
   self-consumption split). Production only.
10. Time-of-day curve: not available (daily records) → monthly production bars instead.
11. Scope 2 options compared: T-VER credits vs REC sold vs REC retained & redeemed, with a
    no-double-claim warning.
12. Who consumes: unknown → Scope 2 figures assume all production is self-consumed, labelled.
13. Emission factors: location-based Scope 2 uses **TGO 0.4750 kgCO₂e/kWh, effective 2026-01-01**,
    kept in a dedicated data file — see §2 (changed from "add to the registry" during planning, user
    approved). Market-based residual mix: no official Thailand value → stated in words, no
    number.
14. Benefits named: ESG / CDP / SET disclosure and RE100.
15. No contact/CTA block. Preparer = "จัดทำจากข้อมูลวัดจริงในระบบ ณ วันที่ …", no person's name.
16. T-VER shown as tCO₂e only (no T-VER price input, no baht value).

## Facts the report relies on (sources)

- **No double claim (T-VER vs I-REC):** SF-04 Issue Request v1.2.1 (`docs/reference/rec/sf-04-issue-request-v1.2.1.pdf`):
  the registrant "warrants that the energy for which I-REC(E) certificates are being sought has not and
  will not be submitted for any other energy attribute tracking methodology, emissions reduction
  certificate, or carbon offset." SF-02 v1.4.1 §1.5 also asks for "any carbon offset or energy
  tracking scheme for which the Production Facility is registered".
- **TGO Scope 2 EF:** 0.4750 kgCO₂e/kWh, effective 2026-01-01 (transition: old factors allowed until
  2026-03-31) — [Nation Thailand, 2025-11-30](https://www.nationthailand.com/news/policy/40059019).
- **Residual mix:** I-REC markets in Asia rarely publish one — [GreenCalculus](https://greencalculus.com/glossary/residual-mix/).
- **Fees:** FN-01 2026 v2.1 (`data/rec-fees.ts`).
- **Market-based Scope 2 / RE100 with I-REC:** GHG Protocol Scope 2 Guidance (market-based method,
  EAC redemption) — cited by name; RE100 accepts I-REC for Thailand (to be opened and cited during
  implementation; if the page cannot be opened, the claim is stated without a link).

## 1. Data — `carbon-ready/src/lib/investor-report.ts` (pure)

```ts
export interface ProjectReportData {
  project: Project;
  generated_at: string;              // ISO, the snapshot time
  roi: ProjectRecRoi;                // from evaluateProjectRecRoi (existing)
  summary: RecRoiSummary | null;     // from buildRecRoiSummary (existing)
  monthly: Array<{ month: string; kwh: number }>;   // measured, driver-filtered, window only
  scope2: Scope2Block | null;        // null when not eligible / no data
}
export interface Scope2Block {
  factor: Scope2Factor | null;
  annual_tco2e_location: number | null;     // annual MWh × factor (assumes all self-consumed)
  tver: { tco2e_per_year: number; pdd_code: string } | null;  // null = no registered T-VER PDD
  rec: { recs_per_year: number; net_thb_total: number | null; years: number };
}
export interface PortfolioReportData {
  generated_at: string;
  projects: ProjectReportData[];     // eligible projects only, sorted by name
  totals: { mwh_year: number; recs_year: number; rec_net_total: number | null; tco2e_location_year: number };
}
export function buildProjectReport(args: { ...store slices..., projectId, now }): ProjectReportData | null;
export function buildPortfolioReport(args: { ...store slices..., now }): PortfolioReportData;
```

- `monthly`: group the same records `annualMwh` uses (driver filter, latest 365-day window) by
  `YYYY-MM`.
- Scope 2 factor: from `data/scope2-factors.ts` (§2) for the project's country with
  `effective_date ≤ window_end`. No factor → `factor` null and the block says so.
- T-VER tCO₂e/yr: the project's governing PDD (`governingPdd`) when its methodology standard is
  `T-VER` → `computeYearlyTable` with `year1_generation_kwh` = measured annual kWh → `avg.er`
  (TGO's own arithmetic, incl. PE). No T-VER PDD → null ("ไม่มี PDD T-VER").
- `rec_net_total` sums only projects with a computable mid-price net; null when none.

## 2. Scope 2 factor as data (NOT the shared emission-factor registry)

Decision during planning: the registry feeds registered T-VER PDDs (`gridFactor` picks the current TH
factor) and the Calculations/Credits pipeline (picked by date), so adding TGO 0.4750 there would
silently change official documents and 2026 credit figures. An organisation's Scope 2 EF and a T-VER
project EF are different factors anyway. So the report reads a separate, sourced data file
`carbon-ready/src/data/scope2-factors.ts` (pattern of `rec-fees.ts`):
`{ country: 'TH', source: 'TGO', value_kg_per_kwh: 0.475, effective_date: '2026-01-01', source_url }`.
The factor used is the newest entry for the project's country with `effective_date <= window_end`;
none → "ไม่มีค่า EF Scope 2 สำหรับช่วงข้อมูลนี้". The emission-factor registry and both seeds are
untouched.

## 3. Pages — `carbon-ready/src/templates/InvestorReport.tsx`

Print scope class `.inv-doc`, A4 pages (`@page { size: A4; margin: 12mm }`), CSS page counter,
`print-color-adjust: exact`, toolbar with "Print / PDF" hidden in print — same mechanics as
`EvidentSF02.tsx`. Routes (lazy, inside the authenticated shell, verifier → no-access like `/rec-roi`):
- `/reports/investor` — portfolio
- `/reports/investor/:projectId` — single project

**Portfolio overview page:** header (GEM logo, "รายงานนักลงทุน · REC และ Scope 2", org, generated
date, data window) · KPI strip (MWh/yr, REC/yr, REC net over horizon or "รอราคา REC", tCO₂e/yr
location-based) · ranking table (project, MWh/yr, break-even ข, ROI @mid, verdict label) · bar chart
of break-even ข per project with the entered mid price as a reference line (no line when no price).

**Project page 1 — การเงิน REC:** header (project, kWp, location, data window) · hero = the summary
headline + big number (REC net/yr, or break-even when no price) · KPI strip (MWh/yr, REC/yr,
break-even ข, ROI) · monthly production bars · money table with vs without REC (existing
`RecMoneyComparison`) · paths ก vs ข (break-even, net @mid, payback) · IRR block (uplift or
"ขาดข้อมูลเงินลงทุน").

**Project page 2 — Scope 2 ช่วยอะไร:** location-based reduction (tCO₂e/yr, factor + source +
version, "สมมติใช้ไฟเองทั้งหมด") · three-way table for the same MWh:

| ทาง | ได้อะไร | Scope 2 market-based / RE100 |
|---|---|---|
| ออก T-VER | tCO₂e/yr credits (or "ไม่มี PDD T-VER") | ไม่ได้สิทธิ์ claim ไฟสะอาด |
| ออก REC แล้วขาย | REC net ฿ (or รอราคา) | สิทธิ์ไปอยู่กับผู้ซื้อ |
| ออก REC แล้วเก็บ redeem | ค่าธรรมเนียมเท่านั้น | claim ไฟสะอาด X MWh/ปี · ใช้กับ RE100 |

· warning box quoting SF-04 (no double claim) · "ช่วยอะไรคุณ" bullets (ESG/CDP/SET, RE100) ·
residual-mix note · footnotes + sources · preparer line.

**Entry points:** "ดาวน์โหลดรายงานนักลงทุน" button on `/rec-roi` (portfolio) and on the project's
REC ROI tab (single).

## 4. Edge cases

| Case | Behaviour |
|---|---|
| No REC price | hero shows break-even; money "รอราคา REC"; REC-sold row "รอราคา" |
| Not eligible / no data | project omitted from portfolio; single route shows the same message as the tab |
| No investment | IRR block "ขาดข้อมูลเงินลงทุน" |
| No Scope 2 factor for the window | Scope 2 numbers replaced by "ไม่มีค่า EF Scope 2 สำหรับช่วงข้อมูลนี้" |
| No T-VER PDD | T-VER row "ไม่มี PDD T-VER" |
| Verifier | no-access (prices are commercial) |
| Partial year | "ข้อมูล N วัน ประมาณเป็นรายปี" on every annual figure's page |

## 5. Testing

- `lib/investor-report.test.ts`: monthly grouping; Scope 2 = MWh × factor with the right TH factor by
  date; T-VER avg.er via the PDD; portfolio totals and null handling; ineligible projects omitted.
- `templates/investor-report.ui.test.tsx`: portfolio renders overview + 2 pages/project; single
  route; no-price state; verifier no-access; SF-04 quote present; no person's name in the preparer
  line.
- `data/scope2-factors.test.ts`: the TGO entry and the by-date lookup.

## Out of scope

Load/import/export split, hourly curves, T-VER price/baht value, residual-mix number, server-side
PDF, emailing the report, scheduling.
