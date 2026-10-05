# REC ROI per Project — Design

**Date:** 2026-10-05
**Status:** Approved (brainstorming) — awaiting spec review

## สรุป (ภาษาไทย)

เพิ่มการประเมินความคุ้มค่าของ REC (I-REC(E)) ต่อโปรเจกต์ ถ้าลูกค้าลงทะเบียนผ่านเว็บเรา
แสดง 2 มุม: (1) ROI ของการทำ REC เอง — รายได้ขาย REC เทียบค่าใช้จ่าย EGAT/Evident
และ (2) IRR uplift — IRR/payback ของโซลาร์ทั้งโครงการ แบบไม่มี REC vs มี REC
เทียบ 2 เส้นทาง: ก) เปิด Evident Trade account เอง ข) ขายผ่านแพลตฟอร์ม/เทรดเดอร์ (ค่าบริการ %)

- ไม่มีราคากลาง REC ในไทย (ตลาดสมัครใจ/OTC) → ราคาให้ผู้ใช้กรอก 3 ระดับ + ที่มา, ไม่มีค่า default
- ราคาคุ้มทุนคำนวณได้เสมอจาก kWh จริง + ค่าธรรมเนียม FN-01 2026 v2.1
- MWh/ปี จากข้อมูลวัดจริงเท่านั้น — ไม่มีข้อมูล = ไม่คำนวณ
- คำนวณใน SPA (pure function), server เก็บแค่สมมติฐานระดับองค์กร + ค่าต่อโปรเจกต์
- หน้าใหม่ `/rec-roi` (พอร์ต) + แท็บ "REC ROI" ใน ProjectDetail

## Goal

For every project, show whether registering for I-REC(E) through the platform
pays off, using only real data: measured generation and the official EGAT /
Evident fee schedule. Market price — which has no public reference in
Thailand — is an explicit, sourced user input; the system always shows the
break-even price so the answer is useful even before a price is known.

## Decisions (from brainstorming)

1. **Both ROI views:** standalone REC ROI (revenue vs REC costs) *and* the
   uplift REC gives to the whole solar project's IRR/payback.
2. **REC price = user input, three scenarios (low/mid/high), no default.**
   Research found no central price source to pull from:
   - EGAT (Local Issuer) publishes fees only (FN-01).
   - Evident registry exposes participant transactions, no prices.
   - I-TRACK monthly Market Statistics: issuance/redemption volumes per
     country, no prices, downloadable file, no API.
   - Thai market is voluntary/OTC with no reference price (REC Thailand).
   - Price assessments exist only as paid services (S&P Global Platts,
     Xpansiv CBL); figures on installer blogs are unofficial.
   A paid feed can later replace the price inputs; out of scope now.
3. **Both account paths compared side by side:** (ก) own Evident Trade
   account; (ข) via platform/trader at a user-entered service fee %.
   The platform fee is also an input with no default.
4. **Placement:** new portfolio page `/rec-roi` + "REC ROI" tab in
   ProjectDetail sharing one `RecRoiDetail` component.
5. **Assumptions stored server-side per organization** (team sees the same
   numbers, audited), plus optional per-project settings.
6. **Annual MWh from measured data only.** No kWp × sun-hours × PR fallback.
7. **Approach A:** calculation is a pure SPA function (`lib/rec-roi.ts`);
   fees are a versioned data file; server stores inputs only. (Rejected:
   server-side calculation — would need yet another copy of the financial
   lib on the server, cf. drift fixed in cb1588f; fees in DB — fees change
   yearly and the source PDF is archived, YAGNI.)

## Source documents (real-data-only)

