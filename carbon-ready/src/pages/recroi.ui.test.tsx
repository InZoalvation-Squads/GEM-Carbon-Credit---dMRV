import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, within, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { useStore } from '../store';
import { api } from '../lib/api';
import { toast } from '../components/layout/Toast';
import { seedDemo } from '../test/demoFixtures';
import { RecRoi } from './RecRoi';
import { ProjectDetail } from './ProjectDetail';
import { Sidebar } from '../components/layout/Sidebar';
import type { MonitoringRecord } from '../types';

function daily(projectId: string, days: number, kwh: number): MonitoringRecord[] {
  const start = Date.parse('2026-01-01T00:00:00Z');
  return Array.from({ length: days }, (_, i) => ({
    id: `roi-${projectId}-${i}`, project_id: projectId,
    record_date: new Date(start + i * 86_400_000).toISOString().slice(0, 10),
    generation_kwh: kwh, source: 'csv', uploaded_at: '2026-01-01T00:00:00Z',
  }));
}

beforeEach(() => {
  localStorage.clear();
  seedDemo();
  useStore.setState((s) => ({
    currentUser: { ...s.currentUser, role: 'esg_manager' },
    // prj-0001 gets a deterministic 92-day history; other projects keep theirs.
    records: [...s.records.filter((r) => r.project_id !== 'prj-0001'), ...daily('prj-0001', 92, 100)],
  }));
});

const renderPage = () => render(
  <MemoryRouter initialEntries={['/rec-roi']}>
    <Routes><Route path="/rec-roi" element={<RecRoi />} /></Routes>
  </MemoryRouter>,
);

const puneRow = () => screen.getByRole('row', { name: /Pune Rooftop Phase 1/ });

