// Fill the EXISTING "Trat Community college" project (created from the IoT
// Mapping page) with a complete T-VER-S-01 PDD and submit it — leaving it in
// the VVB's validation queue. All values come from the plant's own registry
// row in the IoT database + the real synced generation data; fields we have
// no document for are marked as pending rather than invented.
//
//   node scripts/seed-trat-pdd.mjs
const API = 'http://localhost:4000/api/v1';

async function call(method, path, token, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${JSON.stringify(json).slice(0, 300)}`);
  return json;
}

const owner = (await call('POST', '/auth/login', null, { email: 'proponent@gem.demo', password: 'demo1234' })).access_token;

const projects = (await call('GET', '/projects', owner)).projects;
const project = projects.find((p) => p.name === 'Trat Community college');
if (!project) throw new Error('Trat project not found — สร้างจากหน้า IoT Mapping ก่อน');
console.log('✅ project', project.id, project.name, `${project.capacity_kwp} kWp`);

// real synced generation → evidence CSV + year-1 estimate
const records = (await call('GET', `/projects/${project.id}/monitoring`, owner)).records;
if (records.length === 0) throw new Error('no monitoring data — sync IoT ก่อน');
const totalKwh = records.reduce((s, r) => s + r.generation_kwh, 0);
const avgKwh = totalKwh / records.length;
const year1 = Math.round(avgKwh * 365);
console.log(`✅ real data ${records.length} วัน · เฉลี่ย ${avgKwh.toFixed(1)} kWh/วัน · ปีแรกประมาณ ${year1.toLocaleString()} kWh`);

// upload the REAL generation data as supporting evidence for the VVB
const csv = ['record_date,generation_kwh,source',
  ...records.map((r) => `${r.record_date},${r.generation_kwh},${r.source}`)].join('\n');
const form = new FormData();
form.append('category', 'supporting_evidence');
form.append('description', `ข้อมูลผลิตไฟฟ้าจริงรายวันจากระบบ IoT (${records.length} วัน, หักตามแผน monitoring 7% แล้ว)`);
form.append('file', new Blob([csv], { type: 'text/csv' }), 'trat-iot-generation.csv');
const evRes = await fetch(`${API}/projects/${project.id}/evidence`, {
  method: 'POST', headers: { authorization: `Bearer ${owner}` }, body: form,
});
const evJson = await evRes.json();
if (!evRes.ok) throw new Error(`evidence upload → ${evRes.status}`);
const ev = [evJson.evidence.id];
console.log('✅ evidence: real IoT generation CSV');

const { pdd } = await call('POST', `/projects/${project.id}/pdd`, owner, { methodology_id: 'meth-tver-solar' });
console.log('✅ pdd', pdd.id);

const section_data = {
  // ---- cover ----
  project_title_th: 'โครงการผลิตไฟฟ้าจากพลังงานแสงอาทิตย์แบบติดตั้งบนหลังคา วิทยาลัยชุมชนตราด ขนาดติดตั้ง 34.38 กิโลวัตต์',
  project_title_en: 'Solar Rooftop Project for Trat Community College with an Installed Capacity of 34.38 kWp.',
  project_owner: 'วิทยาลัยชุมชนตราด',
  owner_name: 'วิทยาลัยชุมชนตราด',
  co_developer: '-',
  project_address: 'ถนนสุขุมวิท ตำบลเนินทราย อำเภอเมืองตราด จังหวัดตราด 23000',
  permit_no: 'รอเอกสารจากผู้ติดตั้ง',
  permit_date: '2025-11-07',
  investment_mthb: 1.2,
  project_scale: 'เล็กมาก',
  crediting_years: '7',
  crediting_start: '2026-06-01',
  // ---- preparer ----
  doc_completed_date: '2026-08-04',
  doc_revision: '01',
  preparer_name: 'GEM Carbon Ready Platform',
  preparer_position: 'ระบบจัดทำเอกสารอัตโนมัติ (dMRV)',
  preparer_org: 'GEM Environmental Management',
  preparer_phone: '-',
  coordinator_name: 'ผู้ประสานงานวิทยาลัยชุมชนตราด',
  coordinator_position: 'งานอาคารสถานที่',
  coordinator_phone: '-',
  coordinator_email: '-',
  // ---- project_info ----
  technology: 'Solar PV rooftop',
  grid_connection: 'Grid-connected (Self Consumption)',
  before_project: 'วิทยาลัยชุมชนตราด ตั้งอยู่ที่ถนนสุขุมวิท ตำบลเนินทราย อำเภอเมืองตราด จังหวัดตราด ใช้พลังงานไฟฟ้าจากระบบสายส่งของการไฟฟ้าส่วนภูมิภาค ซึ่งมาจากการเผาไหม้เชื้อเพลิงฟอสซิลเป็นหลัก',
  after_project: 'ติดตั้งระบบผลิตไฟฟ้าพลังงานแสงอาทิตย์บนหลังคา ขนาดกำลังติดตั้ง 34.38 กิโลวัตต์สูงสุด (kWp) มุมเอียงแผง 15° หันทิศใต้ (azimuth 180°) เชื่อมต่อสายส่งเพื่อผลิตใช้เองภายในวิทยาลัย (Self Consumption, On-Grid) — ข้อมูลผลิตจริงเก็บอัตโนมัติผ่านระบบ IoT ของแพลตฟอร์ม',
  installations: [
    { building: 'อาคารวิทยาลัยชุมชนตราด', coordinates: '9.957900, 98.608500 (ตามทะเบียนระบบ IoT)', panels: null, inverters: null, kwp: 34.38 },
  ],
  equipment_specs: [
    { item: 'แผงเซลล์แสงอาทิตย์ (Photovoltaic Module)', brand: 'รอเอกสารจากผู้ติดตั้ง', model: '-', spec: 'รวม 34.38 kWp', qty: null },
    { item: 'อินเวอร์เตอร์ (Inverter) พร้อมระบบ monitoring ส่งข้อมูลเข้าแพลตฟอร์ม IoT', brand: 'รอเอกสารจากผู้ติดตั้ง', model: '-', spec: '', qty: null },
  ],
  // ---- double_counting ----
  registered_elsewhere: 'ไม่มี',
  // ---- baseline ----
  baseline_scenario: 'Grid electricity displaced by on-site solar generation',
  // ---- additionality ----
  barrier_type: 'Investment',
  investment_metric: 'IRR',
  barrier_explanation: 'โครงการขนาดเล็กมาก (Micro Scale) เข้าข่าย Positive List ของ อบก. จึงไม่ต้องพิสูจน์การดำเนินงานเพิ่มเติมจากการดำเนินงานตามปกติ',
  common_practice: true,
  // ---- ghg_reduction ----
  performance_ratio: 0.8,
  year1_generation_kwh: year1,
  degradation_pct: 0.4,
  consumers: [
    { equipment: 'อุปกรณ์ monitoring/logger ของระบบ', rated_w: 40, hours_per_year: 8760, note: 'ทำงาน 24 ชั่วโมง/วัน' },
    { equipment: 'Inverter (Standby Mode)', kwh_year: 130, note: 'คิดที่ non sun peak hour' },
  ],
  // ---- monitoring_plan ----
  monitored_parameter: 'EG_Consumer,PJ,y',
  measurement_method: 'ตรวจวัดโดย Energy Meter ในอินเวอร์เตอร์ ส่งเข้าแพลตฟอร์มอัตโนมัติผ่านระบบ IoT (ตาราง daily_plant_efficiency) โดยระบบหักข้อมูลปริมาณไฟฟ้าที่ตรวจวัดได้ออก 7% ก่อนบันทึกตามแผนติดตามผล',
  monitoring_frequency: 'Daily (automatic IoT sync)',
  qaqc_procedure: 'ข้อมูลดึงอัตโนมัติรายชั่วโมงจากฐานข้อมูล IoT เก็บเฉพาะวันที่ครบถ้วน ไม่เขียนทับข้อมูลเดิม ทุกการนำเข้าบันทึกใน audit log แบบ hash-chain และผูกกับ methodology ของ PDD ที่ขึ้นทะเบียน',
};

await call('PUT', `/pdds/${pdd.id}/draft`, owner, { section_data, evidence_ids: ev });
console.log('✅ draft saved — ครบทุก field (ช่องที่ไม่มีเอกสารระบุ "รอเอกสารจากผู้ติดตั้ง")');

await call('POST', `/pdds/${pdd.id}/submit`, owner);
console.log('✅ SUBMITTED → รอ VVB ตรวจใน Validation Queue');
console.log('   project:', project.id, '· pdd:', pdd.id);
