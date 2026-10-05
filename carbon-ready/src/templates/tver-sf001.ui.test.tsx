import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TverSF001Pdd, pddSiteImages } from './TverSF001Pdd';
import { seedDemo } from '../test/demoFixtures';
import { useStore } from '../store';

beforeEach(() => { localStorage.clear(); seedDemo(); });

// PDD-2000 = registered solar PDD in the demo fixtures; enrich it with the
// official-form data the template renders.
function seedOfficialData() {
  const pdd = useStore.getState().pdds.find((p) => p.id === 'PDD-2000')!;
  // demoFixtures reuses module-level objects across seedDemo() calls, so a
  // `sites` array written by an aggregated-mode test would otherwise leak in
  // here and silently flip this single-project fixture into bundle mode.
  const {
    sites: _sites, support_equipment: _se, project_type: _pt, ...base
  } = pdd.section_data as Record<string, unknown>;
  pdd.section_data = {
    ...base,
    project_title_th: 'โครงการทดสอบพลังงานแสงอาทิตย์',
    project_title_en: 'Test Solar Project',
    project_owner: 'บริษัท ทดสอบ จำกัด',
    investment_mthb: 30,
    year1_generation_kwh: 963915,
    degradation_pct: 0.4,
    crediting_years: '7',
    crediting_start: '2026-01-01',
    consumers: [{ equipment: 'Smart Logger', rated_w: 40, hours_per_year: 8760 }],
    installations: [{ building: 'อาคารทดสอบ 1', coordinates: '13.61, 99.58', panels: 288, inverters: 5, kwp: 200.16 }],
    registered_elsewhere: 'ไม่มี',
  };
}

function renderDoc() {
  return render(<MemoryRouter><TverSF001Pdd pddId="PDD-2000" /></MemoryRouter>);
}

describe('TverSF001Pdd official template', () => {
  it('renders the TGO form frame and cover values', () => {
    seedOfficialData();
    renderDoc();
    expect(screen.getAllByText('T-VER-S-F001-PDD').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/VERSION 2.1/).length).toBeGreaterThan(0);
    expect(screen.getByText('โครงการทดสอบพลังงานแสงอาทิตย์')).toBeInTheDocument();
    expect(screen.getAllByText(/ขนาดโครงการ/).length).toBeGreaterThan(0);
    expect(screen.getByText('อาคารทดสอบ 1')).toBeInTheDocument();
  });

  it('renders the crediting-period yearly table with computed rows', () => {
    seedOfficialData();
    renderDoc();
    const table = screen.getByTestId('yearly-table');
    expect(table).toBeInTheDocument();
    // 7 crediting years + header/total/avg rows
    expect(table.querySelectorAll('tbody tr').length).toBeGreaterThanOrEqual(7);
  });

  it('renders the consumers appendix with the EC_PJ total', () => {
    seedOfficialData();
    renderDoc();
    expect(screen.getByText('Smart Logger')).toBeInTheDocument();
    expect(screen.getByTestId('ecpj-total').textContent).toContain('350.40');
  });
});

// ============================================================
// MCRU reference PDD — the template must render the same numbers the
// official document shows (see docs: T-VER-S-F001-PDD_MCRU example).
// ============================================================
const MCRU_CONSUMERS = [
  { equipment: 'Smart Logger 5 เครื่อง', rated_w: 40, hours_per_year: 8760, note: 'ทำงาน 24 ชั่วโมง/วัน' },
  { equipment: 'Power Supply 1 เครื่อง', rated_w: 550, hours_per_year: 8760, note: 'ทำงาน 24 ชั่วโมง/วัน' },
  { equipment: 'Water Pump', rated_w: 2300, hours_per_year: 10, note: 'ล้างแผง 1 ครั้ง/ปี' },
  { equipment: 'Inverter (Standby Mode)', kwh_year: 610.28, note: 'non sun peak hour' },
];

function seedMcruData(overrides: Record<string, unknown> = {}) {
  // prj-0001 (PDD-2000) is in India — pin an IN factor at the MCRU EF so the
  // rendered numbers match the reference document exactly.
  useStore.setState({
    factors: [{
      id: 'ef-in-mcru', country: 'IN', source: 'TGO', factor_kgco2e_per_kwh: 0.4682,
      effective_date: '2025-01-01', version: 9, is_current: true, created_at: '',
    }],
  });
  const pdd = useStore.getState().pdds.find((p) => p.id === 'PDD-2000')!;
  // demoFixtures reuses module-level objects across seedDemo() calls, so
  // optional keys mutated by an earlier test would otherwise leak into this one.
  const {
    permit_no: _p1, permit_date: _p2, owner_name: _p3, project_address: _p4,
    equipment_specs: _p5, sites: _p6, support_equipment: _p7, project_type: _p8,
    project_start_date: _p9, coordinator_fax: _p10, project_activity: _p11,
    eg_monitoring_method: _p12, eg_deduction_pct: _p13, installations: _p14, ...base
  } = pdd.section_data as Record<string, unknown>;
  pdd.section_data = {
    ...base,
    project_title_th: 'โครงการผลิตไฟฟ้าจากพลังงานแสงอาทิตย์แบบติดตั้งบนหลังคา',
    project_owner: 'มหาวิทยาลัยทดสอบ',
    project_scale: 'เล็กมาก',
    crediting_years: '7',
    crediting_start: '2026-01-01',
    year1_generation_kwh: 963915,
    degradation_pct: 0.4,
    consumers: MCRU_CONSUMERS,
    registered_elsewhere: 'ไม่มี',
    ...overrides,
  };
}

/** First character (☑/☐) of every checkbox row whose label matches. */
function checkboxStates(label: string | RegExp): string[] {
  return screen.getAllByText(label).map((el) => (el.parentElement?.textContent ?? '').trim().charAt(0));
}

describe('TverSF001Pdd — MCRU reference figures render in the document', () => {
  beforeEach(() => seedMcruData());

  it('yearly table shows the exact BE rows, floored ER rows, totals and averages', () => {
    renderDoc();
    const text = screen.getByTestId('yearly-table').textContent ?? '';
    for (const be of ['451.31', '449.50', '447.70', '445.91', '444.13', '442.35', '440.58']) {
      expect(text, `BE ${be}`).toContain(be);
    }
    expect(text).toContain('3,121.48');  // BE total
    expect(text).toContain('3,098');     // ER total (sum of floored years)
    expect(text).toContain('445.93');    // BE average
    expect(text).toContain('2.72');      // PE
  });

  it('appendix sums EC_PJ to 5,801.68 kWh from mixed rated×hours and direct rows', () => {
    renderDoc();
    expect(screen.getByTestId('ecpj-total').textContent).toContain('5,801.68');
    expect(screen.getByText('Inverter (Standby Mode)')).toBeInTheDocument();
    expect(screen.getByText('ล้างแผง 1 ครั้ง/ปี')).toBeInTheDocument();
  });

  it('cover shows the annual ER (443 tCO₂e/yr) and Buddhist-era crediting date', () => {
    renderDoc();
    expect(screen.getByText(/443 ตันคาร์บอนไดออกไซด์เทียบเท่าต่อปี/)).toBeInTheDocument();
    // 2026-01-01 → พ.ศ. 2569 (th-TH locale uses the Buddhist calendar)
    expect(screen.getAllByText(/2569/).length).toBeGreaterThan(0);
  });
});

describe('TverSF001Pdd — checkbox states follow section_data', () => {
  it('ticks เล็กมาก / 7 ปี / ไม่มี(นับซ้ำ) and leaves the others empty', () => {
    seedMcruData();
    renderDoc();
    expect(checkboxStates('เล็กมาก')).toEqual(['☑']);
    expect(checkboxStates('เล็ก')).toEqual(['☐']);
    expect(checkboxStates('ใหญ่')).toEqual(['☐']);
    for (const s of checkboxStates(/^7 ปี/)) expect(s).toBe('☑');
    for (const s of checkboxStates(/^10 ปี/)) expect(s).toBe('☐');
    expect(checkboxStates('ไม่มี')).toEqual(['☑']);
  });

  it('micro-scale projects get the Positive List additionality branch', () => {
    seedMcruData();
    renderDoc();
    expect(screen.getByText(/Positive List/)).toBeInTheDocument();
    expect(checkboxStates(/^ไม่ต้องพิสูจน์การดำเนินงานเพิ่ม/)).toEqual(['☑']);
  });

  it('non-micro scale flips to the "must prove additionality" branch with the barrier text', () => {
    seedMcruData({ project_scale: 'ใหญ่' });
    renderDoc();
    expect(checkboxStates(/^ต้องพิสูจน์การดำเนินงานเพิ่ม/)).toEqual(['☑']);
    expect(checkboxStates('ใหญ่')).toEqual(['☑']);
    expect(checkboxStates('เล็กมาก')).toEqual(['☐']);
  });

  it('double counting "มี" ticks that row and renders the registry details', () => {
    seedMcruData({
      registered_elsewhere: 'มี',
      registry_name: 'REC-โครงการเดิม', registry_scheme: 'I-REC', registry_period: '2567–2568',
    });
    renderDoc();
    expect(checkboxStates('ไม่มี')).toEqual(['☐']);
    expect(screen.getByText(/REC-โครงการเดิม/)).toBeInTheDocument();
    expect(screen.getByText(/I-REC/)).toBeInTheDocument();
  });
});

describe('TverSF001Pdd — fallbacks', () => {
  it('missing emission factor: no yearly table, shows the Thai error note instead', () => {
    seedMcruData();
    useStore.setState({ factors: [] });
    renderDoc();
    expect(screen.queryByTestId('yearly-table')).toBeNull();
    expect(screen.getByText(/ยังคำนวณไม่ได้/)).toBeInTheDocument();
  });

  it('empty consumers table hides the electricity-consumers appendix page', () => {
    seedMcruData({ consumers: [] });
    renderDoc();
    expect(screen.queryByTestId('ecpj-total')).toBeNull();
    // The forecast/financial appendix pages do not depend on consumers.
    expect(screen.queryByText(/รายการอุปกรณ์ไฟฟ้าและประมาณการไฟฟ้า/)).toBeNull();
  });

  it('unknown pdd id renders the not-found empty state, not a crash', () => {
    render(<MemoryRouter><TverSF001Pdd pddId="PDD-NOPE" /></MemoryRouter>);
    expect(screen.getByText('PDD not found')).toBeInTheDocument();
  });
});