- `docs/reference/rec/egat-fee-structure-2026-v2.1.pdf` — I-REC(E) Fee
  Structure 2026 v2.1.
  - p.1 Participant fees: account opening €500 one-time; annual account fee
    €2,000 (on opening and each anniversary); redemption €0.06/MWh.
  - p.4 EGAT Local Issuer: registrant application ฿0; facility registration
    (5-year validity) ≥3 MW ฿38,000 · ≥1 MW & <3 MW ฿19,000 · ≥250 kW &
    <1 MW ฿3,800 · <250 kW ฿3,800 · <250 kW with approved digital meter
    reading access ฿0; renewal 40% of registration fee; issuance ฿0.95/MWh;
    self-consumption issuance ฿1.33/MWh.
- Existing PEA evaluation defaults in `computeFinancialTable`
  (`carbon-ready/src/lib/pdd.ts`): tariff 4.18 ฿/kWh, discount 7%, O&M 1% of
  investment from year 7, 25-year life, 5% scrap.

Redemption fees are excluded: the seller does not redeem; the buyer does.

## 1. Calculation — `carbon-ready/src/lib/rec-roi.ts`

Pure functions, no store/API imports.

### 1.0 Eligibility

REC applies to electricity generators only. A project is evaluated when
`capacity_kwp > 0` and its methodology (newest PDD, registered preferred)
has `calculation.input_unit === 'kWh'`, or it has no PDD yet. Others
(forestry, landfill gas in tCO₂e, …) are left out of the portfolio table
with a footnote, and their REC ROI tab says REC does not apply.

### 1.1 Annual MWh (`annualMwh`)

- Input: the project's monitoring records, filtered like `calculateCarbon`:
  rows with no `param_key` or `param_key` equal to the project methodology's
  `calculation.input_param`; if no methodology is known, all of the project's
  records.
- Window: the 365 days ending at the latest `record_date`
  (`latest − 364 … latest`, inclusive).
- `coverage_days` = days from the earliest record in the window to the latest,
  inclusive.
- `coverage_days ≥ 365` → `annual_mwh = Σkwh / 1000`.
  Otherwise → `annual_mwh = Σkwh / coverage_days × 365 / 1000` with
  `partial: true`.
- No records → `{ status: 'no_data' }`; nothing downstream is computed.
- Returns `{ annual_mwh, window_start, window_end, coverage_days, partial }`.

### 1.2 Fees — `carbon-ready/src/data/rec-fees.ts`

A typed constant `REC_FEES_2026` with `version: 'FN-01 2026 v2.1'`,
`source: 'docs/reference/rec/egat-fee-structure-2026-v2.1.pdf'`, page refs
in comments, and the values listed above. RecIssueModal's local
`FEE_PER_MWH` is switched to read from this file (single source).

`registrationFeeThb(capacity_kwp, digitalMeterExempt)`: tiers use `≥` at
the boundaries (250 / 1,000 / 3,000 kWp): `≥3000 → 38,000`,
`≥1000 → 19,000`, else `3,800`; `capacity_kwp < 250 && digitalMeterExempt
→ 0`.

### 1.3 Per-path cost model over `horizon_years` (undiscounted)

Year index y = 1…H. `R` = registration fee, `M` = annual MWh, `i` = issuance
fee/MWh (by issuance type), `P` = price.

- Registration: `R` in year 1; renewal `0.4 × R` in years 6, 11, 16, 21.
- Issuance: `M × i` every year.
- Path ก (own account): additionally `500 × FX` in year 1 and
  `2,000 × FX` every year. Requires `eur_thb`; otherwise
  `{ status: 'missing_fx' }`.
- Path ข (platform): additionally `fee% × M × P` every year. Requires
  `platform_fee_pct`; otherwise `{ status: 'missing_fee' }`.

Outputs per path:

- `fixed_cost_thb` = Σ registration + renewals (+ account fees for ก).
- `break_even_price` = `(fixed_cost_thb + H × M × i) / (H × M × (1 − fee%))`
  (fee% = 0 for ก). Always computed when the path's inputs exist.
