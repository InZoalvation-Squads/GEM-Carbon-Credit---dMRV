// IoT ingest worker: pure transforms + a full syncIotOnce pass against the
// test database with the external Postgres (pg) mocked out.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { setupTestDatabase, resetDatabase } from '../test/db.js';
import { createOrg, expectValidChainTail, TEST_ORG_ID } from '../test/fixtures.js';
import { uid } from './uid.js';
import {
  aggregateDaily,
  deltasFromCumulative,
  localDate,
  parseDeviceMap,
  syncIotOnce,
  toKwh,
  type IotConfig,
  type Reading,
} from './iot.js';

const { queryMock, endMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  endMock: vi.fn(async () => {}),
}));

vi.mock('pg', () => ({
  default: {
    Pool: class {
      query = queryMock;
      end = endMock;
    },
  },
}));

const TZ = 'Asia/Bangkok';

function shiftDay(day: string, delta: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function cfgWith(overrides: Partial<IotConfig>): IotConfig {
  return {
    dbUrl: 'postgresql://mocked/iot',
    table: 'meter_readings',
    colTimestamp: 'reading_time',
    colDeviceId: 'device_id',
    colValue: 'energy_kwh',
    unit: 'kWh',
    valueKind: 'interval',
    deviceMap: {},
    lookbackHours: 96,
    timezone: TZ,
    deductionPct: 0,
    ...overrides,
  };
}

describe('iot pure transforms', () => {
  it('parseDeviceMap splits pairs and trims whitespace', () => {
    expect(parseDeviceMap('inv-001:prj-a, inv-002 : prj-b,broken,')).toEqual({
      'inv-001': 'prj-a',
      'inv-002': 'prj-b',
    });
  });

  it('toKwh converts Wh and MWh', () => {
    expect(toKwh(1500, 'Wh')).toBe(1.5);
    expect(toKwh(1.5, 'MWh')).toBe(1500);
    expect(toKwh(42, 'kWh')).toBe(42);
  });

  it('deltasFromCumulative yields per-reading deltas and skips meter resets', () => {
    const dev = (v: number, h: number): Reading => ({
      ts: new Date(Date.UTC(2026, 5, 1, h)),
      device: 'm1',
      value: v,
    });
    // 100 → 130 → 130 → 20 (reset) → 45
    const out = deltasFromCumulative([dev(100, 0), dev(130, 1), dev(130, 2), dev(20, 3), dev(45, 4)]);
    expect(out.map((r) => r.value)).toEqual([30, 0, 25]); // the -110 reset gap is dropped
  });

  it('aggregateDaily buckets by LOCAL calendar day', () => {
    // 18:30 UTC = 01:30 the NEXT day in Bangkok (UTC+7)
    const readings: Reading[] = [
      { ts: new Date('2026-06-01T05:00:00Z'), device: 'm1', value: 10 },
      { ts: new Date('2026-06-01T18:30:00Z'), device: 'm1', value: 7 },
    ];
    const days = aggregateDaily(readings, 'kWh', TZ);
    expect([...days.entries()]).toEqual([
      ['2026-06-01', 10],
      ['2026-06-02', 7],
    ]);
  });
});

describe('syncIotOnce', () => {
  let prisma: PrismaClient;
  let projectId: string;

  beforeAll(async () => {
    const url = await setupTestDatabase();
    prisma = new PrismaClient({ datasourceUrl: url });
    await resetDatabase(prisma);
    await createOrg(prisma);

    projectId = uid('prj');
    await prisma.project.create({
      data: {
        id: projectId,
        organization_id: TEST_ORG_ID,
        name: 'IoT test solar',
        location: 'Bangkok, Thailand',
        capacity_kwp: 100,
        commission_date: '2024-01-01',
        status: 'active',
        lifecycle_stage: 'registered',
      },
    });
    // Registered PDD → uploads get stamped with the methodology's driver param.
    const methodologyId = uid('meth');
    await prisma.methodology.create({
      data: {
        id: methodologyId,
        code: 'T-VER-S-98',
        name: 'Solar (iot test fixture)',
        standard: 'T-VER',
        version: 'v0.0-iot-test',
        status: 'active',
        document: {
          schema_version: 2,
          calculation: { formula: 'grid_displacement', input_param: 'EG_PJ', input_unit: 'kWh' },
        },
      },
    });
    await prisma.pdd.create({
      data: {
        id: uid('pdd'),
        project_id: projectId,
        methodology_id: methodologyId,
        methodology_snapshot: 'T-VER-S-98 v0.0-iot-test',
        state: 'registered',
        section_data: {},
        evidence_ids: [],
        assigned_validator_name: 'Test VVB',
      },
    });
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it('inserts complete local days with deduction, dedups on re-run, skips today', async () => {
    const today = localDate(new Date(), TZ);
    const d1 = shiftDay(today, -2);
    const d2 = shiftDay(today, -1);
    const rows = [
      // two readings on d1 → one summed record
      { ts: `${d1}T10:00:00+07:00`, device: 'inv-001', value: 120 },
      { ts: `${d1}T14:00:00+07:00`, device: 'inv-001', value: 80 },
      { ts: `${d2}T12:00:00+07:00`, device: 'inv-001', value: 150 },
      // today → partial day, must be skipped
      { ts: `${today}T08:00:00+07:00`, device: 'inv-001', value: 60 },
      // unmapped device → ignored entirely
      { ts: `${d2}T12:00:00+07:00`, device: 'inv-999', value: 999 },
    ];
    queryMock.mockResolvedValue({ rows });

    const cfg = cfgWith({ deviceMap: { 'inv-001': projectId }, deductionPct: 5 });
    const stats = await syncIotOnce(prisma, cfg);
    expect(stats).toMatchObject({ inserted: 2, skipped_existing: 0, skipped_partial_day: 1 });

    const records = await prisma.monitoringRecord.findMany({
      where: { project_id: projectId },
      orderBy: { record_date: 'asc' },
    });
    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({
      record_date: d1,
      generation_kwh: 190, // (120+80) × 0.95
      source: 'iot_sync',
      param_key: 'EG_PJ',
      unit: 'kWh',
    });
    expect(records[1]).toMatchObject({ record_date: d2, generation_kwh: 142.5 });

    // audit row: system actor, no role, valid hash chain
    const audit = await prisma.auditLog.findFirst({ orderBy: { seq: 'desc' } });
    expect(audit).toMatchObject({
      action: 'IOT_SYNCED',
      user_id: 'system-iot',
      user_role: null,
      entity_id: projectId,
    });
    await expectValidChainTail(prisma);

    // second pass over the same window: nothing new is written
    const again = await syncIotOnce(prisma, cfg);
    expect(again).toMatchObject({ inserted: 0, skipped_existing: 2, skipped_partial_day: 1 });
    expect(await prisma.monitoringRecord.count({ where: { project_id: projectId } })).toBe(2);
    expect(endMock).toHaveBeenCalled(); // pool released on every pass
  });

  it('converts cumulative Wh meters into daily kWh deltas', async () => {
    const today = localDate(new Date(), TZ);
    const d1 = shiftDay(today, -4);
    const d2 = shiftDay(today, -3);
    // cumulative Wh: 1,000,000 → 1,150,000 (d1: +150 kWh) → 1,370,000 (d2: +220 kWh)
    queryMock.mockResolvedValue({
      rows: [
        { ts: `${d1}T06:00:00+07:00`, device: 'meter-1', value: 1_000_000 },
        { ts: `${d1}T18:00:00+07:00`, device: 'meter-1', value: 1_150_000 },
        { ts: `${d2}T18:00:00+07:00`, device: 'meter-1', value: 1_370_000 },
      ],
    });

    const stats = await syncIotOnce(
      prisma,
      cfgWith({ deviceMap: { 'meter-1': projectId }, unit: 'Wh', valueKind: 'cumulative' }),
    );
    expect(stats.inserted).toBe(2);

    const records = await prisma.monitoringRecord.findMany({
      where: { project_id: projectId, record_date: { in: [d1, d2] } },
      orderBy: { record_date: 'asc' },
    });
    expect(records.map((r) => r.generation_kwh)).toEqual([150, 220]);
  });
});