describe('TverSF001Pdd — submission-grade fields (permit, owner, address, equipment)', () => {
  it('renders the construction permit line, separate owner, and full address', () => {
    seedMcruData({
      owner_name: 'เจ้าของแยก จำกัด',
      project_address: '46 หมู่ 3 ตำบลจอมบึง อำเภอจอมบึง จังหวัดราชบุรี 70150',
      permit_no: '12/2568',
      permit_date: '2025-03-25',
    });
    renderDoc();
    expect(screen.getByText('เจ้าของแยก จำกัด')).toBeInTheDocument();
    expect(screen.getAllByText(/46 หมู่ 3 ตำบลจอมบึง/).length).toBeGreaterThan(0); // cover + ที่อยู่ผู้ประสานงาน
    expect(screen.getByText(/เลขที่ 12\/2568/)).toBeInTheDocument();
    expect(screen.getByText(/ลงวันที่.*2568/)).toBeInTheDocument(); // Buddhist year of 2025-03-25
  });

  it('renders the numbered technology list from equipment_specs', () => {
    seedMcruData({
      equipment_specs: [
        { item: 'แผงเซลล์แสงอาทิตย์ (Monocrystalline)', brand: 'Trinasolar', model: 'TSM-NEG21C.20', spec: 'ขนาด 695 วัตต์', qty: 960 },
        { item: 'อินเวอร์เตอร์', brand: 'Huawei', model: 'SUN2000-50KTL-M3', qty: 16 },
      ],
    });
    renderDoc();
    const li = screen.getByText(/Trinasolar/);
    expect(li.textContent).toContain('รุ่น TSM-NEG21C.20');
    expect(li.textContent).toContain('จำนวน 960');
    expect(screen.getByText(/SUN2000-50KTL-M3/)).toBeInTheDocument();
  });

  it('falls back to developer name and project.location when the new fields are empty', () => {
    seedMcruData();
    renderDoc();
    // เจ้าของโครงการ row shows the developer (มหาวิทยาลัยทดสอบ appears twice: ผู้พัฒนา + เจ้าของ)
    expect(screen.getAllByText('มหาวิทยาลัยทดสอบ').length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText(/เลขที่ 12\/2568/)).toBeNull(); // no permit line without data
  });
});

describe('TverSF001Pdd — evidence figures', () => {
  it('pddSiteImages picks only active image evidence of the project', () => {
    const ev = useStore.getState().evidence;
    const picked = pddSiteImages(ev, 'prj-0001');
    expect(picked.length).toBeGreaterThan(0);
    expect(picked.every((e) => e.kind === 'image' && e.status === 'active' && e.project_id === 'prj-0001')).toBe(true);
    expect(pddSiteImages(ev, 'prj-nope')).toEqual([]);
  });

  it('local-store mode renders no figure section (file bytes live behind the server API)', () => {
    seedMcruData();
    renderDoc();
    expect(screen.queryByText('ภาพประกอบการติดตั้ง')).toBeNull();
    expect(document.querySelector('figure')).toBeNull();
  });
});

describe('TverSF001Pdd — reference-completeness additions', () => {
  it('renders a table of contents page listing all four parts and the appendix', () => {
    seedOfficialData();
    renderDoc();
    expect(screen.getByText('สารบัญ')).toBeInTheDocument();
    const toc = screen.getByTestId('toc');
    expect(toc.textContent).toContain('ส่วนที่ 1 รายละเอียดโครงการ');
    expect(toc.textContent).toContain('ส่วนที่ 4 แผนการติดตามผลการดำเนินโครงการ');
    expect(toc.textContent).toContain('ภาคผนวก');
  });

  it('renders the project-boundary diagram in 1.2 and reuses it as the monitoring measurement diagram', () => {
    seedOfficialData();
    renderDoc();
    const diagrams = screen.getAllByTestId('boundary-diagram');
    expect(diagrams.length).toBe(2); // รูปที่ 1 (section 1.2) + ผังจุดตรวจวัด (section 4.1)
    expect(diagrams[0].textContent).toContain('มิเตอร์');
    expect(diagrams[0].textContent).toContain('ระบบสายส่ง');
    expect(screen.getByText(/รูปที่ 1 ขอบเขตของโครงการ/)).toBeInTheDocument();
  });

  it('renders the QA/QC data-flow diagram in section 4.1', () => {
    seedOfficialData();
    renderDoc();
    const flow = screen.getByTestId('dataflow-diagram');
    expect(flow.textContent).toContain('ทวนสอบ');
    expect(screen.getByText(/แผนผังขั้นตอนการจัดเก็บข้อมูล/)).toBeInTheDocument();
  });

  it('renders the yearly generation forecast appendix matching the chained-rounded series', () => {
    seedOfficialData();
    renderDoc();
    const t = screen.getByTestId('forecast-table');
    expect(t.textContent).toContain('963,915');
    expect(t.textContent).toContain('948,584'); // chained rounding (pow drifts to 948,585)
    expect(t.textContent).toContain('6,666,972');
    expect(t.textContent).toContain('952,425');
  });

  it('has no financial appendix — its inputs would be PEA assumptions, not project data', () => {
    seedOfficialData(); // investment_mthb: 30 is set, which used to trigger the table
    renderDoc();
    expect(screen.queryByTestId('financial-table')).toBeNull();
    expect(screen.queryByTestId('financial-summary')).toBeNull();
    expect(screen.queryByText(/การประเมินทางด้านการเงิน/)).toBeNull();
    expect(document.body.textContent).not.toContain('IRR');
  });
});

// ============================================================
// แบบควบรวม (aggregated) — several installation sites bundled under one
// project developer. Site rows live in section_data.sites.
// ============================================================
const TWO_SITES = [
  { owner: 'บริษัท A จำกัด', address: 'สมุทรสาคร', coordinates: '13.57, 100.35',
    kwp: 100, year1_kwh: 200000, first_sync_year: 2569, degradation_pct: 0.5, maintenance_per_year: 4 },
  { owner: 'บริษัท B จำกัด', address: 'ชลบุรี', coordinates: '13.45, 101.06',
    kwp: 150, year1_kwh: 300000, first_sync_year: 2570, degradation_pct: 0.5, maintenance_per_year: 2 },
];

function seedBundleData() {
  const pdd = useStore.getState().pdds.find((p) => p.id === 'PDD-2000')!;
  // demoFixtures reuses module-level objects across seedDemo() calls, so optional
  // keys written by an earlier test must be dropped rather than inherited.
  const { support_equipment: _se, project_type: _pt, ...base } = pdd.section_data as Record<string, unknown>;
  pdd.section_data = {
    ...base,
    project_title_th: 'โครงการทดสอบแบบควบรวม',
    project_owner: 'บริษัท ผู้พัฒนา จำกัด',
    degradation_pct: 0.4,
    crediting_years: '7',
    crediting_start: '2027-01-01',
    project_form: 'แบบควบรวม',
    sites: TWO_SITES,
  };
}

describe('TverSF001Pdd — aggregated (แบบควบรวม) mode', () => {
  it('labels the document แบบควบรวม instead of แบบเดี่ยว', () => {
    seedBundleData();
    renderDoc();
    expect(screen.getAllByText(/แบบควบรวม/).length).toBeGreaterThan(0);
    expect(screen.getAllByText('เอกสารข้อเสนอโครงการ (PDD) แบบควบรวม').length).toBeGreaterThan(0);
    expect(screen.queryAllByText('เอกสารข้อเสนอโครงการ (PDD) แบบเดี่ยว')).toHaveLength(0);
  });

  it('renders one ตารางที่ 1 row per site plus a summed total row', () => {
    seedBundleData();
    renderDoc();
    const table = screen.getByTestId('sites-table');
    // header + 2 site rows + total row
    expect(within(table).getAllByRole('row')).toHaveLength(4);
    expect(within(table).getByText('บริษัท A จำกัด')).toBeInTheDocument();
    expect(within(table).getByText('250.00')).toBeInTheDocument();    // 100 + 150 kWp — รวม prints 2 dp (2,009.30)
    expect(within(table).getByText('500,000')).toBeInTheDocument();   // 200000 + 300000 kWh
  });

  it('renders the per-site yearly forecast with blanks before a site synchronises', () => {
    seedBundleData();
    renderDoc();
    const table = screen.getByTestId('sites-forecast');
    expect(table).toBeInTheDocument();
    // Two header rows (years / ปีที่) + 2 sites + total.
    expect(within(table).getAllByRole('row')).toHaveLength(5);
  });

  it('per-site forecast opens with First Synchronization and the years before crediting, as on page 31', () => {
    // A synchronised 2569, one year before the 2570 crediting start; B in 2570.
    seedBundleData();
    renderDoc();
    const rows = within(screen.getByTestId('sites-forecast')).getAllByRole('row');
    expect(within(rows[0]).getAllByRole('columnheader').map((c) => c.textContent))
      .toEqual(['รายชื่อโครงการ', 'First Synchronization', '2569', '2570', '2571', '2572', '2573', '2574', '2575', '2576']);
    expect(within(rows[1]).getAllByRole('columnheader').map((c) => c.textContent))
      .toEqual(['-', 'ปีที่ 1', 'ปีที่ 2', 'ปีที่ 3', 'ปีที่ 4', 'ปีที่ 5', 'ปีที่ 6', 'ปีที่ 7']);
    const a = within(rows[2]).getAllByRole('cell').map((c) => c.textContent);
    expect(a.slice(0, 4)).toEqual(['บริษัท A จำกัด', '2569', '200,000', '199,000']);
    const b = within(rows[3]).getAllByRole('cell').map((c) => c.textContent);
    expect(b.slice(0, 4)).toEqual(['บริษัท B จำกัด', '2570', '', '300,000']);
    // รวม is summed for crediting years only; the pre-crediting column stays blank.
    const total = within(rows[4]).getAllByRole('cell').map((c) => c.textContent);
    expect(total.slice(0, 4)).toEqual(['รวม', '', '', '499,000']);
  });

  it('renders per-site maintenance frequency', () => {
    seedBundleData();
    renderDoc();
    const table = screen.getByTestId('maintenance-table');
    expect(within(table).getAllByRole('row')).toHaveLength(3); // header + 2 sites
  });

  it('keeps single-project output unchanged when no sites exist', () => {
    seedOfficialData();
    renderDoc();
    // The TGO header box repeats on every page, so the label appears once per sheet.
    expect(screen.getAllByText('เอกสารข้อเสนอโครงการ (PDD) แบบเดี่ยว').length).toBeGreaterThan(0);
    expect(screen.queryAllByText(/เอกสารข้อเสนอโครงการ \(PDD\) แบบควบรวม/)).toHaveLength(0);
    expect(screen.queryByTestId('sites-table')).toBeNull();
    expect(screen.queryByTestId('sites-forecast')).toBeNull();
    expect(screen.queryByTestId('maintenance-table')).toBeNull();
  });
});

