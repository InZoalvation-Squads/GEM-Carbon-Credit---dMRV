import { describe, it, expect, beforeEach } from 'vitest';
import { seedDemo } from '../test/demoFixtures';
import { useStore } from './index';
import { api } from '../lib/api';

// REC facility fixture: prj-0010 (Ayutthaya Solar REC Facility), REC-registered
// via PDD-2009 (meth-rec-solar). Its monitoring records (test/demoFixtures.ts
// REC_RECORDS) are hand-picked round kWh values:
//   2026-01-01: 1500 kWh, 2026-01-15: 2500 kWh  → Jan 2026 = 4000 kWh = 4 MWh
//   2026-02-01: 999 kWh                          → Feb 2026 = 999 kWh = 0.999 MWh
//   2026-03-01: 6000 kWh                          → Mar 2026 = 6000 kWh = 6 MWh
const REC_PROJECT_ID = 'prj-0010';

beforeEach(() => {
  localStorage.clear();
  seedDemo();
});

describe('REC issue requests — demo store', () => {
  it('creates a draft with MWh computed from monitoring records in the period', async () => {
    const before = useStore.getState().recIssues.length;

    const created = await api.createRecIssue({
      project_id: REC_PROJECT_ID,
      period_start: '2026-01-01',
      period_end: '2026-01-31',
      request_type: 'Normal',
    });

    expect(created.total_production_mwh).toBe(4);
    expect(created.state).toBe('draft');
    expect(created.applied_mwh).toBeNull();
    expect(created.submitted_at).toBeNull();
    expect(created.issued_at).toBeNull();
    expect(created.facility_snapshot).toEqual({
      evident_org_id: 'EVID-000456',
      organisation_name: 'GreenGrid Asia Co., Ltd.',
      facility_name: 'Ayutthaya Solar REC Facility',
      fuel_code: 'F01',
      fuel_description: 'Solar',
      technology_code: 'T01',
      technology_description: 'Photovoltaic',
    });

    const s = useStore.getState();
    expect(s.recIssues).toHaveLength(before + 1);
    expect(s.recIssues[0]).toEqual(created);
  });

  it('submit → submitted; approve → issued with issued_at', async () => {
    const created = await api.createRecIssue({
      project_id: REC_PROJECT_ID,
      period_start: '2026-01-01',
      period_end: '2026-01-31',
      request_type: 'Normal',
      receiving_org_name: 'GreenGrid Asia Co., Ltd.',
      receiving_account_id: 'EVID-ACC-000456',
    });

    await api.submitRecIssue(created.id);
    let row = useStore.getState().recIssues.find((r) => r.id === created.id);
    expect(row?.state).toBe('submitted');
    expect(row?.submitted_at).not.toBeNull();

    await api.approveRecIssue(created.id);
    row = useStore.getState().recIssues.find((r) => r.id === created.id);
    expect(row?.state).toBe('issued');
    expect(row?.issued_at).not.toBeNull();
  });

  it('reject stores the reason', async () => {
    const created = await api.createRecIssue({
      project_id: REC_PROJECT_ID,
      period_start: '2026-01-01',
      period_end: '2026-01-31',
      request_type: 'Normal',
      receiving_org_name: 'GreenGrid Asia Co., Ltd.',
      receiving_account_id: 'EVID-ACC-000456',
    });
    await api.submitRecIssue(created.id);

    await api.rejectRecIssue(created.id, 'Meter serial number does not match SF-02 registration.');

    const row = useStore.getState().recIssues.find((r) => r.id === created.id);
    expect(row?.state).toBe('rejected');
    expect(row?.rejection_reason).toBe('Meter serial number does not match SF-02 registration.');
  });

  it('delete removes a draft', async () => {
    const created = await api.createRecIssue({
      project_id: REC_PROJECT_ID,
      period_start: '2026-01-01',
      period_end: '2026-01-31',
      request_type: 'Normal',
    });
    const before = useStore.getState().recIssues.length;

    await api.deleteRecIssue(created.id);

    const s = useStore.getState();
    expect(s.recIssues).toHaveLength(before - 1);
    expect(s.recIssues.find((r) => r.id === created.id)).toBeUndefined();
  });
});
