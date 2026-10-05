import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, within, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { useStore } from '../store';
import { api } from '../lib/api';
import { toast } from '../components/layout/Toast';
import { seedDemo } from '../test/demoFixtures';
import { RecRoi } from './RecRoi';
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