// A half-filled bundle is the ordinary state of a draft, and it is where a
// fallback meant for single mode can leak a fabricated figure into an official
// document. Every assertion here is a real-data-only guarantee.
describe('TverSF001Pdd — aggregated mode with incomplete site rows', () => {
  function seedPartialBundle(overrides: Record<string, unknown> = {}) {
    const pdd = useStore.getState().pdds.find((p) => p.id === 'PDD-2000')!;
    const { sites: _sites, ...base } = pdd.section_data as Record<string, unknown>;
    pdd.section_data = {
      ...base,
      project_owner: 'บริษัท ผู้พัฒนา จำกัด',
      crediting_years: '3',
      crediting_start: '2027-01-01',
      project_form: 'แบบควบรวม',
      sites: [{ owner: 'บริษัท ยังไม่กรอก จำกัด' }],
      ...overrides,
    };
  }

  it('prints "-" in the total row rather than the parent project capacity', () => {
    // The parent Project is 200.16 kWp, but no site row carries a capacity —
    // printing 200.160 would assert a figure nothing in the table sums to.
    seedPartialBundle();
    renderDoc();
    const rows = within(screen.getByTestId('sites-table')).getAllByRole('row');
    const total = rows[rows.length - 1];
    expect(within(total).getAllByText('-').length).toBeGreaterThan(0);
    expect(within(total).queryByText(/200\.160/)).toBeNull();
  });

  it('uses the same degradation fallback as the totals table', () => {
    // degradation_pct absent on both the bundle and the site row. computeYearlyTable
    // falls back to 0, so the per-site forecast must stay flat too — a different
    // default would print two contradictory figures for the same year.
    seedPartialBundle({ degradation_pct: '', sites: [{ owner: 'A', kwp: 100, year1_kwh: 1000000 }] });
    renderDoc();
    const rows = within(screen.getByTestId('sites-forecast')).getAllByRole('row');
    const cells = within(rows[2]).getAllByRole('cell').slice(2).map((c) => c.textContent);
    expect(cells).toEqual(['1,000,000', '1,000,000', '1,000,000']);
  });

  it('honours an explicit zero degradation rather than substituting a default', () => {
    seedPartialBundle({ degradation_pct: 0, sites: [{ owner: 'A', kwp: 100, year1_kwh: 500000 }] });
    renderDoc();
    const rows = within(screen.getByTestId('sites-forecast')).getAllByRole('row');
    const cells = within(rows[2]).getAllByRole('cell').slice(2).map((c) => c.textContent);
    expect(cells).toEqual(['500,000', '500,000', '500,000']);
  });
});

// ============================================================
// Per-site detail that แบบควบรวม used to discard: ตารางที่ 2 (equipment by
// site), the site column + renumbering of the installations table, and the
// per-site owner/address/coordinate rows on the cover detail table.
// ============================================================
const SITE_EQUIPMENT = [
  { site: 'บริษัท A จำกัด', item: 'แผงเซลล์แสงอาทิตย์', brand: 'Trinasolar', model: 'TSM-NEG21C.20', spec: 'ขนาด 695 วัตต์', qty: 180 },
  { site: 'บริษัท A จำกัด', item: 'อินเวอร์เตอร์', brand: 'Huawei', model: 'SUN2000-50KTL-M3', qty: 2 },
  { site: 'บริษัท B จำกัด', item: 'แผงเซลล์แสงอาทิตย์', brand: 'Jinko', model: 'JKM580N', qty: 260 },
  // No site column at all — must land in ไม่ระบุพื้นที่, never be dropped.
  { site: '', item: 'ตู้ควบคุมไฟฟ้า', brand: 'Schneider', qty: 1 },
];

const SITE_INSTALLATIONS = [
  { site: 'บริษัท A จำกัด', building: 'อาคาร A1', coordinates: '13.57, 100.35', panels: 180, inverters: 2, kwp: 100 },
  { site: 'บริษัท B จำกัด', building: 'อาคาร B1', coordinates: '13.45, 101.06', panels: 260, inverters: 3, kwp: 150 },
];

/** seedBundleData + the per-site equipment / installation rows. */
function seedBundleDetail(overrides: Record<string, unknown> = {}) {
  seedBundleData();
  const pdd = useStore.getState().pdds.find((p) => p.id === 'PDD-2000')!;
  pdd.section_data = {
    ...pdd.section_data,
    equipment_specs: SITE_EQUIPMENT,
    installations: SITE_INSTALLATIONS,
    ...overrides,
  };
}

describe('TverSF001Pdd — aggregated mode keeps per-site detail', () => {
  it('ตารางที่ 2 prints one row per site with kWp and Solar Panel / Inverter / Energy Meter column pairs', () => {
    // Reference p.9: a wide table, one row per site, each category a
    // ยี่ห้อ / รุ่น cell plus a จำนวน cell, several items stacked on lines.
    seedBundleDetail({
      equipment_specs: [
        { site: 'บริษัท A จำกัด', item: 'แผงเซลล์แสงอาทิตย์', brand: 'Trina Solar', model: 'TSM-DE18-545W', qty: 480 },
        { site: 'บริษัท A จำกัด', item: 'อินเวอร์เตอร์', brand: 'Huawei', model: 'SUN2000-60KTL-M0', qty: 3 },
        { site: 'บริษัท A จำกัด', item: 'อินเวอร์เตอร์', brand: 'Huawei', model: 'SUN2000-36KTL-M3', qty: 1 },
        { site: 'บริษัท A จำกัด', item: 'เครื่องวัดไฟฟ้า', brand: 'EDMI', model: 'Mk6E', qty: 1 },
      ],
    });
    renderDoc();
    const table = screen.getByTestId('equipment-by-site');
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(4); // two header rows + A + B
    expect(within(rows[0]).getAllByRole('cell').map((c) => c.textContent))
      .toEqual(['ลำดับ', 'ชื่อโครงการ', 'กำลังการผลิต (kWp)', 'Solar Panel', 'Inverter', 'Energy Meter']);
    expect(within(rows[1]).getAllByRole('cell').map((c) => c.textContent))
      .toEqual(['ยี่ห้อ / รุ่น', 'จำนวน (แผง)', 'ยี่ห้อ / รุ่น / ขนาด', 'จำนวน (เครื่อง)', 'ยี่ห้อ / รุ่น', 'จำนวน (เครื่อง)']);
    const a = within(rows[2]).getAllByRole('cell');
    expect(a.map((c) => c.textContent)).toEqual([
      '1', 'บริษัท A จำกัด', '100.000',
      'Trina Solar / TSM-DE18-545W', '480',
      'Huawei / SUN2000-60KTL-M0Huawei / SUN2000-36KTL-M3', '31',
      'EDMI / Mk6E', '1',
    ]);
    // The two inverters sit on separate lines in both the name and the count cell.
    expect(a[5].querySelectorAll('br')).toHaveLength(1);
    expect(a[6].querySelectorAll('br')).toHaveLength(1);
    // A site with no equipment rows still gets its row, every category '-'.
    expect(within(rows[3]).getAllByRole('cell').map((c) => c.textContent))
      .toEqual(['2', 'บริษัท B จำกัด', '150.000', '-', '-', '-', '-', '-', '-']);
  });

  it('adds an อื่นๆ column pair only when an item matches no category, keeping the item name', () => {
    seedBundleDetail(); // SITE_EQUIPMENT carries a site-less ตู้ควบคุมไฟฟ้า row
    renderDoc();
    const table = screen.getByTestId('equipment-by-site');
    const rows = within(table).getAllByRole('row');
    expect(within(rows[0]).getAllByRole('cell').map((c) => c.textContent))
      .toEqual(['ลำดับ', 'ชื่อโครงการ', 'กำลังการผลิต (kWp)', 'Solar Panel', 'Inverter', 'Energy Meter', 'อื่นๆ']);
    // Rows whose site matches nothing land in a trailing ไม่ระบุพื้นที่ row, never dropped.
    const orphan = rows[rows.length - 1];
    const cells = within(orphan).getAllByRole('cell').map((c) => c.textContent);
    expect(cells[0]).toBe('3');
    expect(cells[1]).toBe('ไม่ระบุพื้นที่');
    expect(cells[2]).toBe('-');
    expect(cells[cells.length - 2]).toBe('ตู้ควบคุมไฟฟ้า: Schneider');
    expect(cells[cells.length - 1]).toBe('1');
    // Spec joins the ยี่ห้อ / รุ่น cell when present.
    expect(within(rows[2]).getAllByRole('cell')[3].textContent).toBe('Trinasolar / TSM-NEG21C.20 / ขนาด 695 วัตต์');
  });

  it('omits the อื่นๆ columns when every item is categorised', () => {
    seedBundleDetail({ equipment_specs: [SITE_EQUIPMENT[0]] });
    renderDoc();
    const header = within(screen.getByTestId('equipment-by-site')).getAllByRole('row')[0];
    expect(within(header).getAllByRole('cell').map((c) => c.textContent)).not.toContain('อื่นๆ');
  });

  it('renumbers the installations table to ตารางที่ 3 and adds the site column', () => {
    seedBundleDetail();
    renderDoc();
    expect(screen.getByText('ตารางที่ 3 รายละเอียดอุปกรณ์หลักที่ติดตั้งในโครงการ')).toBeInTheDocument();
    expect(screen.queryByText('ตารางที่ 1 รายละเอียดอุปกรณ์หลักที่ติดตั้งในโครงการ')).toBeNull();
    const caption = screen.getByText('ตารางที่ 3 รายละเอียดอุปกรณ์หลักที่ติดตั้งในโครงการ');
    const table = caption.nextElementSibling as HTMLElement;
    expect(within(table).getByText('พื้นที่ติดตั้ง (แห่ง)')).toBeInTheDocument();
    const rows = within(table).getAllByRole('row');
    expect(within(rows[1]).getAllByRole('cell')[0].textContent).toBe('บริษัท A จำกัด');
    // The รวม label spans ลำดับ+พื้นที่+พิกัด so the totals stay under their columns.
    expect(within(rows[rows.length - 1]).getAllByRole('cell')[0].getAttribute('colspan')).toBe('3');
  });

  it('lists every site owner, address and coordinate on the cover detail table', () => {
    seedBundleDetail();
    renderDoc();
    const owners = screen.getByTestId('owners-by-site');
    for (const s of TWO_SITES) {
      expect(within(owners).getByText(s.owner)).toBeInTheDocument();
      expect(within(owners).getByText(s.address)).toBeInTheDocument();
    }
    const coords = screen.getByTestId('coords-by-site');
    expect(coords.textContent).toContain('13.57, 100.35');
    expect(coords.textContent).toContain('13.45, 101.06');
    expect(coords.textContent).toContain('1. บริษัท A จำกัด');
    // The reference prints owner and address once, in one sub-table headed
    // เจ้าของโครงการ | ที่ตั้งโครงการ that both label cells point at.
    const header = within(owners).getAllByRole('row')[0];
    expect(within(header).getAllByRole('cell').map((c) => c.textContent)).toEqual(['เจ้าของโครงการ', 'ที่ตั้งโครงการ']);
    expect(screen.queryByText('1. สมุทรสาคร')).toBeNull();
    expect(screen.getAllByText('สมุทรสาคร')).toHaveLength(1);
  });

  it('maintenance table is headed ชื่อโครงการ and carries the reference note line', () => {
    seedBundleDetail();
    renderDoc();
    const table = screen.getByTestId('maintenance-table');
    const header = within(table).getAllByRole('row')[0];
    expect(within(header).getAllByRole('columnheader').map((c) => c.textContent))
      .toEqual(['ลำดับ', 'ชื่อโครงการ', 'ความถี่ (ครั้ง/ปี)']);
    expect(table.nextElementSibling?.textContent).toBe('หมายเหตุ: อ้างอิงตามแผนการบำรุงรักษาของ บริษัท ผู้พัฒนา จำกัด');
  });

  it('leaves single-project output untouched', () => {
    seedOfficialData();
    renderDoc();
    expect(screen.queryByTestId('support-equipment')).toBeNull();
    expect(screen.queryByTestId('equipment-by-site')).toBeNull();
    expect(screen.queryByTestId('owners-by-site')).toBeNull();
    expect(screen.queryByTestId('coords-by-site')).toBeNull();
    expect(screen.getByText('ตารางที่ 1 รายละเอียดอุปกรณ์หลักที่ติดตั้งในโครงการ')).toBeInTheDocument();
    expect(screen.queryByText(/ตารางที่ 3 รายละเอียดอุปกรณ์หลัก/)).toBeNull();
    expect(screen.queryByText('พื้นที่ติดตั้ง (แห่ง)')).toBeNull();
  });
});