describe('/rec-roi portfolio page', () => {
  it('explains there is no reference price and leaves ROI blank until prices are entered', () => {
    renderPage();
    expect(screen.getByText(/ไม่มีราคากลาง REC/)).toBeInTheDocument();
    expect(within(puneRow()).getByText(/36\.5/)).toBeInTheDocument();
    expect(within(puneRow()).getAllByText('—').length).toBeGreaterThan(0);
  });

  it('shows break-even per path once fee and FX exist, ROI once a mid price exists', () => {
    useStore.setState((s) => ({ recRoiSettings: { ...s.recRoiSettings, platform_fee_pct: 10, eur_thb: 40 } }));
    const { unmount } = renderPage();
    expect(within(puneRow()).getByText('24.19')).toBeInTheDocument();
    expect(within(puneRow()).getByText('2,323.14')).toBeInTheDocument();
    unmount();

    useStore.setState((s) => ({
      recRoiSettings: { ...s.recRoiSettings, price_mid_thb: 25, price_source: 'quote' },
    }));
    renderPage();
    expect(within(puneRow()).getByText('+3.0%')).toBeInTheDocument();
    expect(within(puneRow()).getByText(/ผ่านแพลตฟอร์ม/)).toBeInTheDocument();
  });

  it('does not endorse a path whose mid-price net is negative', () => {
    useStore.setState((s) => ({
      recRoiSettings: { ...s.recRoiSettings, platform_fee_pct: 10, eur_thb: 40, price_mid_thb: 1, price_source: 'quote' },
    }));
    renderPage();
    expect(within(puneRow()).getByText('ไม่คุ้มทั้งสองทาง')).toBeInTheDocument();
    expect(within(puneRow()).queryByText('ผ่านแพลตฟอร์ม')).toBeNull();
    expect(within(puneRow()).queryByText('บัญชีเอง')).toBeNull();
  });

  it('shows a gray "lower break-even" badge when there is no price yet', () => {
    useStore.setState((s) => ({ recRoiSettings: { ...s.recRoiSettings, platform_fee_pct: 10, eur_thb: 40 } }));
    renderPage();
    expect(within(puneRow()).getByText('ผ่านแพลตฟอร์ม · คุ้มทุนต่ำกว่า')).toBeInTheDocument();
  });

  it('single computable path with a losing mid price never says "neither pays"', () => {
    useStore.setState((s) => ({
      recRoiSettings: { ...s.recRoiSettings, platform_fee_pct: 10, price_mid_thb: 1, price_source: 'quote' },
    }));
    renderPage();
    expect(within(puneRow()).getByText('ไม่คุ้ม (ผ่านแพลตฟอร์ม)')).toBeInTheDocument();
    expect(within(puneRow()).queryByText('ไม่คุ้มทั้งสองทาง')).toBeNull();
  });

  it('a project without kWh data links to Upload', () => {
    useStore.setState((s) => ({ records: s.records.filter((r) => r.project_id !== 'prj-0001') }));
    renderPage();
    expect(within(puneRow()).getByText(/ไม่มีข้อมูล kWh/)).toBeInTheDocument();
    expect(within(puneRow()).getByRole('link', { name: 'อัปโหลดข้อมูลการผลิต' })).toHaveAttribute('href', '/upload');
  });

  it('marks partial data and leaves out non-electricity projects', () => {
    renderPage();
    expect(within(puneRow()).getByText(/ข้อมูล 92 วัน/)).toBeInTheDocument();
    expect(screen.queryByRole('row', { name: /Nan Watershed Reforestation/ })).toBeNull();
  });

  it('verifier sees only a no-access message — no prices, no assumptions, no table', () => {
    useStore.setState((s) => ({
      currentUser: { ...s.currentUser, role: 'verifier' },
      recRoiSettings: { ...s.recRoiSettings, platform_fee_pct: 10, eur_thb: 40, price_mid_thb: 25, price_source: 'quote' },
    }));
    renderPage();
    expect(screen.getByText(/ผู้ตรวจสอบไม่มีสิทธิ์ดูข้อมูลราคา REC/)).toBeInTheDocument();
    expect(screen.queryByRole('row', { name: /Pune Rooftop Phase 1/ })).toBeNull();
    expect(screen.queryByLabelText(/ราคากลาง/)).toBeNull();
    expect(screen.queryByRole('button', { name: /บันทึกสมมติฐาน/ })).toBeNull();
    expect(screen.queryByDisplayValue('25')).toBeNull();
  });

  it('saves assumptions from the form (demo mode)', async () => {
    renderPage();
    fireEvent.change(screen.getByLabelText(/ราคากลาง/), { target: { value: '25' } });
    fireEvent.change(screen.getByLabelText(/ที่มาของราคา/), { target: { value: 'ใบเสนอซื้อ 2026-09' } });
    fireEvent.change(screen.getByLabelText(/ค่าบริการแพลตฟอร์ม/), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: /บันทึกสมมติฐาน/ }));
    await waitFor(() => expect(useStore.getState().recRoiSettings.price_mid_thb).toBe(25));
    expect(useStore.getState().recRoiSettings.platform_fee_pct).toBe(10);
  });

  it('sends exactly the 8 settings fields (no stored updated_by/updated_at)', async () => {
    useStore.setState((s) => ({ recRoiSettings: { ...s.recRoiSettings, updated_by: 'someone', updated_at: '2026-01-01T00:00:00Z' } }));
    const spy = vi.spyOn(api, 'saveRecRoiSettings').mockResolvedValue(true);
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /บันทึกสมมติฐาน/ }));
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    expect(Object.keys(spy.mock.calls[0][0]).sort()).toEqual([
      'eur_thb', 'eur_thb_source', 'horizon_years', 'platform_fee_pct',
      'price_high_thb', 'price_low_thb', 'price_mid_thb', 'price_source',
    ]);
    spy.mockRestore();
  });

  it('FX source follows the input: BOT button sets BOT, editing afterwards makes it manual', async () => {
    const bot = vi.spyOn(api, 'fetchEurThb').mockResolvedValue({ available: true, rate: 38.1, period: '2026-10-03', source: 'BOT 2026-10-03' });
    const save = vi.spyOn(api, 'saveRecRoiSettings').mockResolvedValue(true);
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /ใช้อัตรา BOT/ }));
    expect(screen.getByText(/ที่มา FX: BOT 2026-10-03/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /บันทึกสมมติฐาน/ }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0][0]).toMatchObject({ eur_thb: 38.1, eur_thb_source: 'BOT 2026-10-03' });

    fireEvent.change(screen.getByLabelText(/อัตรา EUR→THB/), { target: { value: '39' } });
    fireEvent.click(screen.getByRole('button', { name: /บันทึกสมมติฐาน/ }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(save.mock.calls[1][0]).toMatchObject({ eur_thb: 39, eur_thb_source: 'กรอกเอง' });

    fireEvent.change(screen.getByLabelText(/อัตรา EUR→THB/), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /บันทึกสมมติฐาน/ }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(3));
    expect(save.mock.calls[2][0]).toMatchObject({ eur_thb: null, eur_thb_source: '' });
    bot.mockRestore(); save.mockRestore();
  });

  it('keeps what the user is typing when the settings object is replaced without a new save', () => {
    renderPage();
    fireEvent.change(screen.getByLabelText(/ราคากลาง/), { target: { value: '25' } });
    act(() => { useStore.setState((s) => ({ recRoiSettings: { ...s.recRoiSettings } })); });
    expect(screen.getByLabelText(/ราคากลาง/)).toHaveValue(25);
  });

  it('refuses to save an unparseable number (not silently null)', async () => {
    const save = vi.spyOn(api, 'saveRecRoiSettings').mockResolvedValue(true);
    const err = vi.spyOn(toast, 'error');
    renderPage();
    const input = screen.getByLabelText(/ราคากลาง/) as HTMLInputElement;
    Object.defineProperty(input, 'validity', { configurable: true, value: { badInput: true } });
    fireEvent.change(input, { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: /บันทึกสมมติฐาน/ }));
    expect(save).not.toHaveBeenCalled();
    expect(screen.getByText(/ตัวเลขไม่ถูกต้อง/)).toBeInTheDocument();
    expect(err).toHaveBeenCalledWith('บันทึกไม่ได้', expect.stringContaining('ตัวเลขไม่ถูกต้องในช่อง'));
    save.mockRestore(); err.mockRestore();
  });

  it('project_owner sees the assumptions read-only', () => {
    useStore.setState((s) => ({ currentUser: { ...s.currentUser, role: 'project_owner' } }));
    renderPage();
    expect(screen.queryByRole('button', { name: /บันทึกสมมติฐาน/ })).toBeNull();
    expect(screen.getByLabelText(/ราคากลาง/)).toBeDisabled();
  });

  it('tells a read-only viewer who can edit the assumptions', () => {
    useStore.setState((s) => ({ currentUser: { ...s.currentUser, role: 'project_owner' } }));
    renderPage();
    expect(screen.getByRole('note')).toHaveTextContent(/แก้ไขได้เฉพาะผู้ดูแลระบบ \(Admin\) หรือ ESG Manager/);
  });

  it('shows no permission note to an editor', () => {
    renderPage(); // esg_manager
    expect(screen.queryByRole('note')).toBeNull();
  });
});

