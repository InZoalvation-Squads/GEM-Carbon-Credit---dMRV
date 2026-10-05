import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { useStore } from '../store';
import { seedDemo } from '../test/demoFixtures';
import { InvestorPortfolioReport, InvestorProjectReport } from './InvestorReport';
import type { MonitoringRecord } from '../types';

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
