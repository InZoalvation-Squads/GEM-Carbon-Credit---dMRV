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
    project_start_date: _p9, coordinator_fax: _p10, ...base
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

  it('renders the PEA financial appendix with IRR and payback', () => {
    seedOfficialData();
    renderDoc();
    const fin = screen.getByTestId('financial-table');
    expect(fin).toBeInTheDocument();
    expect(fin.textContent).toContain('30,000,000');           // investment outlay
    expect(screen.getByTestId('financial-summary').textContent).toMatch(/ผลตอบแทน.*%/);
    expect(screen.getByTestId('financial-summary').textContent).toMatch(/คุ้มทุน/);
  });

  it('omits the financial appendix when no investment figure exists', () => {
    const pdd = useStore.getState().pdds.find((p) => p.id === 'PDD-2000')!;
    seedOfficialData();
    delete pdd.section_data.investment_mthb;
    renderDoc();
    expect(screen.queryByTestId('financial-table')).toBeNull();
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
    expect(within(table).getByText('250.000')).toBeInTheDocument();   // 100 + 150 kWp
    expect(within(table).getByText('500,000')).toBeInTheDocument();   // 200000 + 300000 kWh
  });

  it('renders the per-site yearly forecast with blanks before a site synchronises', () => {
    seedBundleData();
    renderDoc();
    const table = screen.getByTestId('sites-forecast');
    expect(table).toBeInTheDocument();
    // Site B synchronises in 2570 — the crediting period starts 2570 (2027 CE),
    // so both sites are live from year 1 and no cell should be blank here.
    expect(within(table).getAllByRole('row')).toHaveLength(4); // header + 2 sites + total
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
    const cells = within(rows[1]).getAllByRole('cell').slice(1).map((c) => c.textContent);
    expect(cells).toEqual(['1,000,000', '1,000,000', '1,000,000']);
  });

  it('honours an explicit zero degradation rather than substituting a default', () => {
    seedPartialBundle({ degradation_pct: 0, sites: [{ owner: 'A', kwp: 100, year1_kwh: 500000 }] });
    renderDoc();
    const rows = within(screen.getByTestId('sites-forecast')).getAllByRole('row');
    const cells = within(rows[1]).getAllByRole('cell').slice(1).map((c) => c.textContent);
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
  it('ตารางที่ 2 groups equipment rows under their site', () => {
    seedBundleDetail();
    renderDoc();
    const table = screen.getByTestId('equipment-by-site');
    expect(screen.getByText(/ตารางที่ 2 รายการอุปกรณ์หลัก/)).toBeInTheDocument();
    // header + 2 rows for A + 1 for B + 1 orphan
    expect(within(table).getAllByRole('row')).toHaveLength(5);
    const groupCells = within(table).getAllByRole('cell').filter((c) => c.getAttribute('rowspan'));
    // ลำดับ + ชื่อโครงการ per group, three groups (A, B, ไม่ระบุพื้นที่)
    expect(groupCells.map((c) => c.textContent)).toEqual(['1', 'บริษัท A จำกัด', '2', 'บริษัท B จำกัด', '3', 'ไม่ระบุพื้นที่']);
    // Site A's ชื่อโครงการ cell spans both of its equipment rows.
    expect(groupCells[1].getAttribute('rowspan')).toBe('2');
    expect(within(table).getByText('TSM-NEG21C.20')).toBeInTheDocument();
    expect(within(table).getByText('JKM580N')).toBeInTheDocument();
  });

  it('keeps an equipment row whose site matches nothing under ไม่ระบุพื้นที่', () => {
    seedBundleDetail();
    renderDoc();
    const table = screen.getByTestId('equipment-by-site');
    const orphanRow = within(table).getByText('ไม่ระบุพื้นที่').closest('tr')!;
    expect(within(orphanRow).getByText('ตู้ควบคุมไฟฟ้า')).toBeInTheDocument();
    expect(within(orphanRow).getByText('Schneider')).toBeInTheDocument();
  });

  it('gives a site with no equipment rows a placeholder row rather than dropping it', () => {
    seedBundleDetail({ equipment_specs: [SITE_EQUIPMENT[0]] });
    renderDoc();
    const table = screen.getByTestId('equipment-by-site');
    const bRow = within(table).getByText('บริษัท B จำกัด').closest('tr')!;
    expect(within(bRow).getAllByText('-').length).toBeGreaterThan(0);
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
    // ที่ตั้งโครงการ numbers each site's address.
    expect(screen.getByText('1. สมุทรสาคร')).toBeInTheDocument();
    expect(screen.getByText('2. ชลบุรี')).toBeInTheDocument();
  });

  it('ตารางที่ 4 labels its name column เจ้าของโครงการ, matching the site owner it prints', () => {
    seedBundleDetail();
    renderDoc();
    const table = screen.getByTestId('maintenance-table');
    const header = within(table).getAllByRole('row')[0];
    expect(within(header).getAllByRole('columnheader').map((c) => c.textContent))
      .toEqual(['ลำดับ', 'เจ้าของโครงการ', 'ความถี่ (ครั้ง/ปี)']);
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
    seedMcruData({ support_equipment: [SUPPORT_EQUIPMENT[0]] });
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
