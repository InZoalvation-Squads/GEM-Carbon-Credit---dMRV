// IoT ingest: pulls energy readings from an EXTERNAL Postgres (read-only
// user recommended) and lands them as monitoring records — converted to kWh,
// cumulative meters turned into interval deltas, aggregated to complete days
// in the project's timezone, deducted per the TGO monitoring plan, and
// deduplicated against records already stored. Configured entirely via
// IOT_* env vars; absent config = module dormant.
import pg from 'pg';
import type { PrismaClient } from '@prisma/client';
import { config as appConfig, type Config } from '../config.js';
import { uid } from './uid.js';
import { writeAudit } from './audit.js';

export interface IotConfig {
  dbUrl: string;
  table: string;
  colTimestamp: string;
  colDeviceId: string;
  colValue: string;
  unit: 'kWh' | 'Wh' | 'MWh';
  valueKind: 'interval' | 'cumulative';
  deviceMap: Record<string, string>; // device id → project id
  lookbackHours: number;
  timezone: string;
  deductionPct: number;
}

export function parseDeviceMap(raw: string): Record<string, string> {
  const map: Record<string, string> = {};
  for (const pair of raw.split(',')) {
    const [device, project] = pair.split(':').map((s) => s.trim());
    if (device && project) map[device] = project;
  }
  return map;
}

/**
 * Build the worker config from the parsed env; null = dormant (missing
 * IOT_DB_URL, or running under vitest — module tests never touch a live IoT
 * database, they construct IotConfig literals directly). `deviceMap` here is
 * only the optional .env seed — the authoritative mappings live in the
 * iot_device_maps table and are merged in by resolveDeviceMap.
 */
export function iotConfigFromEnv(env: Config = appConfig): IotConfig | null {
  if (process.env.NODE_ENV === 'test' && env === appConfig) return null;
  if (!env.IOT_DB_URL) return null;
  return {
    dbUrl: env.IOT_DB_URL,
    table: env.IOT_DB_TABLE ?? 'meter_readings',
    colTimestamp: env.IOT_COL_TIMESTAMP ?? 'reading_time',
    colDeviceId: env.IOT_COL_DEVICE_ID ?? 'device_id',
    colValue: env.IOT_COL_VALUE ?? 'energy_kwh',
    unit: env.IOT_VALUE_UNIT ?? 'kWh',
    valueKind: env.IOT_VALUE_KIND ?? 'interval',
    deviceMap: env.IOT_DEVICE_MAP ? parseDeviceMap(env.IOT_DEVICE_MAP) : {},
    lookbackHours: env.IOT_LOOKBACK_HOURS ?? 48,
    timezone: env.IOT_TIMEZONE ?? 'Asia/Bangkok',
    deductionPct: env.IOT_DEDUCTION_PCT ?? 0,
  };
}

export function iotEnabled(): boolean {
  return iotConfigFromEnv() !== null;
}

export function toKwh(value: number, unit: IotConfig['unit']): number {
  if (unit === 'Wh') return value / 1000;
  if (unit === 'MWh') return value * 1000;
  return value;
}

export interface Reading {
  ts: Date;
  device: string;
  value: number;
}

/**
 * Cumulative meter readings → interval energy per reading. A drop in the
 * cumulative value means a meter reset/replacement — that gap is skipped
 * rather than counted as negative generation.
 */
export function deltasFromCumulative(readings: Reading[]): Reading[] {
  const byDevice = new Map<string, Reading[]>();
  for (const r of readings) {
    const list = byDevice.get(r.device) ?? [];
    list.push(r);
    byDevice.set(r.device, list);
  }
  const out: Reading[] = [];
  for (const list of byDevice.values()) {
    list.sort((a, b) => a.ts.getTime() - b.ts.getTime());
    for (let i = 1; i < list.length; i++) {
      const prev = list[i - 1]!;
      const cur = list[i]!;
      const delta = cur.value - prev.value;
      if (delta >= 0) out.push({ ts: cur.ts, device: cur.device, value: delta });
    }
  }
  return out;
}

/** Local calendar date of a timestamp in the configured timezone. */
export function localDate(ts: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(ts); // en-CA → YYYY-MM-DD
}

/** Sum interval readings into per-day totals (kWh), keyed by local date. */
export function aggregateDaily(readings: Reading[], unit: IotConfig['unit'], timezone: string): Map<string, number> {
  const days = new Map<string, number>();
  for (const r of readings) {
    const day = localDate(r.ts, timezone);
    days.set(day, (days.get(day) ?? 0) + toKwh(r.value, unit));
  }
  return days;
}