// ============================================================
// อุปกรณ์สนับสนุน (support equipment) — the official form's per-site table of
// Smart Logger / PQM / Router / Water Pump, and the table renumbering it forces.
// ============================================================
const SUPPORT_EQUIPMENT = [
  { site: 'บริษัท A จำกัด', smart_logger: 'Huawei SmartLogger3000', pqm: 'Schneider PM2200',
    router: 'Huawei AR617', water_pump: 'Mitsubishi WP-155Q' },
  // Half-filled row: a real draft state. Blank cells must print '-', never a guess.
  { site: 'บริษัท B จำกัด', smart_logger: 'Huawei SmartLogger3000' },
];

describe('TverSF001Pdd — support-equipment table (อุปกรณ์สนับสนุน)', () => {
  it('renders one row per site under ตารางที่ 4 in aggregated mode', () => {
    seedBundleDetail({ support_equipment: SUPPORT_EQUIPMENT });
    renderDoc();
    expect(screen.getByText(/ตารางที่ 4 รายการอุปกรณ์สนับสนุน/)).toBeInTheDocument();
    const table = screen.getByTestId('support-equipment');
    expect(within(table).getAllByRole('row')).toHaveLength(3); // header + 2 sites
    const header = within(table).getAllByRole('row')[0];
    expect(within(header).getAllByRole('cell').map((c) => c.textContent))
      .toEqual(['ลำดับ', 'ชื่อโครงการ', 'Smart Logger', 'PQM', 'Internet Router', 'Water Pump']);
    const rowA = within(table).getAllByRole('row')[1];
    expect(within(rowA).getAllByRole('cell').map((c) => c.textContent))
      .toEqual(['1', 'บริษัท A จำกัด', 'Huawei SmartLogger3000', 'Schneider PM2200', 'Huawei AR617', 'Mitsubishi WP-155Q']);
  });

  it('prints "-" for the columns a half-filled site row leaves blank', () => {
    seedBundleDetail({ support_equipment: SUPPORT_EQUIPMENT });
    renderDoc();
    const table = screen.getByTestId('support-equipment');
    const rowB = within(table).getAllByRole('row')[2];
    expect(within(rowB).getAllByRole('cell').map((c) => c.textContent))
      .toEqual(['2', 'บริษัท B จำกัด', 'Huawei SmartLogger3000', '-', '-', '-']);
  });

  it('pushes the maintenance table to ตารางที่ 5 when support equipment exists', () => {
    seedBundleDetail({ support_equipment: SUPPORT_EQUIPMENT });
    renderDoc();
    expect(screen.getByText(/ตารางที่ 5 แผนการบำรุงรักษา/)).toBeInTheDocument();
    expect(screen.queryByText(/ตารางที่ 4 แผนการบำรุงรักษา/)).toBeNull();
  });

  it('keeps the maintenance table at ตารางที่ 4 when no support equipment exists', () => {
    seedBundleDetail();
    renderDoc();
    expect(screen.queryByTestId('support-equipment')).toBeNull();
    expect(screen.getByText(/ตารางที่ 4 แผนการบำรุงรักษา/)).toBeInTheDocument();
    expect(screen.queryByText(/ตารางที่ 5 แผนการบำรุงรักษา/)).toBeNull();
  });

  it('numbers the table ตารางที่ 2 in single mode', () => {
    // ตารางที่ 1 is the installations table; seed it rather than rely on a
    // row leaked from an earlier test through the shared fixture object.
    seedMcruData({ installations: [{ building: 'อาคาร 1', panels: 288, inverters: 5, kwp: 200.16 }], support_equipment: [SUPPORT_EQUIPMENT[0]] });
    renderDoc();
    expect(screen.getByText(/ตารางที่ 2 รายการอุปกรณ์สนับสนุน/)).toBeInTheDocument();
    expect(within(screen.getByTestId('support-equipment')).getByText('Schneider PM2200')).toBeInTheDocument();
  });
});

describe('TverSF001Pdd — ประเภทโครงการ full option list', () => {
  const ALL_TYPES = [
    'พลังงานหมุนเวียนหรือพลังงานที่ใช้ทดแทนเชื้อเพลิงฟอสซิล',
    'การเพิ่มประสิทธิภาพในการผลิตไฟฟ้าและการผลิตความร้อน',
    'การใช้ระบบขนส่งสาธารณะ',
    'การใช้ยานพาหนะไฟฟ้า',
    'การเพิ่มประสิทธิภาพเครื่องยนต์',
    'การเพิ่มประสิทธิภาพการใช้พลังงานในอาคารและโรงงาน และในครัวเรือน',
    'การปรับเปลี่ยนสารทำความเย็นธรรมชาติ',
    'การใช้วัสดุทดแทนปูนเม็ด',
    'การจัดการขยะมูลฝอย',
    'การจัดการน้ำเสียชุมชน',
    'การนำก๊าซมีเทนกลับมาใช้ประโยชน์',
    'การจัดการน้ำเสียอุตสาหกรรม',
    'การลด ดูดซับ และการกักเก็บก๊าซเรือนกระจกจากภาคป่าไม้และการเกษตร',
    'การดักจับ กักเก็บ และ/หรือการใช้ประโยชน์จากก๊าซเรือนกระจก',
    'อื่นๆ',
  ];

  it('renders all 15 official categories, ticking only the selected one', () => {
    seedMcruData({ project_type: 'การจัดการขยะมูลฝอย' });
    renderDoc();
    // Every option renders exactly once...
    for (const t of ALL_TYPES) expect(checkboxStates(t), t).toHaveLength(1);
    // ...and exactly the selected one is ticked.
    const ticked = ALL_TYPES.filter((t) => checkboxStates(t)[0] === '☑');
    expect(ticked).toEqual(['การจัดการขยะมูลฝอย']);
  });

  it('ticks the renewable-energy option for a PDD carrying no project_type', () => {
    seedMcruData();
    renderDoc();
    expect(checkboxStates('พลังงานหมุนเวียนหรือพลังงานที่ใช้ทดแทนเชื้อเพลิงฟอสซิล')).toEqual(['☑']);
    const ticked = ALL_TYPES.filter((t) => checkboxStates(t)[0] === '☑');
    expect(ticked).toEqual(['พลังงานหมุนเวียนหรือพลังงานที่ใช้ทดแทนเชื้อเพลิงฟอสซิล']);
  });
});

describe('TverSF001Pdd — contact, dates and additionality detail', () => {
  it('renders the โทรสาร row with its value', () => {
    seedMcruData({ coordinator_fax: '032-123-456' });
    renderDoc();
    const faxLabel = screen.getByText('โทรสาร');
    expect(faxLabel.closest('tr')!.textContent).toContain('032-123-456');
  });

  it('§1.5 prints project_start_date when set', () => {
    // 2024-05-20 → พ.ศ. 2567, distinct from the 2026 crediting start.
    seedMcruData({ project_start_date: '2024-05-20' });
    renderDoc();
    expect(screen.getByText(/วันเริ่มดำเนินโครงการ:/).textContent).toContain('2567');
  });

  it('§1.5 falls back to crediting_start when project_start_date is absent', () => {
    seedMcruData();
    renderDoc();
    // crediting_start 2026-01-01 → พ.ศ. 2569
    expect(screen.getByText(/วันเริ่มดำเนินโครงการ:/).textContent).toContain('2569');
  });

  it('§1.4 non-micro branch prints the barrier and common-practice answers', () => {
    seedMcruData({
      project_scale: 'ใหญ่',
      barrier_type: 'Investment', investment_metric: 'IRR', common_practice: true,
    });
    renderDoc();
    const barrier = screen.getByText(/อุปสรรคหลัก:/);
    expect(barrier.textContent).toContain('Investment');
    expect(barrier.textContent).toContain('ตัวชี้วัด: IRR');
    expect(screen.getByText(/ไม่ใช่การดำเนินงานทั่วไปในพื้นที่:/).textContent).toContain('ใช่');
  });

  it('§1.4 micro-scale (Positive List) branch shows no additionality detail lines', () => {
    seedMcruData({ barrier_type: 'Investment', common_practice: true });
    renderDoc();
    expect(screen.getByText(/Positive List/)).toBeInTheDocument();
    expect(screen.queryByText(/อุปสรรคหลัก:/)).toBeNull();
    expect(screen.queryByText(/ไม่ใช่การดำเนินงานทั่วไปในพื้นที่:/)).toBeNull();
  });
});