describe('Sidebar — REC ROI visibility', () => {
  const renderSidebar = () => render(<MemoryRouter><Sidebar open onClose={() => {}} /></MemoryRouter>);
  it('is shown to esg_manager', () => {
    renderSidebar();
    expect(screen.getByRole('link', { name: /REC ROI/ })).toBeInTheDocument();
  });
  it('is hidden from verifier', () => {
    useStore.setState((s) => ({ currentUser: { ...s.currentUser, role: 'verifier' } }));
    renderSidebar();
    expect(screen.queryByRole('link', { name: /REC ROI/ })).toBeNull();
  });
});

const renderProject = (id: string, query = '') => render(
  <MemoryRouter initialEntries={[`/projects/${id}${query}`]}>
    <Routes><Route path="/projects/:id" element={<ProjectDetail />} /></Routes>
  </MemoryRouter>,
);

const blankInvestment = () => useStore.setState((s) => ({
  pdds: s.pdds.map((p) => (p.project_id === 'prj-0001'
    ? { ...p, section_data: { ...p.section_data, investment_mthb: '' } } : p)),
}));

describe('ProjectDetail — REC ROI tab', () => {
  beforeEach(() => {
    useStore.setState((s) => ({
      recRoiSettings: { ...s.recRoiSettings, platform_fee_pct: 10, eur_thb: 40, price_mid_thb: 25, price_source: 'quote' },
    }));
  });

  it('leads with a plain-language summary of the verdict', () => {
    renderProject('prj-0001', '?tab=rec-roi');
    const summary = screen.getByRole('region', { name: 'สรุป' });
    expect(within(summary).getByText('คุ้ม')).toBeInTheDocument();
    expect(within(summary).getByText(/^ขาย REC ผ่านแพลตฟอร์มที่ราคา 25\.00 ฿\/MWh ได้กำไรสุทธิ/)).toBeInTheDocument();
    expect(within(summary).getByText(/= 37 REC\/ปี \(จากข้อมูลวัดจริง 92 วัน ประมาณเป็นรายปี\)/)).toBeInTheDocument();
  });

  it('summary shows money with vs without REC', () => {
    renderProject('prj-0001', '?tab=rec-roi');
    const table = within(screen.getByRole('region', { name: 'สรุป' })).getByRole('table');
    // 36.5 MWh × 1,000 × 4.18 ฿/kWh = ฿152,570/yr; net REC ฿132.875 over 5 yr (platform, ฿25).
    const perYear = within(table).getByRole('row', { name: /ต่อปี/ });
    expect(within(perYear).getByText('฿152,570')).toBeInTheDocument();
    expect(within(perYear).getByText('฿152,597')).toBeInTheDocument();
    expect(within(perYear).getByText('+฿27')).toBeInTheDocument();
    const total = within(table).getByRole('row', { name: /รวม 5 ปี/ });
    expect(within(total).getByText('฿762,850')).toBeInTheDocument();
    expect(within(total).getByText('฿762,983')).toBeInTheDocument();
    expect(within(total).getByText('+฿133')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'สรุป' })).getByText(/ค่าไฟ 4\.18 ฿\/kWh\s*\(ค่าเริ่มต้น PEA\)/)).toBeInTheDocument();
  });

  it('money table waits for a REC price on the with-REC side', () => {
    useStore.setState((s) => ({ recRoiSettings: { ...s.recRoiSettings, price_mid_thb: null, price_source: '' } }));
    renderProject('prj-0001', '?tab=rec-roi');
    const table = within(screen.getByRole('region', { name: 'สรุป' })).getByRole('table');
    const perYear = within(table).getByRole('row', { name: /ต่อปี/ });
    expect(within(perYear).getByText('฿152,570')).toBeInTheDocument();
    expect(within(perYear).getAllByText('รอราคา REC').length).toBe(2);
  });

  it('summary waits for a price when none is entered', () => {
    useStore.setState((s) => ({ recRoiSettings: { ...s.recRoiSettings, price_mid_thb: null, price_source: '' } }));
    renderProject('prj-0001', '?tab=rec-roi');
    const summary = screen.getByRole('region', { name: 'สรุป' });
    expect(within(summary).getByText('รอราคา')).toBeInTheDocument();
    expect(within(summary).getByText(/^ยังไม่มีราคา REC — ต้องขายได้อย่างน้อย 24\.19 ฿\/MWh \(ผ่านแพลตฟอร์ม\)/)).toBeInTheDocument();
  });

  it('opens from ?tab=rec-roi and shows both paths side by side', () => {
    renderProject('prj-0001', '?tab=rec-roi');
    expect(screen.getByText('ก · เปิดบัญชี Evident เอง')).toBeInTheDocument();
    expect(screen.getByText('ข · ผ่านแพลตฟอร์ม')).toBeInTheDocument();
    expect(screen.getByText('24.19')).toBeInTheDocument();
    expect(screen.getByText(/ข้อมูล 92 วัน/)).toBeInTheDocument();
  });

  it('marks the recommended path "แนะนำ" only when it earns >= 0 at the mid price', () => {
    renderProject('prj-0001', '?tab=rec-roi');
    expect(screen.getByText('แนะนำ')).toBeInTheDocument();
  });

  it('never shows a green "แนะนำ" without a mid price (neutral lower-break-even badge instead)', () => {
    useStore.setState((s) => ({ recRoiSettings: { ...s.recRoiSettings, price_mid_thb: null, price_source: '' } }));
    renderProject('prj-0001', '?tab=rec-roi');
    expect(screen.queryByText('แนะนำ')).toBeNull();
    expect(screen.getByText('ผ่านแพลตฟอร์ม · คุ้มทุนต่ำกว่า')).toBeInTheDocument();
  });

  it('never shows "แนะนำ" when the mid price loses money', () => {
    useStore.setState((s) => ({ recRoiSettings: { ...s.recRoiSettings, price_mid_thb: 1 } }));
    renderProject('prj-0001', '?tab=rec-roi');
    expect(screen.queryByText('แนะนำ')).toBeNull();
    expect(screen.getByText('ไม่คุ้มทั้งสองทาง')).toBeInTheDocument();
  });

  it('IRR uplift asks for an investment figure when there is none', () => {
    blankInvestment();
    renderProject('prj-0001', '?tab=rec-roi');
    expect(screen.getByText(/ยังไม่มีข้อมูลเงินลงทุน/)).toBeInTheDocument();
  });

  it('IRR uplift explains a missing price and a path that cannot be computed', () => {
    blankInvestment();
    useStore.setState((s) => ({
      recRoiSettings: { ...s.recRoiSettings, price_mid_thb: null, price_source: '' },
      recRoiProjectSettings: [{
        project_id: 'prj-0001', issuance_type: 'Normal', digital_meter_exempt: false,
        investment_mthb: 1, updated_by: 'x', updated_at: '2026-01-01T00:00:00Z',
      }],
    }));
    const { unmount } = renderProject('prj-0001', '?tab=rec-roi');
    expect(screen.getAllByText(/ยังไม่กรอกราคา REC/).length).toBeGreaterThan(0);
    unmount();

    useStore.setState((s) => ({
      recRoiSettings: { ...s.recRoiSettings, price_mid_thb: 25, price_source: 'quote', platform_fee_pct: null, eur_thb: null },
    }));
    renderProject('prj-0001', '?tab=rec-roi');
    expect(screen.getByText(/ยังคำนวณ.*ไม่ได้/)).toBeInTheDocument();
  });

  it('saving a manual investment shows IRR without vs with REC', async () => {
    blankInvestment();
    renderProject('prj-0001', '?tab=rec-roi');
    fireEvent.change(screen.getByLabelText(/เงินลงทุน \(ล้านบาท\)/), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: /บันทึกค่าของโปรเจกต์/ }));
    await waitFor(() => expect(screen.getByText(/IRR ไม่มี REC/)).toBeInTheDocument());
    expect(screen.getByText(/IRR มี REC/)).toBeInTheDocument();
    expect(screen.getByText(/กรอกเอง/)).toBeInTheDocument();
  });

  it('refuses to save an unparseable investment (not silently null)', () => {
    blankInvestment();
    const save = vi.spyOn(api, 'saveRecRoiProjectSetting').mockResolvedValue(true);
    const err = vi.spyOn(toast, 'error');
    renderProject('prj-0001', '?tab=rec-roi');
    const input = screen.getByLabelText(/เงินลงทุน \(ล้านบาท\)/) as HTMLInputElement;
    Object.defineProperty(input, 'validity', { configurable: true, value: { badInput: true } });
    fireEvent.change(input, { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: /บันทึกค่าของโปรเจกต์/ }));
    expect(save).not.toHaveBeenCalled();
    expect(screen.getByText(/ตัวเลขไม่ถูกต้อง/)).toBeInTheDocument();
    expect(err).toHaveBeenCalledWith('บันทึกไม่ได้', expect.stringContaining('ตัวเลขไม่ถูกต้อง'));
    save.mockRestore(); err.mockRestore();
  });

  it('keeps a typed investment when the store re-evaluates without a new save', () => {
    blankInvestment();
    renderProject('prj-0001', '?tab=rec-roi');
    fireEvent.change(screen.getByLabelText(/เงินลงทุน \(ล้านบาท\)/), { target: { value: '3' } });
    act(() => { useStore.setState((s) => ({ records: [...s.records] })); });
    expect(screen.getByLabelText(/เงินลงทุน \(ล้านบาท\)/)).toHaveValue(3);
  });

  it('non-electricity projects say REC does not apply', () => {
    renderProject('prj-0006', '?tab=rec-roi'); // forestry
    expect(screen.getByText(/REC ใช้กับโปรเจกต์ผลิตไฟฟ้าเท่านั้น/)).toBeInTheDocument();
  });

  it('without kWh data it links to Upload', () => {
    useStore.setState((s) => ({ records: s.records.filter((r) => r.project_id !== 'prj-0001') }));
    renderProject('prj-0001', '?tab=rec-roi');
    const msg = screen.getByText(/ยังไม่มีข้อมูลการผลิต/);
    expect(within(msg).getByRole('link', { name: 'Upload Data' })).toHaveAttribute('href', '/upload');
  });

  it('is reachable by clicking the tab', () => {
    renderProject('prj-0001');
    fireEvent.click(screen.getByRole('tab', { name: 'REC ROI' }));
    expect(screen.getByText('ข · ผ่านแพลตฟอร์ม')).toBeInTheDocument();
  });

  it('drops a verifier off the REC ROI tab when the role switches while it is open', () => {
    renderProject('prj-0001', '?tab=rec-roi');
    expect(screen.getByText('ข · ผ่านแพลตฟอร์ม')).toBeInTheDocument();
    act(() => { useStore.setState((s) => ({ currentUser: { ...s.currentUser, role: 'verifier' } })); });
    expect(screen.queryByText('ข · ผ่านแพลตฟอร์ม')).toBeNull();
    expect(screen.queryByRole('tab', { name: 'REC ROI' })).toBeNull();
    expect(screen.getByRole('tab', { name: 'Monitoring' })).toHaveAttribute('aria-selected', 'true');
  });

  it('uplift footnote says where each financial value came from', () => {
    blankInvestment();
    useStore.setState((s) => ({
      recRoiProjectSettings: [{
        project_id: 'prj-0001', issuance_type: 'Normal', digital_meter_exempt: false,
        investment_mthb: 1, updated_by: 'x', updated_at: '2026-01-01T00:00:00Z',
      }],
      pdds: s.pdds.map((p) => (p.project_id === 'prj-0001'
        ? { ...p, section_data: { ...p.section_data, investment_mthb: '', discount_rate_pct: 9 } } : p)),
    }));
    renderProject('prj-0001', '?tab=rec-roi');
    // The uplift footnote (the money table's note also names the tariff, so match the footnote's run).
    expect(screen.getByText(/ค่าไฟ 4\.18 ฿\/kWh \(ค่าเริ่มต้น PEA\) · อัตราคิดลด/)).toBeInTheDocument();
    expect(screen.getByText(/อัตราคิดลด 9% \(จาก PDD\)/)).toBeInTheDocument();
    expect(screen.getByText(/อายุโครงการ 25 ปี \(ค่าเริ่มต้น PEA\)/)).toBeInTheDocument();
  });

  it('labels the fixed cost as including the registration fee', () => {
    renderProject('prj-0001', '?tab=rec-roi');
    expect(screen.getAllByText('ต้นทุนคงที่ทั้งระยะ (รวมค่าขึ้นทะเบียน)').length).toBe(2);
  });

  it('digital-meter exemption: absent at >= 250 kWp, present below', () => {
    const { unmount } = renderProject('prj-0001', '?tab=rec-roi'); // exactly 250 kWp
    expect(screen.queryByLabelText(/EGAT อนุมัติ digital meter/)).toBeNull();
    unmount();
    useStore.setState((s) => ({ projects: s.projects.map((p) => (p.id === 'prj-0001' ? { ...p, capacity_kwp: 100 } : p)) }));
    renderProject('prj-0001', '?tab=rec-roi');
    expect(screen.getByLabelText(/EGAT อนุมัติ digital meter/)).toBeInTheDocument();
  });

  it('project_owner can edit and save the project settings', () => {
    useStore.setState((s) => ({ currentUser: { ...s.currentUser, role: 'project_owner' } }));
    renderProject('prj-0001', '?tab=rec-roi');
    expect(screen.getByLabelText(/เงินลงทุน \(ล้านบาท\)/)).toBeEnabled();
    expect(screen.getByRole('button', { name: /บันทึกค่าของโปรเจกต์/ })).toBeInTheDocument();
  });

  it('project_owner is told to ask an admin/ESG manager for missing org assumptions; others see the plain hint', () => {
    useStore.setState((s) => ({ recRoiSettings: { ...s.recRoiSettings, platform_fee_pct: null }, currentUser: { ...s.currentUser, role: 'project_owner' } }));
    const { unmount } = renderProject('prj-0001', '?tab=rec-roi');
    expect(screen.getByText(/ขอให้ผู้ดูแลระบบหรือ ESG manager กรอกที่หน้า/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'REC ROI' })).toHaveAttribute('href', '/rec-roi');
    unmount();
    useStore.setState((s) => ({ currentUser: { ...s.currentUser, role: 'esg_manager' } }));
    renderProject('prj-0001', '?tab=rec-roi');
    expect(screen.queryByText(/ขอให้ผู้ดูแลระบบ/)).toBeNull();
    expect(screen.getByText(/— กรอกที่/)).toBeInTheDocument();
  });

  it('disables the save button while a save is in flight', async () => {
    let resolve: (v: boolean) => void = () => {};
    const save = vi.spyOn(api, 'saveRecRoiProjectSetting').mockImplementation(() => new Promise((r) => { resolve = r; }));
    renderProject('prj-0001', '?tab=rec-roi');
    const btn = screen.getByRole('button', { name: /บันทึกค่าของโปรเจกต์/ });
    fireEvent.click(btn);
    await waitFor(() => expect(btn).toBeDisabled());
    fireEvent.click(btn);
    expect(save).toHaveBeenCalledTimes(1);
    await act(async () => { resolve(true); });
    await waitFor(() => expect(btn).toBeEnabled());
    save.mockRestore();
  });

  it('is hidden from verifiers, even via ?tab=rec-roi', () => {
    useStore.setState((s) => ({ currentUser: { ...s.currentUser, role: 'verifier' } }));
    renderProject('prj-0001', '?tab=rec-roi');
    expect(screen.queryByRole('tab', { name: 'REC ROI' })).toBeNull();
    expect(screen.queryByText('ข · ผ่านแพลตฟอร์ม')).toBeNull();
  });
});
