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
      'เครื่องวัดไฟฟ้า (Energy Meter)', 'Smart Logger', 'PQM', 'Internet Router', 'Water Pump']) {
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

  /** The <table> immediately after the "สมการที่ใช้:" line whose text starts with `eq`. */
  function equationTable(eq: string): HTMLElement {
    const p = screen.getAllByText((_, el) => el?.tagName === 'P'
      && (el.textContent ?? '').startsWith(`สมการที่ใช้: ${eq}`))
      .filter((el) => el.tagName === 'P');
    expect(p, eq).toHaveLength(1);
    return p[0].nextElementSibling as HTMLElement;
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
    expect(within(weather).getByText('ตรวจสอบความสมบูรณ์ของเครื่องวัดความเข้มแสง (Pyranometer)')).toBeInTheDocument();
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

  it('compounds the degradation column: year 1 is 0.00 and 0.5%/yr reaches 1.00 by year 3', () => {
    seedMcruData({ degradation_pct: 0.5, crediting_years: '7' });
    renderDoc();
    const rows = within(screen.getByTestId('forecast-table')).getAllByRole('row');
    const pct = (i: number) => within(rows[i]).getAllByRole('cell')[2].textContent;
    expect(pct(1)).toBe('0.00%');                      // year 1 — the reference year
    expect(pct(2)).toBe('0.50%');                      // 1-(0.995)^1
    expect(pct(3)).toBe('1.00%');                      // 1-(0.995)^2 = 0.9975% → 1.00
    expect(pct(7)).toBe('2.96%');                      // 1-(0.995)^6
    // รวม shows the final year's cumulative loss, not 7 × 0.5%.
    expect(within(rows[8]).getAllByRole('cell')[2].textContent).toBe('2.96%');
    expect(within(rows[9]).getAllByRole('cell')[2].textContent).toBe('0.50%'); // เฉลี่ยต่อปี = the annual rate
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
    expect(cells[1].textContent).toBe('250.000');
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
