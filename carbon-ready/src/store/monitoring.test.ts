import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from './index';
import { seedDemo } from '../test/demoFixtures';

function reset() { seedDemo(); }

describe('addMonitoringRecords — methodology param stamping', () => {
  beforeEach(reset);

  it('stamps param_key and unit from the registered methodology', () => {
    const s = useStore.getState();
    // prj-0001 is registered under T-VER solar: driver EG_PJ in kWh.
    s.addMonitoringRecords('prj-0001', [{ record_date: '2030-01-01', generation_kwh: 123 }]);
    const rec = useStore.getState().records.find(
      (r) => r.project_id === 'prj-0001' && r.record_date === '2030-01-01'
    )!;
    expect(rec.param_key).toBe('EG_PJ');
    expect(rec.unit).toBe('kWh');
  });

  it('omits param_key and unit for a project without a methodology', () => {
    const s = useStore.getState();
    const p = s.createProject({
      name: 'No-Methodology Plant', location: 'Nowhere',
      capacity_kwp: 100, commission_date: '2026-01-01', status: 'draft',
    });
    s.addMonitoringRecords(p.id, [{ record_date: '2030-01-01', generation_kwh: 5 }]);
    const rec = useStore.getState().records.find((r) => r.project_id === p.id)!;
    expect(rec.param_key).toBeUndefined();
    expect(rec.unit).toBeUndefined();
  });
});
