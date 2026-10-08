import { describe, it, expect } from 'vitest';
import { unmappedPlants, backfillHoursFor } from './iot-plants';
import type { IotDevice } from './server-api';

function device(over: Partial<IotDevice>): IotDevice {
  return {
    device_id: 'd', name: null, capacity_kwp: null, location: null, commission_date: null,
    days: 0, first_date: null, last_date: null, avg_value: 0, project_id: null, synced_days: null,
    ...over,
  };
}

describe('unmappedPlants', () => {
  it('drops plants that already have a project', () => {
    const out = unmappedPlants([
      device({ device_id: 'a', name: 'A' }),
      device({ device_id: 'b', name: 'B', project_id: 'prj-1' }),
    ]);
    expect(out.map((d) => d.device_id)).toEqual(['a']);
  });

  it('puts plants with data first (newest last_date, then most days), then no-data plants by name', () => {
    const out = unmappedPlants([
      device({ device_id: 'none-z', name: 'Zeta' }),
      device({ device_id: 'old', name: 'Old', days: 50, first_date: '2026-05-01', last_date: '2026-08-03' }),
      device({ device_id: 'new', name: 'New', days: 10, first_date: '2026-09-01', last_date: '2026-09-11' }),
      device({ device_id: 'none-a', name: 'Alpha' }),
      device({ device_id: 'old-more', name: 'Old more', days: 53, first_date: '2026-05-01', last_date: '2026-08-03' }),
    ]);
    expect(out.map((d) => d.device_id)).toEqual(['new', 'old-more', 'old', 'none-a', 'none-z']);
  });

  it('sorts unnamed no-data plants by their id', () => {
    const out = unmappedPlants([device({ device_id: 'zz' }), device({ device_id: 'aa' })]);
    expect(out.map((d) => d.device_id)).toEqual(['aa', 'zz']);
  });
});

describe('backfillHoursFor', () => {
  it('reaches the first data day with two days of slack', () => {
    const now = new Date('2026-10-08T12:00:00').getTime();
    expect(backfillHoursFor('2026-10-01', now)).toBe((7 + 1 + 2) * 24);
  });

  it('caps at 400 days', () => {
    const now = new Date('2026-10-08T12:00:00').getTime();
    expect(backfillHoursFor('2020-01-01', now)).toBe(400 * 24);
  });
});