// ============================================================
// ภาคผนวก per-site equipment blocks — pages 25-30 of the official form give
// every bundled site its own two-column equipment table.
// ============================================================
describe('TverSF001Pdd — per-site appendix blocks', () => {
  /** Label → value map of one appendix block's two-column table. */
  function blockRows(block: HTMLElement): Record<string, string> {
    const out: Record<string, string> = {};
    for (const row of within(block).getAllByRole('row')) {
      const cells = within(row).getAllByRole('cell');
      out[cells[0].textContent ?? ''] = cells[1]?.textContent ?? '';
    }
    return out;
  }

  it('renders one block per site with the site equipment and support values', () => {
    seedBundleDetail({ support_equipment: SUPPORT_EQUIPMENT });
    renderDoc();
    const blocks = within(screen.getByTestId('site-appendix')).getAllByTestId('site-appendix-block');
    expect(blocks).toHaveLength(TWO_SITES.length);
    expect(blocks[0].textContent).toContain('1) บริษัท A จำกัด');
    expect(blocks[1].textContent).toContain('2) บริษัท B จำกัด');

    const a = blockRows(blocks[0]);
    expect(a['แผงเซลล์แสงอาทิตย์ (Solar Panel)']).toBe('ยี่ห้อ Trinasolar รุ่น TSM-NEG21C.20');
    expect(a['อินเวอร์เตอร์ (Inverter)']).toBe('ยี่ห้อ Huawei รุ่น SUN2000-50KTL-M3');
    // ตู้ควบคุมไฟฟ้า carries an empty site, so it belongs to no block at all.
    expect(a['เครื่องวัดไฟฟ้า (Energy Meter)']).toBe('-');
    expect(a['Smart Logger']).toBe('Huawei SmartLogger3000');
    expect(a['PQM']).toBe('Schneider PM2200');
    expect(a['Internet Router']).toBe('Huawei AR617');
    expect(a['Water Pump']).toBe('Mitsubishi WP-155Q');

    // Site B's half-filled support row prints '-' rather than a guess.
    const b = blockRows(blocks[1]);
    expect(b['แผงเซลล์แสงอาทิตย์ (Solar Panel)']).toBe('ยี่ห้อ Jinko รุ่น JKM580N');
    expect(b['อินเวอร์เตอร์ (Inverter)']).toBe('-');
    expect(b['Smart Logger']).toBe('Huawei SmartLogger3000');
    expect(b['PQM']).toBe('-');
    expect(b['Water Pump']).toBe('-');

    expect(screen.getAllByText('เอกสาร/หลักฐานประกอบ').length).toBeGreaterThan(0);
    expect(blocks[0].textContent).toContain('หลักฐานการเชื่อมต่อระบบผลิตไฟฟ้ากับระบบโครงข่ายไฟฟ้าการไฟฟ้าส่วนภูมิภาค/นครหลวง');
  });

  it('gives a site with no equipment at all a block of "-" rows', () => {
    seedBundleDetail({ equipment_specs: [], support_equipment: [] });
    renderDoc();
    const blocks = screen.getAllByTestId('site-appendix-block');
    expect(blocks).toHaveLength(2);
    for (const label of ['แผงเซลล์แสงอาทิตย์ (Solar Panel)', 'อินเวอร์เตอร์ (Inverter)',
      'เครื่องวัดไฟฟ้า (Energy Meter)', 'Smart Logger', 'PQM', 'Internet Router', 'Water Pump', 'Weather Sensor']) {
      expect(blockRows(blocks[0])[label], label).toBe('-');
    }
  });

  it('files an item matching no official category under อื่นๆ instead of dropping it', () => {
    seedBundleDetail({
      equipment_specs: [
        { site: 'บริษัท A จำกัด', item: 'ตู้ควบคุมไฟฟ้า', brand: 'Schneider', model: 'NSX250' },
        { site: 'บริษัท A จำกัด', item: 'มิเตอร์วัดไฟฟ้า', brand: 'Socomec', model: 'E23' },
      ],
    });
    renderDoc();
    const rows = blockRows(screen.getAllByTestId('site-appendix-block')[0]);
    expect(rows['อื่นๆ']).toBe('ยี่ห้อ Schneider รุ่น NSX250');
    expect(rows['เครื่องวัดไฟฟ้า (Energy Meter)']).toBe('ยี่ห้อ Socomec รุ่น E23');
    // Site B has nothing uncategorised, so it gets no อื่นๆ row.
    expect(blockRows(screen.getAllByTestId('site-appendix-block')[1])['อื่นๆ']).toBeUndefined();
  });

  it('joins several rows of the same category onto separate lines', () => {
    seedBundleDetail({
      equipment_specs: [
        { site: 'บริษัท A จำกัด', item: 'แผงเซลล์แสงอาทิตย์', brand: 'Trinasolar', model: 'TSM-1' },
        { site: 'บริษัท A จำกัด', item: 'Solar Panel (เพิ่มเติม)', brand: 'Jinko', model: 'JKM-2' },
      ],
    });
    renderDoc();
    const cell = within(screen.getAllByTestId('site-appendix-block')[0])
      .getByText('แผงเซลล์แสงอาทิตย์ (Solar Panel)').nextElementSibling as HTMLElement;
    expect(cell.querySelectorAll('br')).toHaveLength(1);
    expect(cell.textContent).toBe('ยี่ห้อ Trinasolar รุ่น TSM-1ยี่ห้อ Jinko รุ่น JKM-2');
  });

  it('single-project mode renders no per-site appendix', () => {
    seedOfficialData();
    renderDoc();
    expect(screen.queryByTestId('site-appendix')).toBeNull();
    expect(screen.queryAllByTestId('site-appendix-block')).toHaveLength(0);
  });
});

describe('TverSF001Pdd — §3.4 summary and the §3.1/§3.2 parameter rows', () => {
  /** พารามิเตอร์ → ค่า for a parameter table, keyed by the first cell. */
  function paramValues(table: HTMLElement, valueIndex: number): Record<string, string> {
    const out: Record<string, string> = {};
    for (const row of within(table).getAllByRole('row')) {
      const cells = within(row).getAllByRole('cell');
      if (cells.length > valueIndex) out[cells[0].textContent ?? ''] = cells[valueIndex].textContent ?? '';
    }
    return out;
  }

  /** The §3.1 / §3.2 parameter table. */
  function equationTable(eq: 'BEy' | 'PEy'): HTMLElement {
    return screen.getByTestId(eq === 'BEy' ? 'be-params' : 'pe-params');
  }

  it('§3.4 lists ER/BE/PE/LE with the computed averages', () => {
    seedMcruData();
    renderDoc();
    const table = screen.getByTestId('er-summary-table');
    // header + 4 parameter rows
    expect(within(table).getAllByRole('row')).toHaveLength(5);
    const v = paramValues(table, 2);
    // §3.4 states ER_y = BE_y − PE_y − LE_y at 2 dp, so the row must satisfy
    // its own equation (the reference prints 1,025.59 − 1.08 = 1,024.51). The
    // floored-then-averaged headline figure belongs to the cover and §3.5 only.
    expect(v['ERy']).toBe('443.21');
    expect(v['BEy']).toBe('445.93');
    expect(v['PEy']).toBe('2.72');
    expect(v['LEy']).toBe('0.00');
    expect(within(table).getAllByText('tCO₂e/year')).toHaveLength(4);
  });

  it('§3.4 prints "-" for every computed value when no emission factor exists', () => {
    seedMcruData();
    useStore.setState({ factors: [] });
    renderDoc();
    const v = paramValues(screen.getByTestId('er-summary-table'), 2);
    expect(v['ERy']).toBe('-');
    expect(v['BEy']).toBe('-');
    expect(v['PEy']).toBe('-');
    // Leakage is nil by methodology, not missing data.
    expect(v['LEy']).toBe('0.00');
  });

  it('§3.1 carries the BE_EG,y row equal to BE_y', () => {
    seedMcruData();
    renderDoc();
    const table = equationTable('BEy');
    const v = paramValues(table, 3);
    expect(v['BEEG,y']).toBe('445.93');
    expect(v['BEy']).toBe('445.93');
    // BE_y, BE_EG,y, EG_Consumer,PJ,y, EF_EC,PJ,y — the official four, in order.
    expect(within(table).getAllByRole('row').slice(1)
      .map((r) => within(r).getAllByRole('cell')[0].textContent))
      .toEqual(['BEy', 'BEEG,y', 'EGConsumer,PJ,y', 'EFEC,PJ,y']);
  });

  it('§3.2 carries PE_FF,y (no fossil fuel → "-") and PE_EL,y (= PE_y)', () => {
    seedMcruData();
    renderDoc();
    const table = equationTable('PEy');
    const v = paramValues(table, 3);
    expect(v['PEFF,y']).toBe('-');
    expect(v['PEEL,y']).toBe('2.72');
    expect(v['PEy']).toBe('2.72');
    expect(within(table).getAllByRole('row').slice(1)
      .map((r) => within(r).getAllByRole('cell')[0].textContent))
      .toEqual(['PEy', 'PEFF,y', 'PEEL,y', 'ECPJ,y', 'EFEC,PJ,y']);
  });
});

describe('TverSF001Pdd — §2.3 carbon-pool table', () => {
  it('renders the three carbon-pool sections, each answered - ไม่มี -', () => {
    seedMcruData();
    renderDoc();
    const table = screen.getByTestId('carbon-pool-table');
    expect(screen.getByText('แหล่งสะสมคาร์บอนและก๊าซเรือนกระจกที่นำมาใช้ในการคำนวณ')).toBeInTheDocument();
    expect(within(table).getAllByText('- ไม่มี -')).toHaveLength(3);
    for (const section of [
      'การดูดซับ ดักจับ และกักเก็บก๊าซเรือนกระจกจากกรณีฐาน',
      'การดูดซับ ดักจับ และกักเก็บก๊าซเรือนกระจกจากการดำเนินโครงการ',
      'การปล่อยก๊าซเรือนกระจกนอกขอบเขตโครงการ',
    ]) expect(within(table).getByText(section), section).toBeInTheDocument();
    // header + 3 section rows + 3 answer rows
    expect(within(table).getAllByRole('row')).toHaveLength(7);
  });
});

describe('TverSF001Pdd — §4.1 maintenance-plan detail', () => {
  const TOPICS = [
    'แผงเซลล์แสงอาทิตย์ (Solar Panel)', 'โครงสร้างรองรับแผงเซลล์แสงอาทิตย์', 'DC Combiner Box',
    'อินเวอร์เตอร์ (Inverter)', 'Solar Distribution Panel', 'เครื่องมือวัดคุณภาพไฟฟ้า (PQM)',
    'Datalogger และ Monitoring', 'ระบบน้ำทำความสะอาดแผงเซลล์แสงอาทิตย์', 'สถานีวัดสภาพอากาศ',
  ];

  function topicTexts(): string[] {
    const list = screen.getByTestId('maintenance-detail');
    return Array.from(list.children).map((li) => (li.firstChild?.textContent ?? '').trim());
  }

  it('lists all nine numbered topics with their bullet sub-items (single mode)', () => {
    seedOfficialData();
    renderDoc();
    expect(screen.getByTestId('maintenance-detail').tagName).toBe('OL');
    expect(topicTexts()).toEqual(TOPICS);
    expect(screen.getByText('รายละเอียดแผนการบำรุงรักษาประจำปี')).toBeInTheDocument();
    // Sub-items hang off their topic, e.g. the Pyranometer check under สถานีวัดสภาพอากาศ.
    const weather = screen.getByText('สถานีวัดสภาพอากาศ', { selector: 'li' });
    expect(within(weather).getByText('ตรวจสอบความสมบูรณ์ทั่วไปของเครื่องวัดความเข้มแสง (Pyranometer)')).toBeInTheDocument();
    expect(within(weather).getAllByRole('listitem')).toHaveLength(3);
  });

  it('renders the same nine topics in aggregated mode', () => {
    seedBundleDetail();
    renderDoc();
    expect(topicTexts()).toEqual(TOPICS);
  });
});

