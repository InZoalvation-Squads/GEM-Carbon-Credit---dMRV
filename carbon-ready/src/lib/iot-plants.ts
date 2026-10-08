import { iotApi, type IotDevice, type IotSyncStats } from './server-api';
import type { Project } from '../types';

/**
 * Plants from the external IoT source that no project owns yet. Plants with
 * readings come first (freshest data, then the longest history), followed by
 * plants with no readings, alphabetically.
 */
export function unmappedPlants(devices: IotDevice[]): IotDevice[] {
  const label = (d: IotDevice) => d.name ?? d.device_id;
  return devices
    .filter((d) => d.project_id === null)
    .sort((a, b) => {
      if (a.last_date && b.last_date) {
        if (a.last_date !== b.last_date) return a.last_date < b.last_date ? 1 : -1;
        return b.days - a.days;
      }
      if (a.last_date) return -1;
      if (b.last_date) return 1;
      return label(a).localeCompare(label(b));
    });
}

/** Backfill window reaching the plant's first data day (+2 days slack, server caps at 400 days). */
export function backfillHoursFor(firstDate: string, now: number = Date.now()): number {
  const days = Math.ceil((now - new Date(`${firstDate}T00:00:00`).getTime()) / 86_400_000) + 2;
  return Math.min(days, 400) * 24;
}

/** Pull a plant's ENTIRE history so coverage hits 100% without extra clicks; null when it has no readings yet. */
export async function backfillPlant(device: IotDevice): Promise<IotSyncStats | null> {
  if (!device.first_date) return null; // the hourly cron picks readings up once they appear
  return iotApi.sync(backfillHoursFor(device.first_date));
}

/**
 * Create a project from the plant's own name/capacity/address and map the
 * plant to it in one call. Callers run backfillPlant afterwards, so a failed
 * backfill is never reported as a failed create.
 */
export function createProjectFromPlant(device: IotDevice): Promise<Project> {
  return iotApi.createProject({
    device_id: device.device_id,
    name: device.name ?? device.device_id,
    capacity_kwp: device.capacity_kwp ?? 1,
    location: device.location ?? 'Thailand',
    commission_date: device.commission_date ?? device.first_date ?? new Date().toISOString().slice(0, 10),
  });
}
