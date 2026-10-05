import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { useStore } from '../store';
import { seedDemo } from '../test/demoFixtures';
import { InvestorPortfolioReport, InvestorProjectReport } from './InvestorReport';
import type { MonitoringRecord, Project } from '../types';
import { localIsoDate } from '../lib/format';

function daily(projectId: string, days: number, kwh: number): MonitoringRecord[] {
  const start = Date.parse('2026-01-01T00:00:00Z');
  return Array.from({ length: days }, (_, i) => ({
    id: `rep-${projectId}-${i}`, project_id: projectId,
    record_date: new Date(start + i * 86_400_000).toISOString().slice(0, 10),
    generation_kwh: kwh, source: 'csv', uploaded_at: '2026-01-01T00:00:00Z',
  }));
}

beforeEach(() => {
  localStorage.clear();
  seedDemo();
  // prj-0001 becomes a Thai site with 92 days of 2026 data so the TGO factor applies.
  useStore.setState((s) => ({
    currentUser: { ...s.currentUser, role: 'esg_manager' },
    projects: s.projects.map((p) => (p.id === 'prj-0001' ? { ...p, location: 'Bangkok, Thailand' } : p)),
    records: [...s.records.filter((r) => r.project_id !== 'prj-0001'), ...daily('prj-0001', 92, 100)],
    recRoiSettings: { ...s.recRoiSettings, price_mid_thb: 25, price_source: 'quote', platform_fee_pct: 10, eur_thb: 40 },
  }));
});

const renderAt = (path: string) => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route path="/reports/investor" element={<InvestorPortfolioReport />} />
      <Route path="/reports/investor/:projectId" element={<InvestorProjectReport />} />
    </Routes>
  </MemoryRouter>,
);
const pages = (c: HTMLElement) => c.querySelectorAll('.inv-page');

describe('single-project investor report', () => {
  it('two A4 pages: REC money, then Scope 2', () => {
    const { container } = renderAt('/reports/investor/prj-0001');
    expect(pages(container)).toHaveLength(2);
    const [money, scope2] = [...pages(container)] as HTMLElement[];
    expect(within(money).getByText(/^ขาย REC ผ่านแพลตฟอร์มที่ราคา 25\.00 ฿\/MWh/)).toBeInTheDocument();
    expect(within(money).getByText('ไม่มี REC')).toBeInTheDocument();
    // 36.5 MWh/yr × 0.475 = 17.34 tCO2e/yr
    expect(within(scope2).getByText('17.34')).toBeInTheDocument();
    expect(within(scope2).getByText(/TGO 0\.475 kgCO₂e\/kWh/)).toBeInTheDocument();
    expect(within(scope2).getByText(/ออก T-VER/)).toBeInTheDocument();
    expect(within(scope2).getByText(/ออก REC แล้วขาย/)).toBeInTheDocument();
    expect(within(scope2).getByText(/ออก REC แล้วเก็บไว้ redeem/)).toBeInTheDocument();
    expect(within(scope2).getByText(/has not and will not be submitted for any other energy attribute tracking methodology/)).toBeInTheDocument();
  });

  it('the Scope 2 page also says the annual figures are estimated from partial data', () => {
    const { container } = renderAt('/reports/investor/prj-0001');
    const scope2 = pages(container)[1] as HTMLElement;
    expect(within(scope2).getByText(/ข้อมูล 92 วัน ประมาณเป็นรายปี/)).toBeInTheDocument();
  });

  it('names no person as preparer', () => {
    renderAt('/reports/investor/prj-0001');
    // The provenance footer is printed on each of the 2 pages.
    expect(screen.getAllByText(/จัดทำจากข้อมูลวัดจริงในระบบ ณ วันที่/)).toHaveLength(2);
    expect(screen.queryByText(new RegExp(useStore.getState().currentUser.name))).toBeNull();
  });

  it('without a REC price the hero shows the break-even price', () => {
    useStore.setState((s) => ({ recRoiSettings: { ...s.recRoiSettings, price_mid_thb: null, price_source: '' } }));
    const { container } = renderAt('/reports/investor/prj-0001');
    const money = pages(container)[0] as HTMLElement;
    // 250 kWp, 36.5 MWh/yr, fee 10% → platform break-even 24.19 ฿/MWh: hero + KPI strip.
    expect(within(money).getAllByText('24.19').length).toBeGreaterThanOrEqual(2);
    expect(within(money).getAllByText('รอราคา REC').length).toBeGreaterThan(0);
  });

  it('a project outside Thailand shows no Scope 2 number', () => {
    useStore.setState((s) => ({ projects: s.projects.map((p) => (p.id === 'prj-0001' ? { ...p, location: 'Pune, India' } : p)) }));
    const { container } = renderAt('/reports/investor/prj-0001');
    expect(within(pages(container)[1] as HTMLElement).getByText(/ไม่มีค่า EF Scope 2 สำหรับช่วงข้อมูลนี้/)).toBeInTheDocument();
  });

  it('non-electricity project explains REC does not apply', () => {
    const { container } = renderAt('/reports/investor/prj-0006'); // forestry
    expect(pages(container)).toHaveLength(0);
    expect(screen.getByText(/REC ใช้กับโปรเจกต์ผลิตไฟฟ้าเท่านั้น/)).toBeInTheDocument();
  });

  it('verifier gets no access', () => {
    useStore.setState((s) => ({ currentUser: { ...s.currentUser, role: 'verifier' } }));
    const { container } = renderAt('/reports/investor/prj-0001');
    expect(pages(container)).toHaveLength(0);
    expect(screen.getByText(/ผู้ตรวจสอบไม่มีสิทธิ์ดูข้อมูลราคา REC/)).toBeInTheDocument();
  });
});

