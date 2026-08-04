import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { IotMapping } from './IotMapping';
import { useStore } from '../store';
import { seedDemo } from '../test/demoFixtures';

const { statusMock, devicesMock, mapMock, syncMock } = vi.hoisted(() => ({
  statusMock: vi.fn(),
  devicesMock: vi.fn(),
  mapMock: vi.fn(async () => {}),
  syncMock: vi.fn(),
}));

vi.mock('../lib/server-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/server-api')>();
  return {
    ...actual,
    serverMode: () => true,
    iotApi: {
      ...actual.iotApi,
      status: statusMock,
      devices: devicesMock,
      map: mapMock,
      sync: syncMock,
    },
  };
});

const DEVICE = {
  device_id: 'plant-uuid-1',
  name: 'Uthaithani Community College',
  capacity_kwp: 105,
  location: 'Uthai Thani',
  commission_date: '2026-06-01',
  days: 53,
  first_date: '2026-06-12',
  last_date: '2026-08-03',
  avg_value: 307.2,
  project_id: null as string | null,
  synced_days: null as number | null,
};

beforeEach(() => {
  seedDemo();
  statusMock.mockResolvedValue({
    enabled: true, table: 'daily_plant_efficiency', unit: 'kWh', value_kind: 'interval',
    lookback_hours: 96, timezone: 'Asia/Bangkok', deduction_pct: 7,
  });
  devicesMock.mockResolvedValue([{ ...DEVICE }]);
  syncMock.mockResolvedValue({ devices: 1, readings: 0, inserted: 0, skipped_existing: 0, skipped_partial_day: 0 });
});

describe('IotMapping page', () => {
  it('lists external plants with stats and a project picker when unmapped', async () => {
    render(<MemoryRouter><IotMapping /></MemoryRouter>);
    expect(await screen.findByText('Uthaithani Community College')).toBeInTheDocument();
    expect(screen.getByText(/2026-06-12 → 2026-08-03/)).toBeInTheDocument();
    expect(screen.getByText('53 วัน')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /สร้างโปรเจกต์ \+ Map/ })).toBeInTheDocument();
    // Map button disabled until a project is chosen
    expect(screen.getByRole('button', { name: 'Map' })).toBeDisabled();
  });

  it('maps a device to a chosen project via the api', async () => {
    render(<MemoryRouter><IotMapping /></MemoryRouter>);
    await screen.findByText('Uthaithani Community College');

    const project = useStore.getState().projects[0];
    fireEvent.change(screen.getByRole('combobox', { name: /เลือกโปรเจกต์สำหรับ/ }), {
      target: { value: project.id },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Map' }));
    await waitFor(() => expect(mapMock).toHaveBeenCalledWith('plant-uuid-1', project.id, 'Uthaithani Community College'));
    // mapping triggers an automatic full-history backfill
    await waitFor(() => expect(syncMock).toHaveBeenCalled());
  });

  it('shows the mapped project chip, coverage badge and an unmap action once mapped', async () => {
    const project = useStore.getState().projects[0];
    devicesMock.mockResolvedValue([{ ...DEVICE, project_id: project.id, synced_days: 53 }]);
    render(<MemoryRouter><IotMapping /></MemoryRouter>);
    expect(await screen.findByText(project.name)).toBeInTheDocument();
    expect(screen.getByText('ครบ 53/53 วัน')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ยกเลิก/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Map' })).not.toBeInTheDocument();
  });

  it('flags partial coverage so missing days are visible', async () => {
    const project = useStore.getState().projects[0];
    devicesMock.mockResolvedValue([{ ...DEVICE, project_id: project.id, synced_days: 32 }]);
    render(<MemoryRouter><IotMapping /></MemoryRouter>);
    expect(await screen.findByText('ในระบบ 32/53 วัน')).toBeInTheDocument();
  });

  it('runs a manual sync and reports the stats', async () => {
    syncMock.mockResolvedValue({ devices: 1, readings: 4, inserted: 3, skipped_existing: 1, skipped_partial_day: 0 });
    render(<MemoryRouter><IotMapping /></MemoryRouter>);
    await screen.findByText('Uthaithani Community College');
    fireEvent.click(screen.getByRole('button', { name: /Sync ตอนนี้/ }));
    await waitFor(() => expect(syncMock).toHaveBeenCalled());
    expect(await screen.findByText(/\+3 วัน/)).toBeInTheDocument();
  });

  it('lists plants without readings with a no-data badge instead of stats', async () => {
    devicesMock.mockResolvedValue([
      { ...DEVICE },
      { ...DEVICE, device_id: 'plant-empty', name: 'BKG Ayutthaya', days: 0, first_date: null, last_date: null, avg_value: 0 },
    ]);
    render(<MemoryRouter><IotMapping /></MemoryRouter>);
    expect(await screen.findByText('BKG Ayutthaya')).toBeInTheDocument();
    expect(screen.getByText('ไม่มีข้อมูลใน IoT DB')).toBeInTheDocument();
    expect(screen.getByText(/2 plant · มีข้อมูล 1/)).toBeInTheDocument();
  });

  it('explains setup when IoT is not configured', async () => {
    statusMock.mockResolvedValue({ enabled: false });
    render(<MemoryRouter><IotMapping /></MemoryRouter>);
    expect(await screen.findByText('ยังไม่ได้เชื่อมฐานข้อมูล IoT')).toBeInTheDocument();
  });
});