export interface IotSyncStats {
  devices: number;
  readings: number;
  inserted: number;
  skipped_existing: number;
  skipped_partial_day: number;
}

/**
 * Effective device→project map: DB rows (managed from the IoT page) on top
 * of any legacy IOT_DEVICE_MAP env pairs.
 */
export async function resolveDeviceMap(
  prisma: PrismaClient,
  cfg: IotConfig,
): Promise<Record<string, string>> {
  const rows = await prisma.iotDeviceMap.findMany({
    select: { device_id: true, project_id: true },
  });
  return { ...cfg.deviceMap, ...Object.fromEntries(rows.map((r) => [r.device_id, r.project_id])) };
}

export interface IotDeviceInfo {
  device_id: string;
  /** display name from the IoT side's `plants` table, when available */
  name: string | null;
  capacity_kwp: number | null;
  /** address from the plants table — prefill for create-project */
  location: string | null;
  /** grid connection date from the plants table — prefill for commission date */
  commission_date: string | null;
  /** 0 = the plant exists in the source's plants table but has NO readings yet */
  days: number;
  first_date: string | null;
  last_date: string | null;
  avg_value: number;
}

/**
 * Devices present in the external readings table, with per-device stats —
 * what the mapping page lists. Names/capacities are enriched from a `plants`
 * table when the source database has one (best-effort; purely cosmetic).
 */
export async function listIotDevices(cfg: IotConfig): Promise<IotDeviceInfo[]> {
  const pool = new pg.Pool({ connectionString: cfg.dbUrl, max: 2 });
  try {
    const q = (name: string) => name.split('.').map((p) => `"${p.replace(/"/g, '""')}"`).join('.');
    const res = await pool.query(`
      SELECT ${q(cfg.colDeviceId)} AS device, count(*) AS days,
             min(${q(cfg.colTimestamp)}) AS first_ts, max(${q(cfg.colTimestamp)}) AS last_ts,
             avg(${q(cfg.colValue)}) AS avg_value
      FROM ${q(cfg.table)}
      GROUP BY ${q(cfg.colDeviceId)}
      ORDER BY max(${q(cfg.colTimestamp)}) DESC, count(*) DESC`);

    type PlantMeta = { name: string; capacity_kwp: number | null; location: string | null; commission_date: string | null };
    let names = new Map<string, PlantMeta>();
    const toMeta = (p: Record<string, unknown>): PlantMeta => ({
      name: String(p.name),
      capacity_kwp: p.capacity_kwp == null ? null : Number(p.capacity_kwp),
      location: p.address == null ? null : String(p.address),
      commission_date: p.grid_connection_date == null
        ? null
        : localDate(new Date(p.grid_connection_date as string | Date), cfg.timezone),
    });
    try {
      const plants = await pool.query('SELECT id, name, capacity_kwp, address, grid_connection_date FROM public.plants');
      names = new Map(plants.rows.map((p: Record<string, unknown>) => [String(p.id), toMeta(p)]));
    } catch {
      try {
        // plants table without the optional columns
        const plants = await pool.query('SELECT id, name, capacity_kwp FROM public.plants');
        names = new Map(plants.rows.map((p: Record<string, unknown>) => [String(p.id), toMeta(p)]));
      } catch {
        // no plants table in this source — device ids stand on their own
      }
    }

    const out: IotDeviceInfo[] = res.rows.map((r: Record<string, unknown>) => {
      const meta = names.get(String(r.device));
      return {
        device_id: String(r.device),
        name: meta?.name ?? null,
        capacity_kwp: meta?.capacity_kwp ?? null,
        location: meta?.location ?? null,
        commission_date: meta?.commission_date ?? null,
        days: Number(r.days),
        first_date: localDate(new Date(r.first_ts as string | Date), cfg.timezone),
        last_date: localDate(new Date(r.last_ts as string | Date), cfg.timezone),
        avg_value: Math.round(toKwh(Number(r.avg_value), cfg.unit) * 10) / 10,
      };
    });

    // Plants known to the source but with no readings yet — surfaced with
    // days: 0 so the page can show the FULL fleet, not just active meters.
    const withData = new Set(out.map((d) => d.device_id));
    for (const [id, meta] of names) {
      if (withData.has(id)) continue;
      out.push({
        device_id: id,
        name: meta.name,
        capacity_kwp: meta.capacity_kwp,
        location: meta.location,
        commission_date: meta.commission_date,
        days: 0,
        first_date: null,
        last_date: null,
        avg_value: 0,
      });
    }
    return out;
  } finally {
    await pool.end();
  }
}

