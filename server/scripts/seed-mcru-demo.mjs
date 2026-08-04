// Seed one COMPLETE demo project (every PDD field of T-VER-S-01, MCRU
// reference data) with evidence, then SUBMIT it — leaving it in the VVB's
// validation queue for review.
//
//   node scripts/seed-mcru-demo.mjs [assetsDir]
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const API = 'http://localhost:4000/api/v1';
const ASSETS = process.argv[2] ?? '.';

async function call(method, path, token, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${JSON.stringify(json).slice(0, 200)}`);
  return json;
}

async function upload(token, projectId, file, category, description) {
  const form = new FormData();
  form.append('category', category);
  form.append('description', description);
  form.append('file', new Blob([readFileSync(join(ASSETS, file))]), file);
  const res = await fetch(`${API}/projects/${projectId}/evidence`, {
    method: 'POST', headers: { authorization: `Bearer ${token}` }, body: form,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`upload ${file} → ${res.status}`);
  return json.evidence.id;
}

const owner = (await call('POST', '/auth/login', null, { email: 'proponent@gem.demo', password: 'demo1234' })).access_token;

const { project } = await call('POST', '/projects', owner, {
  name: 'Solar Rooftop มรภ.หมู่บ้านจอมบึง',
  location: 'Chom Bueng, Ratchaburi, Thailand',
  capacity_kwp: 667.2,
  commission_date: '2025-12-01',
  status: 'active',
});
console.log('✅ project', project.id);

const { pdd } = await call('POST', `/projects/${project.id}/pdd`, owner, { methodology_id: 'meth-tver-solar' });

// evidence — one per required category + extra site photos
const ev = [];
ev.push(await upload(owner, project.id, 'aerial-campus-topview.png', 'site_photo', 'ภาพถ่ายมุมสูงพื้นที่โครงการ มหาวิทยาลัยราชภัฏหมู่บ้านจอมบึง'));
ev.push(await upload(owner, project.id, 'rooftop-array-language-center.png', 'site_photo', 'การติดตั้งฯ อาคารศูนย์ภาษาและศูนย์คอมพิวเตอร์'));
ev.push(await upload(owner, project.id, 'inverter-room-rattanaphruek.png', 'site_photo', 'การติดตั้งฯ อาคารหอประชุมรัตนพฤกษ์'));
ev.push(await upload(owner, project.id, 'commissioning-report-2025.pdf', 'commissioning_report', 'รายงานการทดสอบระบบ (Commissioning) ธ.ค. 2568'));
ev.push(await upload(owner, project.id, 'construction-permit-12-2568.pdf', 'supporting_evidence', 'ใบอนุญาตก่อสร้างอาคารฯ เลขที่ 12/2568 ลงวันที่ 25 มี.ค. 2568'));
console.log('✅ evidence x', ev.length);

// every field of the T-VER-S-01 PDD, MCRU reference values
const section_data = {
  // ---- cover ----
  project_title_th: 'โครงการผลิตไฟฟ้าจากพลังงานแสงอาทิตย์แบบติดตั้งบนหลังคา สำหรับมหาวิทยาลัยราชภัฏหมู่บ้านจอมบึง ขนาดติดตั้ง 667.20 กิโลวัตต์',
  project_title_en: 'Solar Rooftop Project for Muban Chombueng Rajabhat University with an Installed Capacity of 667.20 kW.',
  project_owner: 'มหาวิทยาลัยราชภัฏหมู่บ้านจอมบึง',
  owner_name: 'มหาวิทยาลัยราชภัฏหมู่บ้านจอมบึง',
  co_developer: '-',
  project_address: '46 หมู่ 3 ตำบลจอมบึง อำเภอจอมบึง จังหวัดราชบุรี 70150',
  permit_no: '12/2568',
  permit_date: '2025-03-25',
  investment_mthb: 30,
  project_scale: 'เล็กมาก',
  crediting_years: '7',
  crediting_start: '2026-01-01',
  // ---- preparer ----
  doc_completed_date: '2025-11-01',
  doc_revision: '01',
  preparer_name: 'นายเภคูน พูลสวัสดิ์',
  preparer_position: 'ที่ปรึกษาการประเมินก๊าซเรือนกระจก',
  preparer_org: 'บริษัท โซเชลล่าร์ จำกัด',
  preparer_phone: '084-932-4700',
  coordinator_name: 'นายสำราญ พูลศักดิ์',
  coordinator_position: 'วิศวกรโยธา กองกลาง สำนักงานอธิการบดี',
  coordinator_phone: '085-246-5153',
  coordinator_email: 'samranpoo@mcru.ac.th',
  // ---- project_info ----
  technology: 'Solar PV rooftop',
  grid_connection: 'Grid-connected',
  before_project: 'มหาวิทยาลัยราชภัฏหมู่บ้านจอมบึง (มร.มจ.) ตั้งอยู่ที่ 46 หมู่ 3 ตำบลจอมบึง อำเภอจอมบึง จังหวัดราชบุรี 70150 ปัจจุบันดำเนินกิจกรรมขององค์กรโดยใช้พลังงานไฟฟ้าจากระบบสายส่งของการไฟฟ้าส่วนภูมิภาค ซึ่งเป็นพลังงานที่มาจากการเผาไหม้ของเชื้อเพลิงฟอสซิลเป็นหลัก',
  after_project: 'ติดตั้งระบบผลิตไฟฟ้าพลังงานแสงอาทิตย์บนหลังคา (Solar Rooftop) ขนาดกำลังติดตั้งไม่น้อยกว่า 667.20 กิโลวัตต์สูงสุด (kWp) บนหลังคาและดาดฟ้า จำนวน 5 อาคาร โดยเชื่อมต่อกับสายส่งของการไฟฟ้าส่วนภูมิภาคเพื่อผลิตใช้เองภายในมหาวิทยาลัย (Self Consumption, On-Grid) เริ่มดำเนินโครงการ 1 มกราคม พ.ศ. 2569',
  installations: [
    { building: 'อาคารศูนย์ภาษาและศูนย์คอมพิวเตอร์', coordinates: '13.619985, 99.588316', panels: 288, inverters: 5, kwp: 200.16 },
    { building: 'อาคารสำนักวิทยบริการและเทคโนโลยีสารสนเทศ (ห้องสมุด)', coordinates: '13.619135, 99.587582', panels: 96, inverters: 2, kwp: 66.72 },
    { building: 'อาคารโรงยิม 2', coordinates: '13.620231, 99.586375', panels: 192, inverters: 3, kwp: 133.44 },
    { building: 'อาคารปฏิบัติการแปรรูปอาหาร', coordinates: '13.621224, 99.585355', panels: 192, inverters: 3, kwp: 133.44 },
    { building: 'อาคารหอประชุมรัตนพฤกษ์', coordinates: '13.617951, 99.585614', panels: 192, inverters: 3, kwp: 133.44 },
  ],
  equipment_specs: [
    { item: 'แผงเซลล์แสงอาทิตย์ (Photovoltaic Module) ชนิด Monocrystalline', brand: 'Trinasolar', model: 'TSM-NEG21C.20', spec: 'ขนาด 695 วัตต์', qty: 960 },
    { item: 'อินเวอร์เตอร์ (Inverter)', brand: 'Huawei', model: 'SUN2000-50KTL-M3', spec: '50 kW', qty: 16 },
    { item: 'Power Optimizer', brand: 'Huawei', model: 'MERC-1300W-P', spec: '', qty: 480 },
    { item: 'Smart Logger', brand: 'Huawei', model: 'SmartLogger3000A00GL', spec: '', qty: 5 },
    { item: 'Power Quality Meter', brand: 'Janitza', model: 'UMG 512-Pro', spec: '', qty: 1 },
    { item: 'Power Supply', brand: 'Cleanline', model: 'L-1000C', spec: '', qty: 1 },
    { item: 'Mobile Water Pump', brand: 'Pumpkin', model: 'NERLIN Heavy-series', spec: '3 HP', qty: 1 },
  ],
  // ---- double_counting ----
  registered_elsewhere: 'ไม่มี',
  // ---- baseline ----
  baseline_scenario: 'Grid electricity displaced by on-site solar generation',
  // ---- additionality ----
  barrier_type: 'Investment',
  investment_metric: 'IRR',
  barrier_explanation: 'โครงการขนาดเล็กมาก (Micro Scale) เข้าข่าย Positive List ของ อบก. จึงไม่ต้องพิสูจน์การดำเนินงานเพิ่มเติมจากการดำเนินงานตามปกติ (อ้างอิงผลการประเมินการเงิน: IRR 11.65% ระยะคืนทุน 7.45 ปี)',
  common_practice: true,
  // ---- ghg_reduction ----
  performance_ratio: 0.8,
  year1_generation_kwh: 963915,
  degradation_pct: 0.4,
  consumers: [
    { equipment: 'Smart Logger 5 เครื่อง', rated_w: 40, hours_per_year: 8760, note: 'ทำงาน 24 ชั่วโมง/วัน' },
    { equipment: 'Power Supply 1 เครื่อง', rated_w: 550, hours_per_year: 8760, note: 'ทำงาน 24 ชั่วโมง/วัน' },
    { equipment: 'Water Pump', rated_w: 2300, hours_per_year: 10, note: 'ล้างแผง 1 ครั้ง/ปี ครั้งละ 10 ชั่วโมง' },
    { equipment: 'Television 1 เครื่อง', note: 'ไม่ได้เปิดใช้งาน' },
    { equipment: 'Air Conditioner 2 เครื่อง', note: 'ไม่ได้เปิดใช้งาน' },
    { equipment: 'Inverter (Standby Mode)', kwh_year: 610.28, note: 'คิดที่ 19 ชั่วโมง/วัน (non sun peak hour)' }, // 610.28 → EC_PJ 5,801.68 exactly as the printed MCRU reference
  ],
  // ---- monitoring_plan ----
  monitored_parameter: 'EG_Consumer,PJ,y',
  measurement_method: 'ตรวจวัดโดย Energy Meter ในอินเวอร์เตอร์ แสดงผลผ่านโปรแกรม Fusion Solar โดยหักข้อมูลปริมาณไฟฟ้าที่ตรวจวัดได้ออก 5% ก่อนคำนวณ',
  monitoring_frequency: 'Monthly',
  qaqc_procedure: 'ข้อมูลถูกรวบรวมเป็นรายเดือนและตรวจสอบโดยเจ้าหน้าที่ที่ได้รับมอบหมาย ทวนสอบโดยพนักงานระดับหัวหน้างาน และส่งให้ทีมงานผู้รับมอบหมายจัดทำรายงานติดตามผล',
};

await call('PUT', `/pdds/${pdd.id}/draft`, owner, { section_data, evidence_ids: ev });
console.log('✅ draft saved — every field filled');

await call('POST', `/pdds/${pdd.id}/submit`, owner);
console.log('✅ SUBMITTED → รอ VVB ตรวจใน Validation Queue');
console.log('   project:', project.id, '· pdd:', pdd.id);