describe('portfolio investor report', () => {
  it('overview page + two pages per reported project', () => {
    const { container } = renderAt('/reports/investor');
    const all = pages(container);
    expect(all[0]).toHaveTextContent('ภาพรวมพอร์ต');
    expect((all.length - 1) % 2).toBe(0);
    expect(all.length).toBeGreaterThanOrEqual(3);
    expect(all[0]).toHaveTextContent(/Pune Rooftop Phase 1/);
  });
});

describe('honest copy, structure and states', () => {
  it('Scope 2 page does not overstate what a retained REC or a T-VER gives', () => {
    const { container } = renderAt('/reports/investor/prj-0001');
    const scope2 = pages(container)[1] as HTMLElement;
    expect(within(scope2).getByText('ไม่มี REC จึง claim ไฟสะอาดแบบ market-based ไม่ได้')).toBeInTheDocument();
    expect(within(scope2).getByText(/claim ไฟสะอาดได้สูงสุด [\d.,]+ MWh\/ปี เมื่อผู้ใช้ไฟ redeem และเข้าเกณฑ์ market-based \/ RE100 ของผู้ใช้/)).toBeInTheDocument();
    expect(within(scope2).getByText('REC ที่ redeem นำไปนับในเป้า RE100 ได้ตามเกณฑ์ของ RE100')).toBeInTheDocument();
    expect(within(scope2).getByText(/ยังไม่พบค่า residual mix ที่เผยแพร่อย่างเป็นทางการสำหรับไทย/)).toBeInTheDocument();
    expect(within(scope2).getByText(/https:\/\/greencalculus\.com\/glossary\/residual-mix\//)).toBeInTheDocument();
    expect(within(scope2).getAllByText(/TGO \(ข่าว Nation Thailand 2025-11-30\)/).length).toBeGreaterThanOrEqual(1);
  });

  it('the T-VER cell says it is year 1 of the crediting period', () => {
    const { container } = renderAt('/reports/investor/prj-0001');
    expect(within(pages(container)[1] as HTMLElement).getByText(/ปีแรกของช่วงคิดเครดิต/)).toBeInTheDocument();
  });

  it('the REC-sold row names the path it is computed on', () => {
    const { container } = renderAt('/reports/investor/prj-0001');
    expect(within(pages(container)[1] as HTMLElement).getByText(/ใน 5 ปี · ผ่านแพลตฟอร์ม$/)).toBeInTheDocument();
  });

  it('shows no unit after a dash when there is no break-even', () => {
    useStore.setState((s) => ({ recRoiSettings: { ...s.recRoiSettings, platform_fee_pct: null, eur_thb: null } }));
    const { container } = renderAt('/reports/investor/prj-0001');
    const money = pages(container)[0] as HTMLElement;
    expect(within(money).queryByText('฿/MWh')).toBeNull();
    expect(within(money).queryByText('฿/MWh ราคาคุ้มทุน')).toBeNull();
  });

  it('one h1 per document, other page titles are h2; tables have header scopes', () => {
    const { container } = renderAt('/reports/investor/prj-0001');
    expect(container.querySelectorAll('h1')).toHaveLength(1);
    expect(container.querySelectorAll('.inv-page h2.inv-title')).toHaveLength(1);
    expect(container.querySelectorAll('th:not([scope])')).toHaveLength(0);
    expect(container.querySelectorAll('th[scope="row"]').length).toBeGreaterThan(0);
  });

  it('the portfolio document also has exactly one h1', () => {
    const { container } = renderAt('/reports/investor');
    expect(container.querySelectorAll('h1')).toHaveLength(1);
    expect(pages(container)[0].querySelector('h1')).not.toBeNull();
  });

  it('each chart is a labelled image', () => {
    const { container } = renderAt('/reports/investor/prj-0001');
    const img = container.querySelector('[role="img"]');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('aria-label')).toMatch(/ผลิตไฟรายเดือน 2026-01 ถึง 2026-04, สูงสุด [\d,]+ kWh/);
  });

  it('unknown project id says so', () => {
    const { container } = renderAt('/reports/investor/prj-nope');
    expect(pages(container)).toHaveLength(0);
    expect(screen.getByText('ไม่พบโครงการนี้')).toBeInTheDocument();
  });

  it('verifier gets no access to the portfolio report either', () => {
    useStore.setState((s) => ({ currentUser: { ...s.currentUser, role: 'verifier' } }));
    const { container } = renderAt('/reports/investor');
    expect(pages(container)).toHaveLength(0);
    expect(screen.getByText(/ผู้ตรวจสอบไม่มีสิทธิ์ดูข้อมูลราคา REC/)).toBeInTheDocument();
  });

  it('a portfolio with nothing reportable says so on a single overview page', () => {
    useStore.setState({ projects: [], records: [] });
    const { container } = renderAt('/reports/investor');
    expect(pages(container)).toHaveLength(1);
    expect(screen.getByText('ยังไม่มีโครงการที่มีข้อมูลการผลิต')).toBeInTheDocument();
  });

  it('overview: Scope 2 coverage says how many projects have a factor', () => {
    useStore.setState((s) => {
      const base = s.projects.find((p) => p.id === 'prj-0001') as Project;
      const list = ['a', 'b', 'c'].map((k): Project => ({
        ...base, id: `cov-${k}`, name: `Cov ${k}`, location: k === 'a' ? 'Pune, India' : base.location,
      }));
      return {
        projects: list, records: list.flatMap((p) => daily(p.id, 92, 100)),
        pdds: s.pdds.flatMap((d) => (d.project_id === 'prj-0001' ? list.map((p) => ({ ...d, id: `${d.id}-${p.id}`, project_id: p.id })) : [])),
      };
    });
    const { container } = renderAt('/reports/investor');
    expect(within(pages(container)[0] as HTMLElement).getByText('2 จาก 3 โครงการ')).toBeInTheDocument();
  });

  it('the overview chart caption says it is the platform path', () => {
    const { container } = renderAt('/reports/investor');
    expect(pages(container)[0]).toHaveTextContent(/เส้นทาง ข \(ผ่านแพลตฟอร์ม\)/);
  });
});

describe('portfolio overview header and partial-year note', () => {
  it('names the organisation and the data window', () => {
    const { container } = renderAt('/reports/investor');
    const overview = pages(container)[0] as HTMLElement;
    expect(overview).toHaveTextContent(useStore.getState().organization.name);
    expect(overview).toHaveTextContent(/ข้อมูล \d{4}-\d{2}-\d{2} – \d{4}-\d{2}-\d{2}/);
  });

  it('flags how many projects use less than a full year of data', () => {
    const { container } = renderAt('/reports/investor');
    expect(within(pages(container)[0] as HTMLElement)
      .getByText(/^\d+ จาก \d+ โครงการใช้ข้อมูลไม่ครบปี — ตัวเลขรายปีประมาณจากข้อมูลที่มี$/)).toBeInTheDocument();
  });

  it('the plain demo portfolio overview stays on one page', () => {
    const { container } = renderAt('/reports/investor');
    const all = [...pages(container)];
    const firstProject = all.findIndex((p) => p.querySelector('.inv-title')?.textContent?.startsWith('การเงิน REC'));
    expect(firstProject).toBe(1);
  });
});

describe('portfolio overview pagination', () => {
  /** Replace the portfolio with n Thai solar clones of prj-0001 (92 days of data each). */
  function clones(n: number) {
    useStore.setState((s) => {
      const base = s.projects.find((p) => p.id === 'prj-0001') as Project;
      const list = Array.from({ length: n }, (_, i): Project => ({
        ...base, id: `clone-${String(i).padStart(2, '0')}`, name: `Clone Solar ${String(i).padStart(2, '0')}`,
      }));
      return {
        projects: list,
        records: list.flatMap((p) => daily(p.id, 92, 100)),
        pdds: s.pdds.flatMap((d) => (d.project_id === 'prj-0001'
          ? list.map((p) => ({ ...d, id: `${d.id}-${p.id}`, project_id: p.id })) : [])),
      };
    });
  }
  const overviewPages = (c: HTMLElement) => {
    const all = [...pages(c)] as HTMLElement[];
    const first = all.findIndex((p) => p.querySelector('.inv-title')?.textContent?.startsWith('การเงิน REC'));
    return all.slice(0, first);
  };
  const rankedNames = (ov: HTMLElement[]) =>
    ov.flatMap((p) => [...p.querySelectorAll('th[scope="row"]')].map((th) => th.textContent ?? '').filter((t) => t.startsWith('Clone Solar')));

  it('20 projects: 12 rows, a continuation, then the chart on its own page', () => {
    clones(20);
    const { container } = renderAt('/reports/investor');
    const ov = overviewPages(container);
    expect(ov).toHaveLength(3);
    expect(ov[0]).toHaveTextContent('ภาพรวมพอร์ต · รายงานนักลงทุน');
    expect(ov[1]).toHaveTextContent('ภาพรวมพอร์ต (ต่อ)');
    expect(ov[2]).toHaveTextContent('ภาพรวมพอร์ต (ต่อ)');
    const names = rankedNames(ov);
    expect(names).toHaveLength(20);
    expect(new Set(names).size).toBe(20);
    expect(ov[0].querySelectorAll('tbody tr')).toHaveLength(12);
    expect(ov[1].querySelectorAll('tbody tr')).toHaveLength(8);
    expect(pages(container)).toHaveLength(3 + 40);
  });

  it('40 projects: 12 + 18 + 10 rows over three table pages, then the chart page', () => {
    clones(40);
    const { container } = renderAt('/reports/investor');
    const ov = overviewPages(container);
    expect(ov).toHaveLength(4);
    expect(ov.slice(0, 3).map((p) => p.querySelectorAll('tbody tr').length)).toEqual([12, 18, 10]);
    expect(new Set(rankedNames(ov)).size).toBe(40);
  });

  it('8 projects: table and chart share the single overview page', () => {
    clones(8);
    const { container } = renderAt('/reports/investor');
    expect(overviewPages(container)).toHaveLength(1);
    expect(pages(container)).toHaveLength(1 + 16);
  });

  it('9 projects: the chart moves to its own page', () => {
    clones(9);
    const { container } = renderAt('/reports/investor');
    expect(overviewPages(container)).toHaveLength(2);
  });
});

describe('local report date', () => {
  it('formats the local calendar date, not the UTC one', () => {
    const iso = '2026-10-05T18:30:00.000Z';
    const d = new Date(iso);
    const local = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    expect(localIsoDate(iso)).toBe(local);
    // Asia/Bangkok (UTC+7): 18:30Z is already the next day.
    if (d.getTimezoneOffset() === -420) expect(localIsoDate(iso)).toBe('2026-10-06');
  });
  it('takes a Date too: 01:00 local on 6 Oct is 6 Oct in any time zone', () => {
    expect(localIsoDate(new Date(2026, 9, 6, 1, 0))).toBe('2026-10-06');
    expect(localIsoDate(new Date(2026, 0, 1, 23, 59))).toBe('2026-01-01');
  });
});
