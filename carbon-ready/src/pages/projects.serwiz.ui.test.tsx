import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Projects } from './Projects';
import { useStore } from '../store';
import { seedDemo } from '../test/demoFixtures';
import type { IotDevice } from '../lib/server-api';

const { statusMock, devicesMock, createProjectMock, syncMock } = vi.hoisted(() => ({
  statusMock: vi.fn(),
  devicesMock: vi.fn(),
  createProjectMock: vi.fn(),
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
      createProject: createProjectMock,
      sync: syncMock,
    },
  };
});

function plant(over: Partial<IotDevice>): IotDevice {
  return {
    device_id: 'plant-x', name: null, capacity_kwp: null, location: null, commission_date: null,
    days: 0, first_date: null, last_date: null, avg_value: 0, project_id: null, synced_days: null,
    ...over,
  };
}

const ACTIVE = plant({
  device_id: 'plant-active', name: 'Uthaithani Community College', capacity_kwp: 105,
  location: 'Uthai Thani', commission_date: '2026-06-01', days: 53,
  first_date: '2026-06-12', last_date: '2026-08-03', avg_value: 307.2,
});
const EMPTY = plant({ device_id: 'plant-empty', name: 'ตลาดธันยา 1', capacity_kwp: 30 });
const MAPPED = plant({ device_id: 'plant-mapped', name: 'Already mapped plant', days: 10, first_date: '2026-07-01', last_date: '2026-07-10', project_id: 'prj-1' });

const ENABLED = {
  enabled: true, table: 'daily_plant_efficiency', unit: 'kWh', value_kind: 'interval',
  lookback_hours: 96, timezone: 'Asia/Bangkok', deduction_pct: 7,
};

function renderProjects() {
  return render(<MemoryRouter><Projects /></MemoryRouter>);
}

function section() {
  return screen.getByRole('region', { name: /Plant จาก Serwiz/ });
}

beforeEach(() => {
  seedDemo();
  vi.clearAllMocks();
  useStore.setState({ refreshFromServer: vi.fn(async () => {}) } as never);
  statusMock.mockResolvedValue(ENABLED);
  devicesMock.mockResolvedValue([MAPPED, EMPTY, ACTIVE]);
  syncMock.mockResolvedValue({ devices: 1, readings: 53, inserted: 53, skipped_existing: 0, skipped_partial_day: 0 });
});

describe('Projects — Serwiz plants not yet in dMRV', () => {
  it('lists only unmapped plants, plants with data first, with a count in the heading', async () => {
    renderProjects();
    const heading = await screen.findByRole('heading', { name: /Plant จาก Serwiz ที่ยังไม่เป็น project \(2\)/ });
    expect(heading).toBeInTheDocument();
    const table = within(section()).getByRole('table');
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Uthaithani Community College');
    expect(rows[0]).toHaveTextContent('53 วัน');
    expect(rows[0]).toHaveTextContent('2026-08-03');
    expect(rows[1]).toHaveTextContent('ตลาดธันยา 1');
    expect(rows[1]).toHaveTextContent('ยังไม่มีข้อมูล');
    expect(within(section()).queryByText('Already mapped plant')).not.toBeInTheDocument();
  });

  it('renders nothing when IoT is not configured on the server', async () => {
    statusMock.mockResolvedValue({ enabled: false });
    renderProjects();
    await waitFor(() => expect(statusMock).toHaveBeenCalled());
    expect(devicesMock).not.toHaveBeenCalled();
    expect(screen.queryByRole('region', { name: /Plant จาก Serwiz/ })).not.toBeInTheDocument();
  });

  it('shows the first 10 plants and reveals the rest on demand', async () => {
    devicesMock.mockResolvedValue(
      Array.from({ length: 12 }, (_, i) => plant({ device_id: `p${i}`, name: `Plant ${String(i).padStart(2, '0')}` })),
    );
    renderProjects();
    await screen.findByRole('heading', { name: /\(12\)/ });
    const table = within(section()).getByRole('table');
    expect(within(table).getAllByRole('row').slice(1)).toHaveLength(10);
    fireEvent.click(within(section()).getByRole('button', { name: 'แสดงทั้งหมด (12)' }));
    expect(within(table).getAllByRole('row').slice(1)).toHaveLength(12);
  });

  it('filters plants with the page search box', async () => {
    renderProjects();
    await screen.findByRole('heading', { name: /\(2\)/ });
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'ธันยา' } });
    await waitFor(() => {
      const rows = within(within(section()).getByRole('table')).getAllByRole('row').slice(1);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toHaveTextContent('ตลาดธันยา 1');
    });
  });

  it('creates a project from a plant, backfills its history and refreshes the store', async () => {
    createProjectMock.mockResolvedValue({ id: 'prj-new', name: ACTIVE.name });
    renderProjects();
    await screen.findByRole('heading', { name: /\(2\)/ });
    const table = within(section()).getByRole('table');
    fireEvent.click(within(table).getByRole('button', { name: 'สร้าง project จาก Uthaithani Community College' }));
    await waitFor(() => expect(createProjectMock).toHaveBeenCalledWith({
      device_id: 'plant-active',
      name: 'Uthaithani Community College',
      capacity_kwp: 105,
      location: 'Uthai Thani',
      commission_date: '2026-06-01',
    }));
    await waitFor(() => expect(syncMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(useStore.getState().refreshFromServer).toHaveBeenCalled());
    // the plant list is reloaded so the new project's plant drops out
    await waitFor(() => expect(devicesMock).toHaveBeenCalledTimes(2));
  });

  it('skips the backfill for a plant with no readings yet', async () => {
    createProjectMock.mockResolvedValue({ id: 'prj-new', name: EMPTY.name });
    renderProjects();
    await screen.findByRole('heading', { name: /\(2\)/ });
    const table = within(section()).getByRole('table');
    fireEvent.click(within(table).getByRole('button', { name: 'สร้าง project จาก ตลาดธันยา 1' }));
    await waitFor(() => expect(createProjectMock).toHaveBeenCalled());
    await waitFor(() => expect(devicesMock).toHaveBeenCalledTimes(2));
    expect(syncMock).not.toHaveBeenCalled();
  });

  it('shows the load error and retries on demand', async () => {
    devicesMock.mockRejectedValueOnce(new Error('connect ETIMEDOUT 34.126.142.68:5432'));
    renderProjects();
    expect(await screen.findByText(/connect ETIMEDOUT/)).toBeInTheDocument();
    fireEvent.click(within(section()).getByRole('button', { name: 'ลองใหม่' }));
    expect(await screen.findByRole('heading', { name: /\(2\)/ })).toBeInTheDocument();
  });

  it('hides the create action from verifiers', async () => {
    useStore.setState((s) => ({ currentUser: { ...s.currentUser, role: 'verifier' } }));
    renderProjects();
    await screen.findByRole('heading', { name: /\(2\)/ });
    expect(within(section()).queryByRole('button', { name: /สร้าง project จาก/ })).not.toBeInTheDocument();
  });
});
