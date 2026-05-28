# Carbon Ready — คู่มือการใช้งาน / User Guide (Step by Step)
**Solar Rooftop dMRV · Sprint 1 + Sprint 2**

> คู่มือนี้บอก "กดตรงไหน เกิดอะไรขึ้น" แบบทีละขั้น (ไทยนำ → English). อ้างอิงตามสิ่งที่แอปทำได้จริงในบิลด์ปัจจุบัน.
> Step-by-step "click here → this happens" guide. Thai first, then English. Reflects what this build actually does.

---

## 0. เริ่มต้น / Before you start

1. รันแอป / Start the app:
   ```bash
   cd carbon-ready && npm install && npm run dev
   ```
2. เปิดเบราว์เซอร์ที่ `http://localhost:5173` (หรือ `5174` ถ้าพอร์ตชน) — จะเด้งเข้าหน้า **Dashboard** อัตโนมัติ.
3. เมนูซ้ายมือ (Sidebar): Dashboard · Projects · Upload · Calculations · Emission Factors · **Verifications** · Audit Log.

**บทบาท / Roles:** ผู้ใช้ปัจจุบันคือ *Asha Iyer* (ESG Manager). ในบิลด์เดโม ผู้ใช้คนเดียวทำได้ทุกบทบาท แต่ระบบจะบันทึก "role" ลง audit log ทุกครั้ง.
**EN:** The demo signs you in as *Asha Iyer* (ESG Manager). One user can perform every role here; the audit log still records the acting role on each event.

---

## A. สำหรับเจ้าของโครงการ / Project Owner

### ขั้นที่ 1 — สร้างโครงการ / Create a project
1. คลิก **Projects** ที่ sidebar.
2. กดปุ่ม **+ New Project** (มุมขวาบน) → เปิด modal.
3. กรอก: ชื่อโครงการ, location (เช่น `Chiang Mai, Thailand`), capacity (kWp), commission date, status.
4. กด **Create**.
   - ✅ ผลลัพธ์: โครงการใหม่โผล่บนสุดของรายการ และมี audit log `PROJECT_CREATED` เพิ่มขึ้น.
   - **EN:** New project appears at the top; a `PROJECT_CREATED` audit row is written.

### ขั้นที่ 2 — อัปโหลดข้อมูลการผลิต (CSV) / Upload monitoring data
1. คลิก **Upload** ที่ sidebar.
2. เลือกโครงการจาก dropdown.
3. ลากไฟล์ CSV (คอลัมน์ `Date,Generation_kWh`) ลงกล่อง หรือคลิกเพื่อเลือกไฟล์.
4. ระบบตรวจ validation รายแถว — แถวผิด (วันที่ซ้ำ / ค่าติดลบ / รูปแบบผิด) จะถูกแยกให้เห็น.
5. กด **Confirm / Save** เพื่อบันทึกเฉพาะแถวที่ผ่าน.
   - ✅ ผลลัพธ์: records ถูกเพิ่มเข้าโครงการ + audit `CSV_UPLOADED` (accepted/rejected).

### ขั้นที่ 3 — จัดการ Emission Factor
1. คลิก **Emission Factors**.
2. กด **+ Add Factor** → กรอก country, source, ค่า (kgCO₂e/kWh), effective date.
3. กด **Save**.
   - ✅ ถ้าเพิ่มค่าใหม่ของ country/source เดิม → เวอร์ชันเก่าจะถูก **supersede** อัตโนมัติ (เหลือ current หนึ่งค่า) + audit `EMISSION_FACTOR_ADDED`.

### ขั้นที่ 4 — คำนวณคาร์บอน / Run calculation
1. คลิก **Calculations**.
2. เลือกโครงการ → ระบบจับคู่ EF ตามประเทศของโครงการให้อัตโนมัติ.
3. ดูผล: KPI รวม + แท็บ daily / monthly / total + กราฟแนวโน้มรายเดือน.
   - ✅ audit `CALCULATION_EXECUTED` ถูกบันทึก.

