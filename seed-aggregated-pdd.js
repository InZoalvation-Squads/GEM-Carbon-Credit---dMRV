/* ============================================================
 * เพิ่มโครงการ PDD แบบควบรวม (6 แห่ง) ลงในระบบ
 *
 * วิธีใช้: เปิดแอป → กด F12 → แท็บ Console → paste ทั้งหมดนี้ → Enter
 * ข้อมูลจาก T-VER-S-F001-PDD แบบควบรวม ฉบับอ้างอิง (2,009.30 kWp, 6 แห่ง)
 * ============================================================ */
(() => {
  const KEY = 'carbon-ready-store-v17';
  const raw = localStorage.getItem(KEY);
  if (!raw) {
    console.error('❌ ไม่พบข้อมูลแอป — เปิดหน้าแอปให้โหลดเสร็จก่อน แล้วค่อยรันสคริปต์นี้');
    return;
  }

  const store = JSON.parse(raw);
  const s = store.state;
  const PROJECT_ID = 'prj-aggregated-demo';
  const PDD_ID = 'PDD-AGGREGATED-DEMO';

  if (s.projects.some((p) => p.id === PROJECT_ID)) {
    console.warn('⚠️  มีโครงการนี้อยู่แล้ว — ลบของเดิมออกก่อนสร้างใหม่');
    s.projects = s.projects.filter((p) => p.id !== PROJECT_ID);
    s.pdds = s.pdds.filter((p) => p.id !== PDD_ID);
  }

  // 6 แห่ง — year1_kwh คือไฟฟ้าปีแรก "ของแต่ละแห่งเอง" (รวม = 2,499,410)
  // บริษัท D เสื่อม 0.60%/ปี ต่างจากที่อื่นซึ่งใช้ 0.55%/ปี
  const sites = [
    { owner: 'บริษัท A จำกัด', address: 'อำเภอเมืองสมุทรสาคร จังหวัดสมุทรสาคร 74000',   coordinates: '13.570489, 100.358081', kwp: 261.600, year1_kwh: 327126, first_sync_year: 2569, degradation_pct: 0.55, maintenance_per_year: 4, project_id: '' },
    { owner: 'บริษัท B จำกัด', address: 'อำเภอบางบ่อ จังหวัดสมุทรปราการ 10560',         coordinates: '13.545597, 100.811215', kwp: 249.610, year1_kwh: 377445, first_sync_year: 2568, degradation_pct: 0.55, maintenance_per_year: 4, project_id: '' },
    { owner: 'บริษัท C จำกัด', address: 'อำเภอคลองหลวง จังหวัดปทุมธานี 12120',           coordinates: '14.112810, 100.610769', kwp: 234.895, year1_kwh: 290279, first_sync_year: 2569, degradation_pct: 0.55, maintenance_per_year: 4, project_id: '' },
    { owner: 'บริษัท D จำกัด', address: 'อำเภอเมืองสมุทรสงคราม จังหวัดสมุทรสงคราม 75000', coordinates: '13.378807, 99.9846779', kwp: 311.605, year1_kwh: 355673, first_sync_year: 2570, degradation_pct: 0.60, maintenance_per_year: 3, project_id: '' },
    { owner: 'บริษัท E จำกัด', address: 'อำเภอลาดหลุมแก้ว จังหวัดปทุมธานี 12140',         coordinates: '14.080784, 100.433560', kwp: 351.000, year1_kwh: 393567, first_sync_year: 2569, degradation_pct: 0.55, maintenance_per_year: 3, project_id: '' },
    { owner: 'บริษัท F จำกัด', address: 'อำเภอพานทอง จังหวัดชลบุรี 20160',               coordinates: '13.451122, 101.061046', kwp: 600.590, year1_kwh: 755320, first_sync_year: 2568, degradation_pct: 0.55, maintenance_per_year: 2, project_id: '' },
  ];

  const now = new Date().toISOString();

  s.projects.push({
    id: PROJECT_ID,
    organization_id: s.projects[0]?.organization_id ?? 'org-0001',
    name: 'Solar Rooftop รวม 6 แห่ง (แบบควบรวม)',
    location: 'Samut Sakhon, Thailand',
    capacity_kwp: 2009.3,
    commission_date: '2020-05-07',
    status: 'active',
    lifecycle_stage: 'pdd_draft',   // draft = แก้ไขได้ในหน้าฟอร์ม
    created_at: now, updated_at: now,
  });

  s.pdds.push({
    id: PDD_ID,
    project_id: PROJECT_ID,
    methodology_id: 'meth-tver-solar',
    methodology_snapshot: 'T-VER-S-01 v3.0',
    state: 'draft',
    section_data: {
      // ---- แบบควบรวม ----
      project_form: 'แบบควบรวม',
      sites,
      // ---- หน้าปก ----
      project_title_th: 'โครงการผลิตไฟฟ้าจากพลังงานแสงอาทิตย์แบบติดตั้งบนหลังคา ขนาดติดตั้งรวม 2,009.30 กิโลวัตต์สูงสุด',
      project_title_en: '2,009.30 kWp Solar Rooftop (Aggregated)',
      project_owner: 'บริษัท ผู้พัฒนาโครงการ จำกัด',
      project_scale: 'เล็กมาก',
      crediting_years: '7',
      crediting_start: '2027-01-01',   // = พ.ศ. 2570 ตรงกับคอลัมน์แรกของตารางคาดการณ์
      preparer_name: 'ผู้จัดทำเอกสาร',
      coordinator_name: 'ผู้ประสานงาน',
      registered_elsewhere: 'ไม่มี',
      // ---- การคำนวณ ----
      degradation_pct: 0.55,          // ค่าสำรอง เมื่อแถวใดไม่ได้ระบุอัตราของตัวเอง
      performance_ratio: 0.8,
      technology: 'Solar PV rooftop',
      grid_connection: 'Grid-connected',
      baseline_scenario: 'Grid electricity displaced by solar generation',
      barrier_type: 'Investment',
      investment_metric: 'IRR',
      barrier_explanation: 'IRR ของโครงการก่อนรวมรายได้คาร์บอนต่ำกว่าเกณฑ์ผลตอบแทนของผู้พัฒนา',
      common_practice: true,
      consumers: [
        { equipment: 'Smart Logger — Huawei SLogger3000A', rated_w: 8,  hours_per_year: 8760, note: '5 ชุด' },
        { equipment: 'PQM — Janitza UMG511',               rated_w: 10, hours_per_year: 8760, note: '3 ชุด' },
      ],
      equipment_specs: [
        { site: 'บริษัท A จำกัด', item: 'แผงเซลล์แสงอาทิตย์', brand: 'Trina Solar', model: 'TSM-DE18-545W',  spec: '545 W', qty: 480 },
        { site: 'บริษัท B จำกัด', item: 'แผงเซลล์แสงอาทิตย์', brand: 'Jinko',       model: 'JKM545M-72HL4',  spec: '545 W', qty: 458 },
        { site: 'บริษัท C จำกัด', item: 'แผงเซลล์แสงอาทิตย์', brand: 'Longi',       model: 'LR5-72HPH-545M', spec: '545 W', qty: 431 },
      ],
      // ---- แผนติดตามผล ----
      monitored_parameter: 'EG_PJ',
      measurement_method: 'Revenue-grade bi-directional meter',
      monitoring_frequency: 'Monthly',
      qaqc_procedure: 'อ่านมิเตอร์รายเดือนและตรวจสอบกับใบแจ้งหนี้ค่าไฟฟ้า',
    },
    evidence_ids: [],
    assigned_validator_name: 'Daniel Okoye',
    submitted_at: null, validated_at: null,
    content_hash: null, ipfs_cid: null, credential_id: null,
  });

  localStorage.setItem(KEY, JSON.stringify(store));

  const kwp = sites.reduce((a, x) => a + x.kwp, 0);
  const kwh = sites.reduce((a, x) => a + x.year1_kwh, 0);
  console.log('✅ สร้างเรียบร้อย — รีเฟรชหน้าเว็บ (F5)');
  console.log(`   โครงการ: Solar Rooftop รวม 6 แห่ง (แบบควบรวม)`);
  console.log(`   ${sites.length} แห่ง · ${kwp.toLocaleString()} kWp · ${kwh.toLocaleString()} kWh/ปี`);
  console.log('   ไปที่เมนู Projects แล้วเปิดโครงการนี้ → PDD → ปุ่ม "เอกสารฟอร์ม อบก."');
})();
