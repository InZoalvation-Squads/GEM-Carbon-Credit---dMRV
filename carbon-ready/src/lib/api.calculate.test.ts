import { describe, it, expect, beforeEach } from 'vitest';
import { api } from './api';
import { useStore } from '../store';
import { seedDemo } from '../test/demoFixtures';
import type { Project, MonitoringRecord } from '../types';

// A registered project created from the IoT registry: Thai free-text address
// (no comma, no English country word) and iot_sync monitoring records. The
// calculation must still resolve the TH emission factor and produce reductions.
const thaiProject: Project = {
  id: 'prj-thai-iot', organization_id: 'org-0001', name: 'Trat Community college',
  location: 'ถนนสุขุมวิท ตำบล เนินทราย อำเภอเมืองตราด ตราด 23000',
  capacity_kwp: 34.38, commission_date: '2026-05-15', status: 'active',
  lifecycle_stage: 'registered', created_at: '2026-05-15T00:00:00Z', updated_at: '2026-05-15T00:00:00Z',
};
const iotRecords: MonitoringRecord[] = [
  { id: 'mon-thai-1', project_id: 'prj-thai-iot', record_date: '2026-05-15', generation_kwh: 202.27, source: 'iot_sync', uploaded_at: '2026-05-16T00:00:00Z' },
  { id: 'mon-thai-2', project_id: 'prj-thai-iot', record_date: '2026-05-16', generation_kwh: 129.82, source: 'iot_sync', uploaded_at: '2026-05-17T00:00:00Z' },
];

beforeEach(() => {
  seedDemo();
  useStore.setState((s) => ({
    projects: [...s.projects, thaiProject],
    records: [...s.records, ...iotRecords],
  }));
});

describe('api.calculate — IoT project with a Thai-script address', () => {
  it('sums iot_sync records and applies the TH emission factor', async () => {
    const r = await api.calculate('prj-thai-iot');
    expect(r.totals.generation_kwh).toBeCloseTo(202.27 + 129.82, 2);
    expect(r.totals.reduction_kgco2e).toBeGreaterThan(0);
    expect(r.emission_factor_id).not.toBeNull();
    expect(r.daily).toHaveLength(2);
  });
});