### ขั้นที่ 5 — อัปโหลดหลักฐาน / Upload evidence  ⭐ (Sprint 2)
1. ไปที่ **Projects → เลือกโครงการ** (เช่น *Pune Rooftop Phase 1*).
2. คลิกแท็บ **Evidence** (อยู่ถัดจาก Monitoring).
3. กดปุ่ม **+ Upload Evidence** → เปิด modal.
4. ลากไฟล์ (PDF/JPG/PNG/XLSX ≤ 50 MB) ลงกล่อง — หรือกด **“+ Add sample files (demo)”** เพื่อลองเร็ว ๆ.
5. ระบบเดา **category** ให้จากชื่อไฟล์ — แก้ได้จาก dropdown ของแต่ละไฟล์ (7 หมวด เช่น Meter Reading, Utility Bill…).
6. ใส่ description (ถ้าต้องการ) แล้วกด **Upload N files**.
   - ✅ ผลลัพธ์: ไฟล์ขึ้นบนสุดของ library, มี toast “uploaded · audit log updated”, และ audit `EVIDENCE_UPLOADED`.
   - **EN:** Files appear at the top, a toast confirms, and an `EVIDENCE_UPLOADED` audit row is written.

### ขั้นที่ 6 — ดู / จัดเวอร์ชัน / Archive หลักฐาน
1. ในแท็บ Evidence **คลิกชื่อไฟล์** → เปิด drawer ด้านขวา (preview + รายละเอียด + ประวัติเวอร์ชัน + comment ที่เกี่ยวข้อง).
2. **Replace version:** กด **Replace version** ใน drawer → สร้าง v2, เวอร์ชันเดิมกลายเป็น `superseded` (ยังเก็บไว้) + audit `EVIDENCE_REPLACED`.
3. **Archive:** กด **Archive** → ไฟล์หายจาก list หลัก (ดูได้ด้วยปุ่ม **Show archived**) + audit `EVIDENCE_ARCHIVED`.
4. **ค้นหา/กรอง:** ใช้ช่องค้นหา (ชื่อไฟล์/คำอธิบาย), dropdown หมวด, และปุ่ม Show archived.
   - 🔒 หมายเหตุ: ไฟล์ที่อยู่ในแพ็กเกจที่ **อนุมัติแล้ว** จะถูกล็อก (Replace/Archive จะถูกปิด).

---

## B. สำหรับผู้ตรวจสอบ / Verifier

> ในบิลด์นี้มีแพ็กเกจตัวอย่างให้ทดลองแล้ว: `VR-1001` (under review), `VR-1002` (submitted), `VR-1003` (revision required), `VR-1000` (approved/locked).

### ขั้นที่ 7 — เปิดคิวรีวิว / Open the review queue
1. คลิก **Verifications** ที่ sidebar.
2. ด้านบนมี KPI strip (Open packages · Median cycle · Revision rate · Approved). ด้านล่างเป็นคิว พร้อม **สถานะ** และ **ตัวนับ SLA** (เช่น `4d / 7d`; เกินกำหนดจะเป็นสีแดง).
3. ใช้แท็บกรองสถานะ (All / Submitted / Under Review / …) ได้.
4. **คลิกแถว** เพื่อเข้าหน้ารีวิว (`/verifications/:id`).

### ขั้นที่ 8 — เริ่มรีวิว + คอมเมนต์ / Start review & comment
1. ถ้าแพ็กเกจสถานะ **Submitted** → กดปุ่ม **Start review** (มุมขวาบน) → สถานะเปลี่ยนเป็น *Under Review* + audit `REVIEW_STARTED`.
2. ฝั่งซ้ายดู: สรุปแพ็กเกจ, **Required categories** (ติ๊กเขียว = มีครบ / เหลือง = ขาด), และรายการ Evidence.
3. ฝั่งขวาในการ์ด **Conversation** พิมพ์ข้อความ → กด **Comment** → audit `COMMENT_ADDED`.

### ขั้นที่ 9 — ขอแก้ไข / Request revision
1. ในการ์ด **Verifier actions** กด **Request revision**.
2. กรอกข้อความอธิบายสิ่งที่ต้องแก้ (บังคับ) → กด **Send revision request**.
   - ✅ สถานะ → *Revision Required* + audit `REVISION_REQUESTED` (เก็บข้อความไว้ใน diff).

