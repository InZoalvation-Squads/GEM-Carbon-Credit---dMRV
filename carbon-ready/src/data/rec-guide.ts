// REC onboarding guide content — transcribed from EGAT Process Guide V12 and
// Evident SF-02 v1.3 (docs/reference/rec/). Do not add or reword requirements
// without checking the source documents (real-data-only policy).

export interface RecGuideItem {
  id: string;
  label: string;
  detail?: string;
}

export interface RecGuidePhase {
  key: string;
  title: string;
  /** Non-tickable info lines: addresses, fees, timing. */
  notes: string[];
  /** Tickable "prepare this" entries. */
  items: RecGuideItem[];
}

export const REC_GUIDE_PHASES: RecGuidePhase[] = [
  {
    key: 'registrant',
    title: '① เปิดบัญชี Registrant กับ EGAT (นอกระบบ — ทำครั้งเดียวต่อบริษัท)',
    notes: [
      'ส่ง soft file ทั้งชุดไป irecissuer@egat.co.th เพื่อ pre-check ก่อนส่งตัวจริง',
      'ส่งตัวจริง + จดหมายนำส่ง ถึง ผู้อำนวยการฝ่ายสัญญาซื้อขายไฟฟ้า กฟผ. 53 ม.2 ถ.จรัญสนิทวงศ์ อ.บางกรวย จ.นนทบุรี 11130',
      'EGAT เซ็น STC คืน แล้วส่งเรื่องต่อให้ Evident — รออีเมลรหัสเข้าระบบ จากนั้นจด Organisation ID ไว้กรอกในฟอร์ม SF-02',
    ],
    items: [
      { id: 'stc-contract', label: 'STC Contract ลงนามโดยผู้มีอำนาจ 2 ชุด' },
      { id: 'sf01', label: 'SF-01: Market Entity Application กรอกครบ' },
      { id: 'company-cert', label: 'หนังสือรับรองบริษัท (อายุไม่เกิน 6 เดือน)' },
      { id: 'poa', label: 'หนังสือมอบอำนาจ (ถ้ามี)' },
      { id: 'id-copy', label: 'สำเนาบัตรประชาชน/พาสปอร์ตผู้มีอำนาจลงนาม' },
      { id: 'boj34', label: 'ทะเบียนตราประทับบริษัท (บอจ.3/บอจ.4)' },
      { id: 'boj5', label: 'สำเนาบัญชีรายชื่อผู้ถือหุ้น (บอจ.5)' },
      { id: 'financial', label: 'งบการเงินบริษัท (อายุไม่เกิน 12 เดือน)' },
      { id: 'pp20', label: 'ภ.พ.20 (เฉพาะบริษัทที่จด VAT)' },
    ],
  },
  {
    key: 'facility',
    title: '② ขึ้นทะเบียนโรงไฟฟ้า SF-02 (กรอกในระบบนี้)',
    notes: [
      'กรอกฟอร์มในการ์ด SF-02 ด้านล่าง — ไฟล์เอกสารแนบอัปโหลดในหน้า Evidence ของโปรเจกต์',
    ],
    items: [
      { id: 'org-id', label: 'Evident Organisation ID (ได้จากขั้นเปิดบัญชี)' },
      { id: 'latlong', label: 'พิกัด Latitude/Longitude ทศนิยม 6 ตำแหน่ง' },
      { id: 'capacity-mw', label: 'กำลังติดตั้ง (MW สูงสุด 6 ทศนิยม)' },
      { id: 'meter-ids', label: 'หมายเลขมิเตอร์ (Meter/Measurement ID)' },
      { id: 'gen-units', label: 'จำนวนเครื่องกำเนิดไฟฟ้า/inverter' },
      { id: 'cod-date', label: 'วัน COD (Commercial Operation Date)' },
      { id: 'network', label: 'เจ้าของโครงข่ายที่เชื่อมต่อ + แรงดัน ณ จุดเชื่อม (เช่น PEA 22 kV)' },
      { id: 'sd02-codes', label: 'รหัส Fuel/Technology ตามเอกสาร Evident SD-02' },
      { id: 'photos', label: 'รูปถ่ายโครงการ' },
      { id: 'ppa', label: 'PPA (สัญญาซื้อขายไฟ)' },
      { id: 'sld', label: 'Single Line Diagram (SLD)' },
      { id: 'capacity-proof', label: 'หลักฐานกำลังติดตั้ง (kW)' },
      { id: 'volume-proof', label: 'หลักฐานปริมาณไฟที่ผลิต (ใบแจ้งหนี้/ข้อมูลมิเตอร์ พร้อมวิธีคำนวณ)' },
      { id: 'license', label: 'ใบอนุญาตผลิตไฟฟ้า (พค.2 / ใบอนุญาต ERC)' },
      { id: 'cod-proof', label: 'หลักฐานวัน COD' },
      { id: 'meter-cal', label: 'Meter Calibration Report (กรณีมิเตอร์ non-settlement)' },
      { id: 'sf02c', label: 'SF-02C Owner\'s Declaration + หลักฐานความเป็นเจ้าของ (กรณีผู้ยื่นไม่ใช่เจ้าของ)' },
      { id: 'consumer-letter', label: 'Declaration/Notice Letter สละสิทธิ์เคลม attributes (กรณีมี onsite consumer)' },
    ],
  },
  {
    key: 'egat-review',
    title: '③ EGAT ตรวจ + ค่าธรรมเนียม',
    notes: [
      'EGAT แจ้งผลทางอีเมลแล้วออก invoice — ชำระภายใน 30 วันนับจากวันที่ออก',
      'ค่าธรรมเนียมปี 2025: ≥1–<3 MW = 19,000 บาท · <1 MW = 3,800 บาท · <250 kW + digital metering = ยกเว้น',
      'ทะเบียนมีอายุ 5 ปี — ค่าต่ออายุ 40% ของค่าขึ้นทะเบียน',
    ],
    items: [],
  },
];