describe('TverSF001Pdd — fixed diagram numbering and cumulative degradation', () => {
  it('numbers the monitoring diagrams ภาพที่ 7 and ภาพที่ 8 regardless of site photos', () => {
    seedOfficialData();
    renderDoc();
    expect(screen.getByText(/^ภาพที่ 7 รูปแสดงผังจุดตรวจวัด/)).toBeInTheDocument();
    expect(screen.getByText(/^ภาพที่ 8 แผนผังขั้นตอนการจัดเก็บข้อมูล/)).toBeInTheDocument();
    // prj-0001 carries site-photo evidence in the demo fixtures; the captions
    // must not shift with it.
    expect(pddSiteImages(useStore.getState().evidence, 'prj-0001').length).toBeGreaterThan(0);
    expect(screen.queryByText(/ภาพที่ \d+ รูปแสดงผังจุดตรวจวัด/)?.textContent).toContain('ภาพที่ 7');
  });

  it('keeps ภาพที่ 7/8 when the project has no image evidence at all', () => {
    useStore.setState({ evidence: [] });
    seedOfficialData();
    renderDoc();
    expect(screen.getByText(/^ภาพที่ 7 รูปแสดงผังจุดตรวจวัด/)).toBeInTheDocument();
    expect(screen.getByText(/^ภาพที่ 8 แผนผังขั้นตอนการจัดเก็บข้อมูล/)).toBeInTheDocument();
  });

  it('prints the degradation column as MCRU p.23 does: the rate per row, summed in รวม', () => {
    seedMcruData({ degradation_pct: 0.4, crediting_years: '7' });
    renderDoc();
    const rows = within(screen.getByTestId('forecast-table')).getAllByRole('row');
    const pct = (i: number) => within(rows[i]).getAllByRole('cell')[2].textContent;
    for (let y = 1; y <= 7; y++) expect(pct(y), `year ${y}`).toBe('0.40%');
    expect(pct(8)).toBe('2.80%'); // รวม = 7 × 0.40%
    expect(pct(9)).toBe('0.40%'); // เฉลี่ยต่อปี
  });

  it('prints a flat 0.00% column when no degradation rate is set', () => {
    seedMcruData({ degradation_pct: '' });
    renderDoc();
    const rows = within(screen.getByTestId('forecast-table')).getAllByRole('row');
    expect(within(rows[1]).getAllByRole('cell')[2].textContent).toBe('0.00%');
    expect(within(rows[7]).getAllByRole('cell')[2].textContent).toBe('0.00%');
  });
});

describe('TverSF001Pdd — ตารางที่ 1 total row cell count', () => {
  it('spans the three label columns so the row matches the 5-column header', () => {
    seedBundleData();
    renderDoc();
    const table = screen.getByTestId('sites-table');
    const rows = within(table).getAllByRole('row');
    const total = rows[rows.length - 1];
    const cells = within(total).getAllByRole('cell');
    expect(cells).toHaveLength(3); // รวม(colspan 3) + kWp + kWh
    expect(cells[0].getAttribute('colspan')).toBe('3');
    expect(cells[0].textContent).toBe('รวม');
    expect(cells[1].textContent).toBe('250.00');
    expect(cells[2].textContent).toBe('500,000');
    // Column count matches the header: 3 spanned + 2 value cells = 5.
    expect(within(rows[0]).getAllByRole('columnheader')).toHaveLength(5);
  });
});

// ============================================================
// Fidelity against the 59-page reference แบบควบรวม document (2026-09-14 audit).
// Each block below reproduces one thing the reference prints that the
// template did not.
// ============================================================
describe('TverSF001Pdd — table numbering follows the reference sequence', () => {
  it('numbers support equipment ตารางที่ 3 and maintenance ตารางที่ 4 when there is no installations table', () => {
    // The reference document has no per-building installations table: its
    // sequence is 1 sites, 2 equipment, 3 support equipment, 4 maintenance.
    seedBundleDetail({ installations: [], support_equipment: SUPPORT_EQUIPMENT });
    renderDoc();
    expect(screen.getByText(/ตารางที่ 3 รายการอุปกรณ์สนับสนุน/)).toBeInTheDocument();
    expect(screen.getByText(/ตารางที่ 4 แผนการบำรุงรักษา/)).toBeInTheDocument();
    expect(screen.queryByText(/ตารางที่ 5 /)).toBeNull();
  });

  it('numbers maintenance ตารางที่ 3 when neither installations nor support equipment exist', () => {
    seedBundleDetail({ installations: [] });
    renderDoc();
    expect(screen.getByText(/ตารางที่ 3 แผนการบำรุงรักษา/)).toBeInTheDocument();
    expect(screen.queryByText(/ตารางที่ 4 /)).toBeNull();
  });
});

describe('TverSF001Pdd — appendix files เครื่องวัดไฟฟ้า under Energy Meter', () => {
  it('matches the Thai item name the equipment table itself uses', () => {
    seedBundleDetail({
      equipment_specs: [{ site: 'บริษัท A จำกัด', item: 'เครื่องวัดไฟฟ้า', brand: 'EDMI', model: 'Mk6E', qty: 1 }],
    });
    renderDoc();
    const block = screen.getAllByTestId('site-appendix-block')[0];
    const meterRow = within(block).getByText('เครื่องวัดไฟฟ้า (Energy Meter)').closest('tr')!;
    expect(within(meterRow).getAllByRole('cell')[1].textContent).toBe('ยี่ห้อ EDMI รุ่น Mk6E');
    expect(within(block).queryByText('อื่นๆ')).toBeNull();
  });
});

describe('TverSF001Pdd — boundary diagram in aggregated mode', () => {
  it('labels the consumer box ผู้ใช้ไฟฟ้า without naming the developer, and the grid PEA / MEA', () => {
    // The bundled sites' owners are the electricity consumers, not the developer.
    seedBundleDetail();
    renderDoc();
    const diagram = screen.getAllByTestId('boundary-diagram')[0];
    expect(diagram.textContent).toContain('ผู้ใช้ไฟฟ้า');
    expect(diagram.textContent).not.toContain('บริษัท ผู้พัฒนา จำกัด');
    expect(diagram.textContent).toContain('ระบบสายส่ง PEA / MEA');
  });
});

describe('TverSF001Pdd — cover and detail-page wording from the reference', () => {
  it('ตารางที่ 1 header spells out ปริมาณไฟฟ้าปีที่ 1 ที่คาดว่าจะผลิตได้', () => {
    seedBundleData();
    renderDoc();
    const header = within(screen.getByTestId('sites-table')).getAllByRole('row')[0];
    expect(within(header).getAllByRole('columnheader').map((c) => c.textContent))
      .toEqual(['ลำดับ', 'เจ้าของโครงการ', 'ผู้พัฒนาโครงการ', 'กำลังการผลิตติดตั้ง (kWp)', 'ปริมาณไฟฟ้าปีที่ 1 ที่คาดว่าจะผลิตได้ (kWh/year)']);
  });

  it('prints the crediting period as a พ.ศ. date range on the detail page and in §1.5', () => {
    // 7 years from 2027-01-01 → 1 มกราคม พ.ศ. 2570 ถึง 31 ธันวาคม พ.ศ. 2576
    seedBundleData();
    renderDoc();
    const range = screen.getAllByText(/7 ปี \(1 มกราคม พ\.ศ\. 2570 ถึง 31 ธันวาคม พ\.ศ\. 2576\)/);
    expect(range.length).toBeGreaterThanOrEqual(2);
  });

  it('cover page carries the ผู้พัฒนาโครงการ label above the developer name', () => {
    seedBundleData();
    const { container } = renderDoc();
    const cover = container.querySelector('.cover-page')!;
    expect(cover.textContent).toContain('ผู้พัฒนาโครงการ');
    expect(cover.textContent).toContain('บริษัท ผู้พัฒนา จำกัด');
  });
});

describe('TverSF001Pdd — §2.2 and §2.3 carry the reference rows', () => {
  it('§2.2 splits Applicability from four numbered Project Conditions under a methodology header block', () => {
    seedBundleData();
    renderDoc();
    const table = screen.getByTestId('applicability-table');
    const firstCells = within(table).getAllByRole('row').map((r) => within(r).getAllByRole('cell')[0].textContent ?? '');
    expect(firstCells).toEqual([
      'เงื่อนไขของกิจกรรมโครงการ',
      'ลักษณะของกิจกรรมโครงการที่เข้าข่าย (Applicability)',
      expect.stringMatching(/^เป็นโครงการที่มีกิจกรรมการผลิตไฟฟ้าจากพลังงานหมุนเวียน/),
      'เงื่อนไขของกิจกรรมโครงการ (Project Conditions)',
      expect.stringMatching(/^1\. เป็นการผลิตไฟฟ้าเพื่อทดแทนการผลิตไฟฟ้าจากเชื้อเพลิงฟอสซิล/),
      expect.stringMatching(/^2\. สำหรับกรณีการผลิตไฟฟ้าจากเชื้อเพลิงชีวมวล/),
      expect.stringMatching(/^3\. สำหรับกรณีที่เป็นการผลิตไฟฟ้าจากพลังงานหมุนเวียนระดับชุมชน/),
      expect.stringMatching(/^4\. สำหรับกรณีการนำก๊าซชีวภาพนอกขอบเขตโครงการ/),
    ]);
    expect(within(table).getAllByRole('row')[4].textContent).toContain('เข้าเงื่อนไข');
    // รหัส / เวอร์ชั่น / ชื่อระเบียบวิธีฯ header block precedes §2.2, §3.1, §3.2 and §3.4.
    expect(screen.getAllByText(/^รหัส: /)).toHaveLength(4);
    expect(screen.getAllByText(/^เวอร์ชั่น: /)).toHaveLength(4);
    expect(screen.getAllByText(/^ชื่อระเบียบวิธีฯ: /)).toHaveLength(4);
  });

  it('§2.3 lists the six emission sources of the reference with their gases', () => {
    seedBundleData();
    renderDoc();
    const table = screen.getByTestId('emission-source-table');
    const rows = within(table).getAllByRole('row');
    expect(within(rows[0]).getAllByRole('cell').map((c) => c.textContent))
      .toEqual(['แหล่งปล่อยก๊าซเรือนกระจก', 'ชนิดของก๊าซเรือนกระจก', 'รายละเอียดของกิจกรรมโครงการ']);
    const sources = rows.slice(1)
      .map((r) => within(r).getAllByRole('cell'))
      .filter((cells) => cells.length === 3)
      .map((cells) => [cells[0].textContent, cells[1].textContent]);
    expect(sources).toEqual([
      ['การผลิตไฟฟ้าของระบบสายส่ง', 'CO₂'],
      ['การผลิตไฟฟ้าเพื่อใช้เอง หรือ ส่ง หรือจำหน่ายให้ผู้ประกอบการรายอื่น', 'CO₂'],
      ['การใช้เชื้อเพลิงฟอสซิล', 'CO₂'],
      ['การใช้ไฟฟ้า', 'CO₂'],
      ['การใช้เชื้อเพลิงฟอสซิลจากการขนส่ง', 'CO₂'],
      ['ระบบบำบัดน้ำเสียแบบไร้อากาศ/ระบบกักเก็บและระบบ Biogas flare', 'CH₄'],
    ]);
  });
});

