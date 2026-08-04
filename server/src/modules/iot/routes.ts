// IoT ingest control surface. The worker itself runs on a cron schedule
// (wired in index.ts, never in tests); these routes power the IoT mapping
// page: list external devices/plants, manage device→project mappings (stored
// in iot_device_maps — no .env edits), create a project straight from a
// plant, and trigger a sync by hand.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { actorFromRequest } from '../../lib/audit.js';
import { appError } from '../../lib/errors.js';
import { uid } from '../../lib/uid.js';
import {
  iotConfigFromEnv,
  listIotDevices,
  resolveDeviceMap,
  syncIotOnce,
  type IotConfig,
} from '../../lib/iot.js';
import { createProject, serializeProject } from '../projects/service.js';

const MappingBody = z.object({
  device_id: z.string().min(1),
  project_id: z.string().min(1),
  label: z.string().min(1).optional(),
});

const CreateProjectBody = z.object({
  device_id: z.string().min(1),
  name: z.string().min(1),
  capacity_kwp: z.number().positive(),
  location: z.string().min(1),
  commission_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const SyncBody = z.object({
  // one-off backfill window; default = configured IOT_LOOKBACK_HOURS
  lookback_hours: z.number().positive().max(24 * 400).optional(),
});

function requireIotConfig(): IotConfig {
  const cfg = iotConfigFromEnv();
  if (!cfg) {
    throw appError(422, 'UNPROCESSABLE', 'IoT ingest is not configured (set IOT_DB_URL in server/.env)');
  }
  return cfg;
}

export async function iotRoutes(app: FastifyInstance): Promise<void> {
  const canWrite = [app.authenticate, app.requireRole('project_owner', 'admin', 'esg_manager')];

  // Config visibility — never exposes IOT_DB_URL (it carries the external
  // database's credentials).
  app.get('/status', { preHandler: [app.authenticate] }, async () => {
    const cfg = iotConfigFromEnv();
    if (!cfg) return { enabled: false };
    return {
      enabled: true,
      table: cfg.table,
      unit: cfg.unit,
      value_kind: cfg.valueKind,
      lookback_hours: cfg.lookbackHours,
      timezone: cfg.timezone,
      deduction_pct: cfg.deductionPct,
      env_device_map: cfg.deviceMap,
    };
  });

  // External devices/plants with per-device stats + current mapping state.
  // For mapped devices, `synced_days` = distinct record dates already in OUR
  // monitoring store within the device's data range — the page renders it as
  // a coverage badge so "ครบ/ขาด" is visible at a glance.
  app.get('/devices', { preHandler: [app.authenticate] }, async () => {
    const cfg = requireIotConfig();
    const devices = await listIotDevices(cfg);
    const mapped = await resolveDeviceMap(app.prisma, cfg);
    const withCoverage = await Promise.all(devices.map(async (d) => {
      const projectId = mapped[d.device_id] ?? null;
      if (!projectId || d.first_date === null || d.last_date === null) {
        return { ...d, project_id: projectId, synced_days: null };
      }
      const dates = await app.prisma.monitoringRecord.findMany({
        where: { project_id: projectId, record_date: { gte: d.first_date, lte: d.last_date } },
        distinct: ['record_date'],
        select: { record_date: true },
      });
      return { ...d, project_id: projectId, synced_days: dates.length };
    }));
    return { devices: withCoverage };
  });

  app.get('/mappings', { preHandler: [app.authenticate] }, async () => {
    const rows = await app.prisma.iotDeviceMap.findMany({
      orderBy: { created_at: 'asc' },
      include: { project: { select: { name: true } } },
    });
    return {
      mappings: rows.map((m) => ({
        id: m.id,
        device_id: m.device_id,
        project_id: m.project_id,
        project_name: m.project.name,
        label: m.label,
        created_at: m.created_at.toISOString(),
      })),
    };
  });

  // Upsert: re-mapping a device to another project replaces the old pair.
  app.post('/mappings', { preHandler: canWrite }, async (req, reply) => {
    const body = MappingBody.parse(req.body ?? {});
    const project = await app.prisma.project.findFirst({
      where: { id: body.project_id, organization_id: req.user.org },
      select: { id: true },
    });
    if (!project) throw appError(404, 'NOT_FOUND', 'Project not found');

    const row = await app.prisma.iotDeviceMap.upsert({
      where: { device_id: body.device_id },
      create: { id: uid('iotmap'), ...body },
      update: { project_id: body.project_id, label: body.label },
    });
    return reply.code(201).send({ mapping: { id: row.id, device_id: row.device_id, project_id: row.project_id, label: row.label } });
  });

  app.delete('/mappings/:deviceId', { preHandler: canWrite }, async (req) => {
    const { deviceId } = z.object({ deviceId: z.string().min(1) }).parse(req.params);
    await app.prisma.iotDeviceMap.deleteMany({ where: { device_id: deviceId } });
    return { ok: true };
  });

  // One click on the mapping page: create a project from the plant's own
  // name/capacity/etc. and map the plant to it in the same breath.
  app.post('/create-project', { preHandler: canWrite }, async (req, reply) => {
    const body = CreateProjectBody.parse(req.body ?? {});
    const project = await createProject(app.prisma, actorFromRequest(req), {
      name: body.name,
      location: body.location,
      capacity_kwp: body.capacity_kwp,
      commission_date: body.commission_date,
      status: 'active',
    });
    await app.prisma.iotDeviceMap.upsert({
      where: { device_id: body.device_id },
      create: { id: uid('iotmap'), device_id: body.device_id, project_id: project.id, label: body.name },
      update: { project_id: project.id, label: body.name },
    });
    return reply.code(201).send({ project: serializeProject(project) });
  });

  app.post('/sync', { preHandler: canWrite }, async (req) => {
    const cfg = requireIotConfig();
    const { lookback_hours } = SyncBody.parse(req.body ?? {});
    const stats = await syncIotOnce(
      app.prisma,
      lookback_hours ? { ...cfg, lookbackHours: lookback_hours } : cfg,
    );
    req.log.info(stats, 'manual iot sync');
    return stats;
  });
}