- For each entered price scenario: `revenue`, `cost`, `net = revenue − cost`,
  `roi_pct = net / cost × 100`, `payback_months` — cash is modelled with
  each year's lump costs (registration/renewal, account opening, annual
  account fee) at the start of that year and the per-MWh margin spread evenly
  per month; payback is the first month after which cumulative cash stays
  ≥ 0 through the end of the horizon (a later renewal can pull it back
  below zero). `null` → "ไม่คืนทุนในระยะประเมิน".
- Recommended path: higher `net` at the mid price; with no mid price, the
  lower `break_even_price`; if neither path is computable → none, with the
  list of missing inputs.

### 1.4 IRR uplift

- `computeFinancialTable(ctx, extraBenefit?)` gains an optional
  `extraBenefit: (year: number, generationKwh: number) => number`, added to
  each year's benefit. Omitted → output is byte-for-byte identical to today
  (protects the MCRU-verified PDD appendix).
- Context: `year1_generation_kwh` = measured `annual_mwh × 1000`;
  `investment_mthb` from the project's newest T-VER PDD `section_data`, else
  the per-project setting; neither → `{ status: 'missing_investment' }`.
  Other parameters fall back to the existing PEA defaults, labelled as such
  in the UI.
- `extraBenefit` = REC net per year for the recommended path at the mid
  price, using that year's degraded generation:
  `gen/1000 × (P × (1 − fee%) − i)` minus that year's fixed costs
  (registration/renewal and account fees as in 1.3). Over the 25-year life the
  renewal cycle continues every 5 years.
- Output: `{ without: { irr_pct, payback_years }, with: { irr_pct,
  payback_years } }`. Requires a mid price.

## 2. Storage — server + demo mode

### 2.1 Prisma (one migration)

```prisma
model RecRoiSettings {
  organization_id   String   @id
  price_low_thb     Float?   // ฿/MWh; null = not entered (no default)
  price_mid_thb     Float?
  price_high_thb    Float?
  price_source      String   @default("")
  platform_fee_pct  Float?
  eur_thb           Float?
  eur_thb_source    String   @default("")  // "BOT 2026-10-03" | "manual"
  horizon_years     Int      @default(5)   // = FN-01 registration validity
  updated_by        String
  updated_at        DateTime @updatedAt
  @@map("rec_roi_settings")
}

model RecRoiProjectSetting {
  project_id            String  @id
  issuance_type         String  @default("Normal") // 'Normal' | 'Self consumption'
  digital_meter_exempt  Boolean @default(false)
  investment_mthb       Float?
  updated_by            String
  updated_at            DateTime @updatedAt
  @@map("rec_roi_project_settings")
}
```

Both relate to their Organization / Project.

### 2.2 API — `server/src/modules/rec-roi/`

Same shape as `rec-issues` (org-scoped, zod, `actorFromRequest` audit).

- `GET /api/v1/rec-roi/settings` → settings or all-null defaults.
- `PUT /api/v1/rec-roi/settings` → upsert; audit `REC_ROI_SETTINGS_UPDATED`.
- `GET /api/v1/rec-roi/project-settings` → every saved project setting in
  the org (the portfolio page needs all of them at once).
- `PUT /api/v1/projects/:id/rec-roi-setting` → upsert; audit
  `REC_ROI_PROJECT_UPDATED`; another org's project → 404.
- `GET /api/v1/fx/eur-thb` → Bank of Thailand exchange-rate API, dormant
  until `BOT_API_TOKEN` is set in `server/.env` (same pattern as the IoT
  worker). No token → `{ available: false }`. Upstream failure → 200
  `{ available: true, rate: null, error }` (the API error envelope masks 5xx
  messages, so the reason travels in the body); the UI keeps manual entry.

Validation (zod, mirrored in the SPA):
- prices > 0 and `low ≤ mid ≤ high` among those entered;
- any price entered → `price_source` non-empty;
- `0 ≤ platform_fee_pct < 100`; `1 ≤ horizon_years ≤ 25`; `eur_thb > 0`;
- `investment_mthb > 0`; `issuance_type ∈ {'Normal','Self consumption'}`.

