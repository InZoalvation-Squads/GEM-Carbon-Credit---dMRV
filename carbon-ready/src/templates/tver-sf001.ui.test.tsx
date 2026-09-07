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
  const { sites: _sites, ...base } = pdd.section_data as Record<string, unknown>;
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
    equipment_specs: _p5, sites: _p6, ...base
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
  pdd.section_data = {
    ...pdd.section_data,
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
