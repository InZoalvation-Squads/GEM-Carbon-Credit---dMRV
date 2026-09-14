# T-VER-S-F001-PDD แบบควบรวม — fidelity pass against the reference document

**Date:** 2026-09-14
**Status:** RESOLVED — every finding below is fixed and pinned by a test, except the
three items under "Deliberately left".
**Method:** rendered the six-site demo (PDD-2010, which is the reference document's own
anonymised data) to text and compared it page by page with the 59-page reference
`T-VER-S-F001-PDD.pdf` (แบบควบรวม, 2,009.30 kWp, บริษัท A–F).

This is the follow-up to `2026-09-07-tver-aggregated-pdd-gaps.md`. That audit closed the
structural gaps; this one compared the finished render with the original and found the
document still differed in numbering, arithmetic and wording.

## Defects visible in the rendered output

| # | Finding | Fix |
|---|---|---|
| 1 | Table numbers printed 1, 2, 4, 5 — number 3 was reserved for an installations table the reference does not have | Numbers now run over the tables that actually render (`nextTableNo()`); reference sequence 1 → 2 → 3 → 4 reproduced |
| 2 | Per-site appendix filed `เครื่องวัดไฟฟ้า` under อื่นๆ; the Energy Meter row read `-` | Bucket matches `เครื่องวัด` as well as `มิเตอร์` / `Meter` |
| 3 | §3.4 printed the floored-then-averaged ER, so ER_y ≠ BE_y − PE_y − LE_y inside its own table | §3.4 prints `avg.be − avg.pe` at 2 dp (reference: 1,025.59 − 1.08 = 1,024.51). The floored average stays on the cover and in §3.5, where the reference uses it |
| 4 | รูปที่ 1 / ภาพที่ 7 named the developer as ผู้ใช้ไฟฟ้า in bundle mode | Generic ผู้ใช้ไฟฟ้า box and `PEA / MEA` grid label in bundle mode |

## Layout and wording differences

- **ตารางที่ 2** — now the reference's wide layout: one row per site with กำลังการผลิต (kWp)
  and a ยี่ห้อ / รุ่น + จำนวน pair for Solar Panel, Inverter, Energy Meter. Items outside the
  three categories get an อื่นๆ pair only when one exists.
- **Owner / address** — one sub-table headed เจ้าของโครงการ | ที่ตั้งโครงการ; addresses no
  longer print twice.
- **Crediting period** — `7 ปี (1 มกราคม พ.ศ. 2570 ถึง 31 ธันวาคม พ.ศ. 2576)` on p.3, §1.5, §3.5.
- **§2.2** — method header block, Applicability sub-section, four numbered Project
  Conditions (the fossil-displacement condition was missing).
- **§2.3** — six emission sources with gases instead of three.
- **§3** — titles read *Baseline/Project Sequestration/Emission*; §3.1 / §3.2 / §3.4 carry
  the รหัส / เวอร์ชั่น / ชื่อ block with the reference's equations and กรณีที่ 2 lines.
- **§3.5** — checkboxes under the heading, `1 (1/1/2570 – 31/12/2570)` year cells, จำนวนปี row.
- **§4.1** — monitoring narrative instead of raw parameter keys. The operator's
  `qaqc_procedure` is quoted; meter-check and calibration intervals are *not* asserted.
- **Maintenance table** — headed ชื่อโครงการ (the 09-07 audit had changed it to
  เจ้าของโครงการ, which the reference does not use) plus the หมายเหตุ line; the nine
  maintenance topics are now verbatim (9 inverter and 9 panel-board items, not 8).
- **§4.3** — parameter cards carry the reference source / monitoring wording.
- **Per-site forecast** — starts at the earliest First Synchronization year with ปีที่ N
  sub-headers (page 31); totals blank before crediting.
- **Consumer appendix** — page-32 title and columns. New `qty` column on `consumers`
  multiplies the row in `computeEcPj` (5 × 8 W × 8,760 h = 350.40).
- **Per-site appendix** — Weather Sensor row (new `weather_sensor` column on
  `support_equipment`); `Brand / Model` values print as `ยี่ห้อ … รุ่น …`, one per line.
- **Cover** — ผู้พัฒนาโครงการ label above the developer; ตารางที่ 1 header and 2-dp รวม.

## Data, not template

- **Methodology identity** — the solar methodology now carries TGO's identifiers:
  `T-VER-S-METH-01-01`, version `03`, name *การผลิตไฟฟ้าจากพลังงานหมุนเวียน (Electricity
  Generation from Renewable Energy)*, scope `01 – Energy Industries`. `T-VER-S-01 v3.0` was
  an app-internal label that printed on p.3, §2.1 and every §3 block. Server seed JSON
  regenerated and loaded into Postgres; existing PDD rows keep their stored
  `methodology_snapshot` string.
- **Fixture** — PDD-2010/2011 completed from the reference: every site's panel, inverter
  and meter (p.9), weather sensors (p.25-30), fifteen consumer rows with quantities (p.32),
  §1.1 activity text. Reproduction tests render PDD-2010 and assert those tables.

## Deliberately left

1. **ตารางที่ 1 site rows.** The reference prints the 2570 calendar values (325,326 …) in the
   rows but sums each site's own first year (2,499,410) in the รวม — the two disagree in the
   document itself. The implementation prints own-first-year rows and their sum, which is
   internally consistent. Still a question for the document's preparer.
2. **Equipment datasheet pages (p.33-59).** Images of manufacturer datasheets; no slot in
   the form data. Attach separately.
3. **EF and the reference's own arithmetic.** The demo EF is 0.51 (reference 0.4021), so
   BE/ER figures differ by construction. The reference's consumer kWh column also rounds
   pump hours differently (2,227.11 vs 2,228.28 from its printed inputs); the fixture keeps
   the printed inputs.

## Verification

SPA: 535 tests, `tsc -b` clean. Server: `seed.test.ts` and `methodologies.test.ts` pass on
the isolated test schema; the full server suite was run after the change (see commit).
