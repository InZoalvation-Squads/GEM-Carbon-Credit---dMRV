# REC Onboarding Guide + Checklist — Design

**Date:** 2026-08-14
**Status:** Approved

## Goal

When a project developer picks the REC program on the Register Project page, show a
step-by-step guide (3 phases) with a tickable document checklist so they know what
to prepare before and during SF-02 facility registration. Checked state persists in
the browser.

## Decisions (from brainstorming)

1. **Placement:** on the REC track screen — after picking REC in the program
   chooser, above the SF-02 methodology card. TGO track is unchanged.
2. **Tickable + persisted:** checkbox state lives in `localStorage` (per browser,
   not per user/project, no backend).
3. **Approach A chosen:** one self-contained component + one content data file.
   (Rejected: generic methodology-driven checklist system — YAGNI, single use
   case; read-only markdown — conflicts with decision 2.)

## Architecture

### 1. Content data — `carbon-ready/src/data/rec-guide.ts`

Typed constant, no logic:

```ts
interface RecGuideItem { id: string; label: string; detail?: string }
interface RecGuidePhase {
  key: string; title: string;
  notes: string[];        // non-tickable info lines (addresses, fees, timing)
  items: RecGuideItem[];  // tickable "prepare this" entries
}
export const REC_GUIDE_PHASES: RecGuidePhase[]
```

Three phases, content transcribed from EGAT Process Guide V12 and Evident SF-02
v1.3 only (`docs/reference/rec/` — real-data-only, no invented requirements):

- **Phase 1 — เปิดบัญชี Registrant (นอกระบบ, ครั้งเดียวต่อบริษัท):** items = STC
  Contract ลงนาม 2 ชุด, SF-01 กรอกครบ, หนังสือรับรองบริษัท (≤6 เดือน), หนังสือมอบอำนาจ
  (ถ้ามี), สำเนาบัตร/พาสปอร์ตผู้มีอำนาจลงนาม, บอจ.3/บอจ.4, บอจ.5, งบการเงิน (≤12 เดือน),
  ภ.พ.20 (ถ้าจด VAT). notes = ส่ง soft file ไป irecissuer@egat.co.th ให้ pre-check ก่อน;
  ส่งตัวจริง + จดหมายนำส่งถึงฝ่ายสัญญาซื้อขายไฟฟ้า กฟผ. (53 ม.2 ถ.จรัญสนิทวงศ์ บางกรวย
  นนทบุรี 11130); รอ Evident ส่งรหัสเข้าระบบ → ได้ Organisation ID.
- **Phase 2 — ขึ้นทะเบียนโรงไฟฟ้า SF-02 (กรอกในระบบนี้):** items = Evident Org ID,
  พิกัด lat/long ทศนิยม 6 ตำแหน่ง, กำลังติดตั้ง MW, หมายเลขมิเตอร์, จำนวนเครื่องกำเนิด,
  วัน COD, เจ้าของโครงข่าย + แรงดัน ณ จุดเชื่อม, รหัส Fuel/Technology ตาม SD-02,
  รูปถ่ายโครงการ, PPA, Single Line Diagram, หลักฐานกำลังติดตั้ง, หลักฐานปริมาณไฟที่ผลิต,
  ใบอนุญาตผลิตไฟฟ้า (พค.2/ERC), หลักฐานวัน COD, Meter Calibration Report (กรณี
  non-settlement meter), SF-02C Owner's Declaration (กรณีผู้ยื่นไม่ใช่เจ้าของ),
  Declaration/Notice Letter (กรณีมี onsite consumer). notes = กรอกในการ์ด SF-02
  ด้านล่าง; แนบไฟล์ในหน้า Evidence.
- **Phase 3 — EGAT ตรวจ + ค่าธรรมเนียม:** items = none (informational). notes =
  EGAT แจ้งผลทางอีเมลแล้วออก invoice — ชำระใน 30 วัน; ค่าธรรมเนียม 2025: ≥1–<3 MW
  19,000฿ · <1 MW 3,800฿ · <250 kW + digital metering ยกเว้น; ทะเบียนอายุ 5 ปี
  (ต่ออายุ 40% ของค่าแรกเข้า).

### 2. Component — `carbon-ready/src/components/registration/RecGuide.tsx`

- Accordion of the 3 phases; phase 1 expanded by default; card styling reuses the
  app's existing Tailwind idioms.
- Each tickable item renders a checkbox; each phase header shows `checked/total`.
- One "ล้าง checklist" action at the panel footer clears all ticks.
- Persistence: `localStorage` key `carbonready.rec-guide.v1` holding a JSON array
  of checked item ids; read once on mount, write on every toggle. Malformed or
  missing stored value falls back to empty (no crash).

### 3. Wiring

`carbon-ready/src/pages/Registration.tsx` renders `<RecGuide />` between the
back button and the methodology card grid, only when `program === 'rec'`.
No other page changes; no server changes.

## Error handling

localStorage unavailable/throwing (private mode) → component still renders and
ticks work for the session (state in React); persistence silently degrades.

## Testing

UI tests (`registration.ui.test.tsx` or a dedicated `recguide.ui.test.tsx`):
- Picking REC shows the guide with 3 phase headers; picking TGO shows no guide.
- Ticking an item updates the phase counter and writes the id to localStorage.
- Re-render (fresh mount) restores checked state from localStorage.
- "ล้าง checklist" clears counters and storage.

## Out of scope

- Per-user/per-project persistence (server-side).
- Any change to the SF-02 methodology document or registration flow.
- TGO-side guide.