### ขั้นที่ 10 — อนุมัติ + ล็อก / Approve & lock
1. ในการ์ด **Verifier actions** กด **Approve & lock** → เปิด modal.
2. อ่านผลที่จะเกิด (evidence อ่านอย่างเดียว, ค่าคาร์บอน final, เขียน audit แบบ hash-sealed).
3. **ติ๊กช่อง “I confirm I have reviewed all evidence.”** (ปุ่ม Approve จะกดได้ก็ต่อเมื่อติ๊กแล้ว).
4. กด **Approve**.
   - ✅ สถานะ → *Approved*, แพ็กเกจถูกล็อก, เขียน `hash_value`, ขึ้นแบนเนอร์ 🔒 “anchoring pending — Hedera Guardian (Sprint 3)”, + audit `VERIFICATION_APPROVED`.

### ขั้นที่ 11 — ปฏิเสธ / Reject
1. กด **Reject** → กรอกเหตุผล (บังคับ) → **Reject package**.
   - ✅ สถานะ → *Rejected* (สิ้นสุด) + audit `VERIFICATION_REJECTED`.

---

## C. ตรวจสอบย้อนหลัง / Audit Trail

### ขั้นที่ 12 — ดู Audit log + ตรวจ hash chain
1. คลิก **Audit Log** ที่ sidebar.
2. ด้านบนมีแบนเนอร์ **“Hash chain verified · N rows”** (สีเขียว = ลูกโซ่สมบูรณ์; ระบบคำนวณใหม่สดในเบราว์เซอร์).
3. กรองด้วย Action / Entity / ช่วงวันที่.
4. แต่ละแถวแสดง เวลา · role · action · entity · **diff ก่อน→หลัง** · `row_hash`.
   - **EN:** The banner re-verifies the chain live; each row shows a field-level before→after diff and its `row_hash`.

---

## D. รีเซ็ตข้อมูล / Reset to seed
เปิด DevTools console แล้วรัน:
```js
localStorage.removeItem('carbon-ready-store-v2'); location.reload();
```
ข้อมูลทั้งหมดจะกลับเป็นชุดตัวอย่าง (Pune/Bangkok/Hanoi + evidence + VR-1000..1003).

---

## E. ข้อจำกัดของบิลด์นี้ / Known gaps in this build

ตามตรง — ฟีเจอร์เหล่านี้ออกแบบไว้ใน Sprint 2 plan แต่ **ยังไม่ได้ต่อปุ่มใน UI** ของบิลด์เดโม (มี action ใน store/API แล้ว รอเชื่อม):

| สิ่งที่ยังไม่มีปุ่มใน UI | สถานะ | หมายเหตุ |
|---|---|---|
| สร้างแพ็กเกจ verification ใหม่ (Package Builder) | seed-only | แพ็กเกจมาจาก seed; ยังสร้างใหม่จากหน้า UI ไม่ได้ (action `createVerification` ยังไม่ถูก expose) |
| ปุ่ม Submit (draft → submitted) ของเจ้าของโครงการ | store/API พร้อม | ยังไม่มีปุ่มในหน้า |
| Resubmit หลัง Revision Required (กลับเข้า review) | store/API พร้อม | ยังไม่มีปุ่ม; แพ็กเกจสถานะ Revision Required จึงยังกด Approve ไม่ได้ |
| Export audit เป็น CSV | planned | อยู่ใน Sprint 2 plan (`docs/05`, `docs/08`) |

แผนเต็มของฟีเจอร์เหล่านี้อยู่ใน `/Users/oppabig/dmrv-sprint2/docs/` (user stories US-B1/B2/B5, API spec, backlog).

---

## สรุปลำดับงานทั่วไป / Typical end-to-end order
1. สร้างโครงการ → 2. อัปโหลด CSV → 3. ตั้ง Emission Factor → 4. คำนวณคาร์บอน → 5. อัปโหลดหลักฐาน → 6. (เปิดแพ็กเกจจากคิว) → 7. รีวิว → 8. คอมเมนต์/ขอแก้ → 9. อนุมัติ+ล็อก → 10. ตรวจ Audit log.

*ดูสถาปัตยกรรม/โครงสร้างข้อมูลเชิงลึกได้ที่ `dMRV-Working-Doc.md` (หรือ .pdf) ในโฟลเดอร์เดียวกัน.*
