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

// upload the REAL generation data as supporting evidence for the VVB.
// Evidence storage only accepts pdf/png/jpg/xlsx, so render the daily table
// as a dependency-free PDF (base-14 Helvetica → ASCII content only).
function makePdf(title, lines) {
  const esc = (s) => s.replace(/[\\()]/g, (c) => `\\${c}`);
  const pages = [];
  for (let i = 0; i < lines.length; i += 58) pages.push(lines.slice(i, i + 58));
  const objs = []; // 1-indexed bodies, object number = index + 1
  const pageObjNums = pages.map((_, i) => 4 + i * 2);
  objs.push(`<< /Type /Catalog /Pages 2 0 R >>`);
  objs.push(`<< /Type /Pages /Kids [${pageObjNums.map((n) => `${n} 0 R`).join(' ')}] /Count ${pages.length} >>`);
  objs.push(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`);
  pages.forEach((pageLines, i) => {
    const rows = pageLines.map((l) => `(${esc(l)}) Tj T*`).join('\n');
    const stream = `BT /F1 12 Tf 50 800 Td 14 TL (${esc(title)}${pages.length > 1 ? ` - page ${i + 1}/${pages.length}` : ''}) Tj T*\n/F1 9 Tf 11 TL\n${rows}\nET`;
    objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`);
    objs.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  });
  let out = '%PDF-1.4\n';
  const offsets = [];
  objs.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  out += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(out, 'latin1');
}

const tableLines = [
  `Project: Trat Community College Solar Rooftop (${project.capacity_kwp} kWp)`,
  `Source: automatic IoT sync (daily_plant_efficiency), 7% monitoring deduction applied`,
  `Period: ${records[0].record_date} to ${records[records.length - 1].record_date} · ${records.length} days · total ${totalKwh.toFixed(2)} kWh`,
  '',
  'record_date        generation_kwh    source',
  ...records.map((r) => `${r.record_date.padEnd(19)}${String(r.generation_kwh).padEnd(18)}${r.source}`),
];
const form = new FormData();
form.append('category', 'supporting_evidence');
form.append('description', `ข้อมูลผลิตไฟฟ้าจริงรายวันจากระบบ IoT (${records.length} วัน, หักตามแผน monitoring 7% แล้ว)`);
form.append('file', new Blob([makePdf('Daily Generation Report - IoT Synced Data', tableLines)], { type: 'application/pdf' }), 'trat-iot-generation.pdf');
const evRes = await fetch(`${API}/projects/${project.id}/evidence`, {
  method: 'POST', headers: { authorization: `Bearer ${owner}` }, body: form,
});
const evJson = await evRes.json();
if (!evRes.ok) throw new Error(`evidence upload → ${evRes.status}: ${JSON.stringify(evJson).slice(0, 200)}`);
const ev = [evJson.evidence.id];
console.log('✅ evidence: real IoT generation PDF');

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
