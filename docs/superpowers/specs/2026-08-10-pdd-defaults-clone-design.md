# PDD Defaults + Clone — Design

**Date:** 2026-08-10
**Goal:** ลดจำนวน field ที่ user ต้องกรอกเองใน PDD ให้เหลือน้อยที่สุด โดยยึดกฎ real-data-only
(ห้ามเดาค่าเฉพาะโครงการ — ช่องว่างดีกว่าค่ามั่ว)

## Context

ฟอร์ม PDD ของ T-VER solar (T-VER-S-F001) มี ~80 fields; computed อัตโนมัติเพียง 10,
ที่เหลือ user กรอกเอง ข้อมูลดิบส่วนใหญ่อยู่ "ในหัว + ต้องไปถามทีม" ไม่ใช่เอกสารพร้อมดึง
Use case มีทั้ง fleet (หลายไซต์คล้ายกัน ข้อมูลซ้ำ 80–90%) และโครงการเดี่ยว
ทุกกลไกต้อง deterministic ล้วน (ไม่ใช้ LLM) ต่อยอดแนวเดียวกับ `pdd-drafts`

Out of scope รอบนี้: ขยาย pdd-drafts ไป textarea อื่น (แนวทาง B), ใบสั่งการบ้าน/checklist
ข้อมูลที่ต้องไปถามทีม (แนวทาง C), org profile entity แยก, การเปลี่ยนแปลงฝั่ง server

## 1. Schema additions (`carbon-ready/src/types/index.ts`)

เพิ่มใน `PddFieldSchema`:

- `defaultValue?: unknown` — ค่าเริ่มต้น seed เข้า `section_data` ตอนสร้าง PDD
- `siteSpecific?: boolean` — ข้อมูลเฉพาะไซต์ ถูกตัดออกเสมอตอน clone จากโครงการอื่น

## 2. Default rules (real-data-only)

Default ได้เฉพาะค่า "มาตรฐาน" ของ methodology — ไม่ใช่ fact เฉพาะโครงการ

กติกากลาง (ใน `lib/pdd.ts`):

- **Single-option select**: field `type: 'select'` ที่ `options.length === 1`
  default เป็นตัวเลือกนั้นอัตโนมัติ ไม่ต้องประกาศ `defaultValue`
- field อื่นใช้ `defaultValue` ที่ประกาศใน methodology data เท่านั้น

ค่า default ที่ประกาศใน `methodology-tver-solar.ts`:

| Field | Default | เหตุผล |
|---|---|---|
| `technology` | `Solar PV rooftop` | มาตรฐานของ methodology นี้ |
| `grid_connection` | `Grid-connected` | T-VER-S-01 คือ grid-connected |
| `registered_elsewhere` | `ไม่มี` | กรณีปกติ; เปลี่ยนได้ |
| `crediting_years` | `7` | ค่ามาตรฐาน T-VER |
| `degradation_pct` | `0.40` | ค่ามาตรฐานที่ help ระบุอยู่แล้ว |
| `monitored_parameter` | `EG_PJ — net electricity supplied to the grid` | จาก monitoringParams ของ methodology |
| `measurement_method` | `Revenue-grade bi-directional meter` | จาก monitoringParams |
| `monitoring_frequency` | `Monthly` | จาก monitoringParams |
| `baseline_scenario` | (rule single-option) | ตัวเลือกเดียว |

**ไม่ default**: `project_scale`, `performance_ratio`, ตัวเลขการเงิน (`investment_mthb`),
วันที่ทุกช่อง, ชื่อ/ที่อยู่/ใบอนุญาต — ขึ้นกับโครงการจริง เว้นว่าง

**จุด seed**: `selectMethodology` ใน `store/index.ts` — เปลี่ยน `section_data: {}` เป็น
`section_data: buildDefaults(methodology)` (helper ใหม่ใน `lib/pdd.ts`)
Seed เฉพาะตอนสร้าง PDD ใหม่; การเปลี่ยน methodology ของ PDD เดิมไม่ re-seed ทับข้อมูลที่กรอกแล้ว

## 3. Clone from previous project

- **จุดเข้า**: หน้า Registration หลังเลือก methodology — ถ้าองค์กรมี PDD อื่นที่ใช้
  methodology เดียวกัน แสดงตัวเลือก "คัดลอกข้อมูลจากโครงการก่อนหน้า" พร้อม list ให้เลือก
- **สิ่งที่ copy**: ทุก field ใน `section_data` ของ PDD ต้นทาง **ยกเว้น**
  - field ที่ `siteSpecific: true`
  - field `type: 'computed'` (คำนวณใหม่จากไซต์ใหม่อยู่แล้ว)
  - textarea ที่ draft ได้ (`draftableKeys` ใน `pdd-drafts.ts`) — มีชื่อ/ที่อยู่ไซต์เก่า
    ฝังอยู่ ให้ user กด ✨ ร่างใหม่จากข้อมูลไซต์ใหม่แทน
  - `evidence_ids` ไม่ copy
- **ลำดับความสำคัญ**: ค่าจาก clone ทับ defaults; user แก้ต่อได้ทุกช่อง
- **siteSpecific fields ของ solar**: `project_title_th`, `project_title_en`,
  `project_address`, `permit_no`, `permit_date`, `investment_mthb`, `project_scale`,
  `crediting_start`, `doc_completed_date`, `doc_revision`, `installations`,
  `year1_generation_kwh`
  (ตาราง `equipment_specs` **copy ได้** — fleet มักใช้แผง/inverter รุ่นเดียวกัน แก้ได้ถ้าไม่ใช่)
- สิ่งที่ติดมาฟรีสำหรับ fleet: preparer/coordinator ทั้ง section, owner, double counting,
  additionality (barrier + คำอธิบาย), monitoring plan — เกินครึ่งฟอร์ม

## 4. Error handling

- PDD ต้นทางที่ `section_data` มี key ที่ schema ปัจจุบันไม่รู้จัก → ข้าม key นั้น (ไม่พาข้อมูลผี)
- ไม่มี PDD ต้นทางให้เลือก → ไม่แสดงตัวเลือก clone เลย
- Clone แล้ว validation เดิม (`validatePdd`) ยังบังคับ required field ที่ถูกเว้นว่างตามปกติ

## 5. Testing

- **Unit** (`lib/pdd.test.ts` หรือไฟล์ใหม่): `buildDefaults` — single-option select ถูก
  default, `defaultValue` ถูก seed, field อื่นไม่ถูกใส่ค่า; clone filter — siteSpecific /
  computed / draftable / unknown key ไม่ติดมา, field ปกติติดมาครบ
- **UI** (`registration.ui.test.tsx`): สร้าง PDD ใหม่แล้ว field default ถูก pre-fill;
  flow clone — เลือกโครงการต้นทางแล้วช่องที่ควรว่างว่างจริง ช่องที่ควรติดมาติดมาจริง