describe('TverSF001Pdd — ส่วนที่ 3 headings, method blocks and the §3.5 layout', () => {
  it('uses the reference section titles', () => {
    seedBundleData();
    renderDoc();
    expect(screen.getByText('3.1 การคำนวณปริมาณก๊าซเรือนกระจกกรณีฐาน (Baseline Sequestration/Emission)')).toBeInTheDocument();
    expect(screen.getByText('3.2 การคำนวณปริมาณก๊าซเรือนกระจกจากการดำเนินโครงการ (Project Sequestration/Emission)')).toBeInTheDocument();
    expect(screen.getByText('3.4 สรุปปริมาณการลดก๊าซเรือนกระจก')).toBeInTheDocument();
    expect(screen.getByText('3.5 สรุปปริมาณก๊าซเรือนกระจกที่คาดว่าจะลด/กักเก็บได้')).toBeInTheDocument();
  });

  it('§3.1 states BEy = BEEG,y, then กรณีที่ 2 and its equation, before the parameter table', () => {
    seedBundleData();
    renderDoc();
    const block = screen.getByTestId('be-method');
    expect(block.textContent).toContain('สมการที่ใช้: BEy = BEEG,y');
    expect(block.textContent).toContain('กรณีที่ 2 ผลิตไฟฟ้าเพื่อใช้เอง/ส่งหรือจำหน่ายให้แก่ผู้ประกอบการรายอื่น (ลดการซื้อไฟฟ้าจากระบบสายส่ง)');
    expect(block.textContent).toContain('BEEG,y = (EGConsumer,PJ,y × 10⁻³) × EFEC,PJ,y');
    const pe = screen.getByTestId('pe-method');
    expect(pe.textContent).toContain('สมการที่ใช้: PEy = PEFF,y + PEEL,y');
    expect(pe.textContent).toContain('กรณีที่ 2 การปล่อยก๊าซเรือนกระจกจากการใช้ไฟฟ้าจากระบบสายส่งหรือการใช้ไฟฟ้าที่ผลิตจากเชื้อเพลิงฟอสซิล');
    expect(screen.getByTestId('er-method').textContent).toContain('สมการที่ใช้: ERy = BEy – PEy – LEy');
  });

  it('§3.5 puts the crediting-period checkboxes under the heading and dates every year row', () => {
    seedBundleData(); // 7 years from 2027-01-01
    renderDoc();
    const table = screen.getByTestId('yearly-table');
    const rows = within(table).getAllByRole('row');
    const first = (i: number) => within(rows[i]).getAllByRole('cell')[0].textContent;
    expect(first(1)).toBe('1 (1/1/2570 – 31/12/2570)');
    expect(first(7)).toBe('7 (1/1/2576 – 31/12/2576)');
    // รวม, จำนวนปี, เฉลี่ยปีละ close the table as on page 20.
    expect(first(8)).toBe('รวม (tCO₂eq)');
    expect(within(rows[9]).getAllByRole('cell').map((c) => c.textContent)).toEqual(['จำนวนปี', '7', '7', '7', '7']);
    expect(first(10)).toBe('เฉลี่ยปีละ (tCO₂eq/y)');
    // The period line sits between the heading and the table.
    const heading = screen.getByText('3.5 สรุปปริมาณก๊าซเรือนกระจกที่คาดว่าจะลด/กักเก็บได้');
    expect(heading.nextElementSibling?.textContent).toContain('ระยะเวลาการคิดเครดิตของโครงการ');
    expect(heading.nextElementSibling?.textContent).toContain('☑7 ปี (1 มกราคม พ.ศ. 2570 ถึง 31 ธันวาคม พ.ศ. 2576)');
  });

  it('§3.5 year ranges follow a mid-year crediting start', () => {
    seedMcruData({ crediting_start: '2026-04-01', crediting_years: '7' });
    renderDoc();
    const rows = within(screen.getByTestId('yearly-table')).getAllByRole('row');
    expect(within(rows[1]).getAllByRole('cell')[0].textContent).toBe('1 (1/4/2569 – 31/3/2570)');
  });
});

describe('TverSF001Pdd — ส่วนที่ 4 wording from the reference', () => {
  it('maintenance detail reproduces the reference items verbatim, nine for the inverter and nine for the panel board', () => {
    seedBundleDetail();
    renderDoc();
    const list = screen.getByTestId('maintenance-detail');
    const topic = (name: string) => within(list).getByText(name, { selector: 'li' });
    expect(within(topic('แผงเซลล์แสงอาทิตย์ (Solar Panel)')).getByText('ตรวจสอบสภาพทั่วไปของแผงเซลล์แสงอาทิตย์')).toBeInTheDocument();
    expect(within(topic('อินเวอร์เตอร์ (Inverter)')).getAllByRole('listitem')).toHaveLength(9);
    expect(within(topic('อินเวอร์เตอร์ (Inverter)')).getByText('ทำความสะอาดห้องอินเวอร์เตอร์')).toBeInTheDocument();
    expect(within(topic('Solar Distribution Panel')).getAllByRole('listitem')).toHaveLength(9);
    expect(within(topic('Solar Distribution Panel')).getByText('ทำความสะอาดห้องไฟฟ้า')).toBeInTheDocument();
  });

  it('§4.1 opens with the monitoring narrative naming the developer and the maintenance table', () => {
    seedBundleDetail({ installations: [], support_equipment: SUPPORT_EQUIPMENT });
    renderDoc();
    const para = screen.getByText(/^การติดตามผลการลดการปล่อยก๊าซเรือนกระจกที่เกิดขึ้นจากโครงการนี้/);
    expect(para.textContent).toContain('บริษัท ผู้พัฒนา จำกัด ในฐานะผู้พัฒนาโครงการ');
    expect(para.textContent).toContain('ดังภาพที่ 7 และ 8');
    expect(para.textContent).toContain('ดังตารางที่ 4');
    expect(screen.queryByText(/พารามิเตอร์ที่ติดตาม:/)).toBeNull();
  });

  it('§4.3 parameter cards carry the reference source and monitoring wording', () => {
    seedBundleDetail();
    renderDoc();
    expect(screen.getByText('ข้อมูลจากรายงานค่าการปล่อยก๊าซเรือนกระจกจากการผลิต/การใช้ไฟฟ้า (Emission Factor) สำหรับโครงการและกิจกรรมลดก๊าซเรือนกระจกที่ประกาศโดย อบก.')).toBeInTheDocument();
    // EF carries <sub> markup, so match on the cell's full text.
    expect(screen.getByText((_, el) => el?.tagName === 'TD'
      && (el.textContent ?? '').startsWith('ใช้ค่า EFEC,PJ,y ที่ อบก. ประกาศตามปี พ.ศ. ของช่วงระยะเวลาที่ขอรับรองคาร์บอนเครดิต'))).toBeInTheDocument();
    expect(screen.getByText('ตรวจวัดโดย kWh Meter และตรวจวัดต่อเนื่องตลอดช่วงของการติดตามผล โดยรายงานข้อมูลที่มีความละเอียดเป็นรายเดือน')).toBeInTheDocument();
    expect(screen.getByText('คำนวณจากค่าพิกัดกำลังไฟฟ้าจากผู้ผลิตอุปกรณ์ และบันทึกชั่วโมงการทำงานของอุปกรณ์ โดยตรวจวัดชั่วโมงการทำงานต่อเนื่องตลอดช่วงของการติดตามผล และรายงานข้อมูลที่มีความละเอียดเป็นรายเดือน')).toBeInTheDocument();
  });
});

describe('TverSF001Pdd — appendix tables from pages 25-32', () => {
  it('consumer table takes the reference title and columns, multiplying by จำนวน (ชุด)', () => {
    seedBundleDetail({
      consumers: [
        { equipment: 'Huawei / SLogger3000A00GL', qty: 5, rated_w: 8, hours_per_year: 8760 },
        { equipment: 'MITSUBISHI / CP-255R', qty: 1, rated_w: 250, hours_per_year: 153 },
      ],
    });
    renderDoc();
    expect(screen.getByText('ตารางแสดงปริมาณการใช้ไฟฟ้าสำหรับอุปกรณ์ประกอบการติดตั้ง')).toBeInTheDocument();
    const table = screen.getByTestId('consumers-table');
    const rows = within(table).getAllByRole('row');
    expect(within(rows[0]).getAllByRole('cell').map((c) => c.textContent))
      .toEqual(['อุปกรณ์', 'จำนวน (ชุด)', 'กำลังไฟ (W)', 'ชั่วโมงทำงานต่อปี', 'พลังงานไฟฟ้ารวมต่อปี (kWh)']);
    expect(within(rows[1]).getAllByRole('cell').map((c) => c.textContent))
      .toEqual(['Huawei / SLogger3000A00GL', '5', '8.00', '8,760', '350.40']);
    expect(within(rows[2]).getAllByRole('cell').map((c) => c.textContent))
      .toEqual(['MITSUBISHI / CP-255R', '1', '250.00', '153', '38.25']);
    expect(screen.getByTestId('ecpj-total').textContent).toBe('388.65');
  });

  it('consumer table shows the หมายเหตุ column only when a row carries a note', () => {
    seedMcruData(); // MCRU rows all carry notes
    renderDoc();
    const header = within(screen.getByTestId('consumers-table')).getAllByRole('row')[0];
    expect(within(header).getAllByRole('cell').map((c) => c.textContent)).toContain('หมายเหตุ');
    expect(screen.getByText('ล้างแผง 1 ครั้ง/ปี')).toBeInTheDocument();
  });

  it('per-site appendix adds Weather Sensor and prints "brand / model" values as ยี่ห้อ … รุ่น …, one per line', () => {
    seedBundleDetail({
      support_equipment: [{
        site: 'บริษัท A จำกัด', smart_logger: 'Huawei / SLogger3000A00GL', pqm: 'Janitza / UMG511',
        router: 'TP-Link / TL-MR6400', water_pump: 'Super pump / UMCH-755S.15',
        weather_sensor: 'HUKSEFLEX / SR05-D1A3\nRika / RK330-01',
      }],
    });
    renderDoc();
    const block = screen.getAllByTestId('site-appendix-block')[0];
    const cell = (label: string) => within(block).getByText(label).nextElementSibling as HTMLElement;
    expect(cell('Smart Logger').textContent).toBe('ยี่ห้อ Huawei รุ่น SLogger3000A00GL');
    expect(cell('Water Pump').textContent).toBe('ยี่ห้อ Super pump รุ่น UMCH-755S.15');
    expect(cell('Weather Sensor').textContent).toBe('ยี่ห้อ HUKSEFLEX รุ่น SR05-D1A3ยี่ห้อ Rika รุ่น RK330-01');
    expect(cell('Weather Sensor').querySelectorAll('br')).toHaveLength(1);
    // A value without the " / " separator is the operator's text and prints as typed.
    expect(within(screen.getAllByTestId('site-appendix-block')[1]).getByText('Water Pump').nextElementSibling?.textContent).toBe('-');
  });
});