Permissions:
- Org settings: read/write `admin`, `esg_manager`; read `project_owner`.
- Project setting: write by `admin`, `esg_manager` and `project_owner` of
  the same org (projects carry no per-user owner, so org scoping is the
  boundary).
- `verifier`: no access (403) — prices and fees are commercial data.

### 2.3 Demo mode

Zustand store slice + dual-mode `api.ts` methods, as existing features.
Persist key bumped v17 → v18. Fixtures leave every price, fee and FX null
(real-data-only), so the demo shows the "break-even only" state.

Results are never stored; they are recomputed from current records.

## 3. UI

- **Sidebar:** "REC ROI" under REC Issuance; roles `admin`,
  `project_owner`, `esg_manager`.
- **`/rec-roi` page (`pages/RecRoi.tsx`):**
  1. `RecRoiAssumptions` card — low/mid/high price, price source, platform
     fee %, EUR→THB with "ดึงจาก BOT" (hidden when unavailable) and its
     source, horizon years, last-updated by/at. Note: no reference price
     exists in Thailand; enter prices from real offers. Read-only for
     `project_owner`.
  2. Portfolio table — project, MWh/yr (⚠ "ข้อมูล N วัน" when partial),
     break-even ก / ข, ROI at mid, recommended path; "ไม่มีข้อมูล kWh" rows;
     portfolio total REC/yr. ROI shows "—" until a mid price exists.
     Footer cites FN-01 2026 v2.1 with a link to the PDF. Row click →
     `/projects/:id?tab=rec-roi`.
- **ProjectDetail:** new "REC ROI" tab rendering `RecRoiDetail`:
  1. Paths ก | ข side by side — cost breakdown, break-even, 3-price table
     (revenue, net, ROI %, payback months).
  2. MWh basis — window dates, coverage days, partial warning.
  3. IRR uplift — without vs with REC, investment source (PDD / manual),
     "PEA default" labels.
  4. Project settings — issuance type, digital-meter exemption (shown only
     when capacity < 250 kWp), manual investment. If the project has an
     SF-04 request, its `request_type` is suggested but never overwrites a
     saved setting.
- Every empty state names the missing input and links to where to fill it.

## 4. Edge cases

| Case | Behaviour |
|---|---|
| net ≤ 0 | negative ROI in red; payback "ไม่คืนทุนในระยะประเมิน" |
| Path ก without FX | ก = `missing_fx`; ข still computed |
| No fee and no FX | no recommendation; list missing inputs |
| Horizon > 5 | renewal 40% at the start of each 5-year cycle |
| Capacity on a tier boundary | `≥` (1,000 kWp → ฿19,000) |
| IRR has no sign change | "—" (existing `irrFromFlows`) |
| BOT down / bad token | `rate: null` + error message; manual entry still works |

## 5. Testing

- `lib/rec-roi.test.ts`: fee tiers at 249.99/250/1000/3000 kWp and the
  digital-meter exemption; renewal in year 6; break-even vs hand-computed
  values; 92-day annualisation; `no_data`; driver-param filtering;
  `missing_fee` / `missing_fx`; recommendation logic.
- `lib/pdd.test.ts`: `computeFinancialTable` without `extraBenefit` is
  unchanged (existing MCRU fixtures); with a positive `extraBenefit` IRR
  rises.
- `server/src/modules/rec-roi/rec-roi.test.ts`: org scoping, verifier 403,
  project_owner cannot write org settings, zod rejects mis-ordered prices
  and missing source, audit rows written, FX `available:false` without
  token and mocked fetch with token.
- `pages/recroi.ui.test.tsx`: empty state shows break-even only; entering
  prices shows ROI; sidebar visibility per role; ProjectDetail tab renders.
- Store persist v17 → v18 per the existing pattern.

## Out of scope

Paid price-feed integration; storing ROI snapshots for documents; admin-
editable fees in DB; non-EGAT issuer fees; discounting the standalone REC
ROI; REC trading/transfer.