/**
 * One sync pass. Only COMPLETE local days are written (today is always
 * skipped — a half-day would freeze wrong numbers, since records are
 * insert-once). Existing record dates are never overwritten.
 */
export async function syncIotOnce(prisma: PrismaClient, cfg: IotConfig): Promise<IotSyncStats> {
  const deviceMap = await resolveDeviceMap(prisma, cfg);
  const devices = Object.keys(deviceMap);
  if (devices.length === 0) {
    return { devices: 0, readings: 0, inserted: 0, skipped_existing: 0, skipped_partial_day: 0 };
  }
  const pool = new pg.Pool({ connectionString: cfg.dbUrl, max: 2 });
  try {
    const since = new Date(Date.now() - cfg.lookbackHours * 3_600_000);
    // Table/column names come from .env, not user input — but still quote
    // them as identifiers ("" escape) so a dotted/cased name can't break out.
    const q = (name: string) => name.split('.').map((p) => `"${p.replace(/"/g, '""')}"`).join('.');
    const sql = `
      SELECT ${q(cfg.colTimestamp)} AS ts, ${q(cfg.colDeviceId)} AS device, ${q(cfg.colValue)} AS value
      FROM ${q(cfg.table)}
      WHERE ${q(cfg.colTimestamp)} >= $1 AND ${q(cfg.colDeviceId)} = ANY($2)
      ORDER BY ${q(cfg.colDeviceId)}, ${q(cfg.colTimestamp)}`;
    const res = await pool.query(sql, [since, devices]);
    const readings: Reading[] = res.rows.map((r: Record<string, unknown>) => ({
      ts: new Date(r.ts as string | Date),
      device: String(r.device),
      value: Number(r.value),
    })).filter((r) => Number.isFinite(r.value));

    const interval = cfg.valueKind === 'cumulative' ? deltasFromCumulative(readings) : readings;
    const today = localDate(new Date(), cfg.timezone);

    const stats: IotSyncStats = {
      devices: devices.length, readings: readings.length,
      inserted: 0, skipped_existing: 0, skipped_partial_day: 0,
    };

    // group per project (several devices can feed one project)
    const perProject = new Map<string, Reading[]>();
    for (const r of interval) {
      const projectId = deviceMap[r.device];
      if (!projectId) continue;
      const list = perProject.get(projectId) ?? [];
      list.push(r);
      perProject.set(projectId, list);
    }

    for (const [projectId, rows] of perProject) {
      const days = aggregateDaily(rows, cfg.unit, cfg.timezone);
      const existing = new Set(
        (await prisma.monitoringRecord.findMany({
          where: { project_id: projectId, record_date: { in: [...days.keys()] } },
          select: { record_date: true },
        })).map((r) => r.record_date),
      );

      // stamp param/unit from the registered PDD's methodology (same rule as CSV upload)
      const pdd = await prisma.pdd.findFirst({
        where: { project_id: projectId, state: 'registered' },
        include: { methodology: { select: { document: true } } },
      });
      const calc = (pdd?.methodology.document as { calculation?: { input_param?: string; input_unit?: string } } | null)?.calculation;
      const stamp = calc ? { param_key: calc.input_param, unit: calc.input_unit } : {};

      const inserts: Array<{ record_date: string; generation_kwh: number }> = [];
      for (const [day, kwh] of days) {
        if (day >= today) { stats.skipped_partial_day++; continue; }
        if (existing.has(day)) { stats.skipped_existing++; continue; }
        const net = kwh * (1 - cfg.deductionPct / 100);
        inserts.push({ record_date: day, generation_kwh: Math.round(net * 100) / 100 });
      }
      if (inserts.length === 0) continue;

      await prisma.$transaction(async (tx) => {
        await tx.monitoringRecord.createMany({
          data: inserts.map((r) => ({
            id: uid('mon'), project_id: projectId, source: 'iot_sync',
            uploaded_at: new Date(), ...stamp, ...r,
          })),
        });
        await writeAudit(tx, {
          userId: 'system-iot', role: null, ip: null,
          action: 'IOT_SYNCED', entityType: 'monitoring', entityId: projectId,
          payload: { inserted: inserts.length, deduction_pct: cfg.deductionPct, source: 'iot_sync' },
        });
      });
      stats.inserted += inserts.length;
    }
    return stats;
  } finally {
    await pool.end();
  }
}