// ============================================================
// The six-site demo (PDD-2010) is the reference document's own data. Rendering
// it must reproduce the reference's identifiers and tables, not just its sums.
// ============================================================
describe('TverSF001Pdd — PDD-2010 reproduces the reference document', () => {
  function renderReference() {
    return render(<MemoryRouter><TverSF001Pdd pddId="PDD-2010" /></MemoryRouter>);
  }

  it('names the official TGO methodology on the detail page and in §2.1', () => {
    renderReference();
    expect(screen.getByText('T-VER-S-METH-01-01 ระเบียบวิธีการลดก๊าซเรือนกระจกภาคสมัครใจสำหรับการผลิตไฟฟ้าจากพลังงานหมุนเวียน (Electricity Generation from Renewable Energy) ฉบับที่ 03 Scope: 01 – Energy Industries')).toBeInTheDocument();
    expect(screen.getAllByText('รหัส: T-VER-S-METH-01-01')).toHaveLength(4);
    expect(screen.getAllByText('เวอร์ชั่น: 03')).toHaveLength(4);
  });

  it('ตารางที่ 2 carries every site\'s panel, inverter and meter from page 9', () => {
    renderReference();
    const rows = within(screen.getByTestId('equipment-by-site')).getAllByRole('row');
    const cells = (i: number) => within(rows[i]).getAllByRole('cell').map((c) => c.textContent);
    expect(cells(2)).toEqual(['1', 'บริษัท A จำกัด', '261.600', 'Trina Solar / TSM-DE18-545W', '480',
      'Huawei / SUN2000-60KTL-M0Huawei / SUN2000-36KTL-M3', '31', 'EDMI / Mk6E', '1']);
    expect(cells(5)).toEqual(['4', 'บริษัท D จำกัด', '311.605', 'Jinko / JKM545M-72HL4Jinko / JKM460M-7RL3', '13662',
      'Huawei / SUN2000-100KTL-M1', '3', 'EDMI / Mk6E', '1']);
    expect(cells(7)).toEqual(['6', 'บริษัท F จำกัด', '600.590', 'Jinko / JKM545M-72HL4', '1,102',
      'Sungrow / SG125CX-P2', '4', 'EDMI / Mk6Es', '1']);
    expect(rows).toHaveLength(8); // two header rows + six sites, nothing uncategorised
  });

  it('per-site appendix lists the weather sensors of pages 25-30', () => {
    renderReference();
    const blocks = screen.getAllByTestId('site-appendix-block');
    const weather = (i: number) => within(blocks[i]).getByText('Weather Sensor').nextElementSibling as HTMLElement;
    expect(weather(0).textContent).toBe('ยี่ห้อ HUKSEFLEX รุ่น SR05-D1A3');
    expect(weather(5).textContent).toBe('ยี่ห้อ HUKSEFLEX รุ่น SR05-D2A2ยี่ห้อ Rika รุ่น RK330-01ยี่ห้อ Rika รุ่น RK220-01ยี่ห้อ Rika รุ่น 100-02');
    expect(within(blocks[5]).getByText('เครื่องวัดไฟฟ้า (Energy Meter)').nextElementSibling?.textContent).toBe('ยี่ห้อ EDMI รุ่น Mk6Es');
  });

  it('consumer appendix carries the fifteen page-32 rows with their quantities', () => {
    renderReference();
    const rows = within(screen.getByTestId('consumers-table')).getAllByRole('row');
    expect(rows).toHaveLength(17); // header + 15 rows + รวม
    expect(within(rows[1]).getAllByRole('cell').map((c) => c.textContent).slice(0, 5))
      .toEqual(['Smart Logger: Huawei / SLogger3000A00GL', '5', '8.00', '8,760', '350.40']);
    // Calpeda pump has no rated power in the reference: '-' rather than a guess.
    expect(within(rows[12]).getAllByRole('cell').map((c) => c.textContent).slice(0, 5))
      .toEqual(['Water Pump: Calpeda / PTV-24A', '1', '-', '144', '-']);
    // W × h ÷ 1000 × qty from the reference's inputs; its own kWh column rounds
    // the pump hours differently and sums to 2,227.11.
    expect(screen.getByTestId('ecpj-total').textContent).toBe('2,228.28');
  });
});

// ============================================================
// MCRU fidelity fixes — cover activity, permit sentence, §4.3 EG method,
// PE run total.
// ============================================================
describe('TverSF001Pdd — MCRU fidelity fixes', () => {
  /** The value cell of the cover's กิจกรรมของโครงการ row. */
  const activityCell = () => screen.getByText('กิจกรรมของโครงการ').nextElementSibling?.textContent ?? '';
  /** The วิธีการติดตามผล cell of the §4.3 EG_Consumer card. */
  const egMethodCell = () => {
    const card = screen.getAllByText('Consumer,PJ,y').map((el) => el.closest('table'))
      .find((t) => t?.querySelector('tr')?.textContent === 'พารามิเตอร์EGConsumer,PJ,y')!;
    return within(card).getByText('วิธีการติดตามผล').nextElementSibling?.textContent ?? '';
  };

  it('cover activity prints project_activity, not the §1.1 after_project narrative', () => {
    seedMcruData({ project_activity: 'ประโยคสรุปกิจกรรม', after_project: 'ย่อหน้ายาวของข้อ 1.1' });
    renderDoc();
    expect(activityCell()).toBe('ประโยคสรุปกิจกรรม');
  });

  it('an unfilled single PDD gets the generated one-sentence activity summary', () => {
    seedMcruData({ after_project: 'ย่อหน้ายาวของข้อ 1.1' });
    renderDoc();
    expect(activityCell()).toContain('โครงการติดตั้งระบบผลิตไฟฟ้าพลังงานแสงอาทิตย์ที่ติดตั้งบนหลังคา (Solar Rooftop)');
    expect(activityCell()).toContain('กิโลวัตต์สูงสุด (kWp)');
    expect(activityCell()).not.toContain('ย่อหน้ายาว');
  });

  it('does not repeat the permit sentence when the §1.1 text already cites the permit', () => {
    seedMcruData({
      permit_no: '12/2568', permit_date: '2025-03-25',
      after_project: 'ซึ่งตั้งอยู่บนพื้นที่เดียวกันตามใบอนุญาตก่อสร้างอาคาร เลขที่ 12/2568 ลงวันที่ 25 มีนาคม 2568',
    });
    renderDoc();
    expect(screen.queryByText(/ทำการติดตั้งตามใบอนุญาตก่อสร้างอาคาร/)).not.toBeInTheDocument();
  });

  it('still adds the permit sentence when the §1.1 text does not mention it', () => {
    seedMcruData({ permit_no: '12/2568', permit_date: '2025-03-25', after_project: 'ข้อความไม่มีเลขใบอนุญาต' });
    renderDoc();
    expect(screen.getByText(/ทำการติดตั้งตามใบอนุญาตก่อสร้างอาคาร/).textContent).toContain('12/2568');
  });

  it('§4.3 EG method uses eg_monitoring_method and states the deduction', () => {
    seedMcruData({
      eg_monitoring_method: 'ตรวจวัดโดย Energy Meter หรือ Power Meter ที่ติดตั้งอยู่ในอินเวอร์เตอร์ และแสดงผลผ่านทางโปรแกรม Fusion Solar',
      eg_deduction_pct: 5,
    });
    renderDoc();
    const cell = egMethodCell();
    expect(cell).toContain('Fusion Solar');
    expect(cell).toContain('หักข้อมูลปริมาณไฟฟ้าที่ตรวจวัดได้ออก 5% ก่อนนำไปคำนวณ');
    expect(cell).not.toContain('kWh Meter');
  });

  it('§4.3 EG method falls back to the standard wording with no deduction clause', () => {
    seedMcruData();
    renderDoc();
    const cell = egMethodCell();
    expect(cell).toContain('ตรวจวัดโดย kWh Meter');
    expect(cell).not.toContain('หักข้อมูล');
  });

  it('§3.5 PE run total is 19.01, the unrounded yearly PE × 7', () => {
    seedMcruData();
    renderDoc();
    const text = screen.getByTestId('yearly-table').textContent ?? '';
    expect(text).toContain('19.01');
    expect(text).not.toContain('19.04');
  });
});

describe('TverSF001Pdd — capacity follows ตารางที่ 1', () => {
  // PDD-2000's project record says 250 kWp; the MCRU rows sum to 667.20.
  const MCRU_INSTALLATIONS = [
    { building: 'อาคาร 1', kwp: 200.16 }, { building: 'อาคาร 2', kwp: 66.72 }, { building: 'อาคาร 3', kwp: 133.44 },
    { building: 'อาคาร 4', kwp: 133.44 }, { building: 'อาคาร 5', kwp: 133.44 },
  ];

  it('§1.2, รูปที่ 1 and the financial appendix all print the table total', () => {
    seedMcruData({ installations: MCRU_INSTALLATIONS, investment_mthb: 30 });
    renderDoc();
    expect(screen.getByText(/ขนาดกำลังติดตั้งรวม 667.20 kWp/)).toBeInTheDocument();
    for (const d of screen.getAllByTestId('boundary-diagram')) expect(d.textContent).toContain('667.20 kW');
    expect(document.body.textContent).not.toMatch(/250\.00 kWp/);
  });

  it('falls back to the project capacity when ตารางที่ 1 has no kWp', () => {
    seedMcruData({ installations: [] });
    renderDoc();
    expect(screen.getByText(/ขนาดกำลังติดตั้งรวม 250.00 kWp/)).toBeInTheDocument();
  });

  it('the generated cover activity sentence uses the same table total', () => {
    seedMcruData({ installations: MCRU_INSTALLATIONS });
    renderDoc();
    expect(screen.getByText('กิจกรรมของโครงการ').nextElementSibling?.textContent)
      .toContain('ไม่น้อยกว่า 667.20 กิโลวัตต์สูงสุด (kWp)');
  });
});
