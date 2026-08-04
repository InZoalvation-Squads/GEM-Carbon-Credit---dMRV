// IoT mapping routes: mappings CRUD, create-project-from-plant, and the
// DB-over-env device-map merge. /devices and /sync against the external DB
// are covered in lib/iot.test.ts with pg mocked; here the config is dormant
// (NODE_ENV=test), so the config-gated routes answer 422.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { setupTestDatabase, resetDatabase } from '../../test/db.js';
import { auth, createOrg, registerUser } from '../../test/fixtures.js';
import { buildApp } from '../../app.js';
import { resolveDeviceMap, type IotConfig } from '../../lib/iot.js';

describe('iot routes', () => {
  let prisma: PrismaClient;
  let app: FastifyInstance;
  let owner: { id: string; token: string };
  let verifier: { id: string; token: string };
  let projectId: string;

  beforeAll(async () => {
    const url = await setupTestDatabase();
    prisma = new PrismaClient({ datasourceUrl: url });
    await resetDatabase(prisma);
    await createOrg(prisma);
    app = await buildApp({ prisma });
    owner = await registerUser(app, 'project_owner');
    verifier = await registerUser(app, 'verifier');

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/projects',
      headers: auth(owner.token),
      payload: { name: 'Mapped solar', location: 'Bangkok, Thailand', capacity_kwp: 100, commission_date: '2024-01-01' },
    });
    expect(res.statusCode).toBe(201);
    projectId = res.json().project.id;
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('status reports disabled when unconfigured (NODE_ENV=test)', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/iot/status', headers: auth(owner.token) });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ enabled: false });
  });

  it('devices and sync answer 422 while unconfigured', async () => {
    const devices = await app.inject({ method: 'GET', url: '/api/v1/iot/devices', headers: auth(owner.token) });
    expect(devices.statusCode).toBe(422);
    const sync = await app.inject({ method: 'POST', url: '/api/v1/iot/sync', headers: auth(owner.token), payload: {} });
    expect(sync.statusCode).toBe(422);
  });

  it('mapping CRUD: create, upsert to another project, list, delete', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/iot/mappings',
      headers: auth(owner.token),
      payload: { device_id: 'plant-abc', project_id: projectId, label: 'Plant ABC' },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().mapping).toMatchObject({ device_id: 'plant-abc', project_id: projectId });

    // same device again = upsert, not a second row
    const again = await app.inject({
      method: 'POST',
      url: '/api/v1/iot/mappings',
      headers: auth(owner.token),
      payload: { device_id: 'plant-abc', project_id: projectId, label: 'Plant ABC v2' },
    });
    expect(again.statusCode).toBe(201);

    const list = await app.inject({ method: 'GET', url: '/api/v1/iot/mappings', headers: auth(owner.token) });
    const mappings = list.json().mappings.filter((m: { device_id: string }) => m.device_id === 'plant-abc');
    expect(mappings).toHaveLength(1);
    expect(mappings[0]).toMatchObject({ label: 'Plant ABC v2', project_name: 'Mapped solar' });

    const del = await app.inject({ method: 'DELETE', url: '/api/v1/iot/mappings/plant-abc', headers: auth(owner.token) });
    expect(del.statusCode).toBe(200);
    expect(await prisma.iotDeviceMap.count({ where: { device_id: 'plant-abc' } })).toBe(0);
  });

  it('rejects mapping to a nonexistent project and blocks verifiers', async () => {
    const missing = await app.inject({
      method: 'POST',
      url: '/api/v1/iot/mappings',
      headers: auth(owner.token),
      payload: { device_id: 'plant-x', project_id: 'prj-nope' },
    });
    expect(missing.statusCode).toBe(404);

    const forbidden = await app.inject({
      method: 'POST',
      url: '/api/v1/iot/mappings',
      headers: auth(verifier.token),
      payload: { device_id: 'plant-x', project_id: projectId },
    });
    expect(forbidden.statusCode).toBe(403);
  });

  it('create-project creates the project AND the mapping in one call', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/iot/create-project',
      headers: auth(owner.token),
      payload: {
        device_id: 'plant-uthai',
        name: 'Uthaithani Community College',
        capacity_kwp: 105,
        location: 'Uthai Thani, Thailand',
        commission_date: '2026-06-01',
      },
    });
    expect(res.statusCode).toBe(201);
    const project = res.json().project;
    expect(project).toMatchObject({ name: 'Uthaithani Community College', capacity_kwp: 105 });

    const map = await prisma.iotDeviceMap.findUnique({ where: { device_id: 'plant-uthai' } });
    expect(map?.project_id).toBe(project.id);

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'PROJECT_CREATED', entity_id: project.id },
    });
    expect(audit).not.toBeNull();
  });

  it('resolveDeviceMap: DB mappings override env pairs for the same device', async () => {
    const cfg = { deviceMap: { 'plant-uthai': 'prj-env-legacy', 'plant-env-only': 'prj-env' } } as IotConfig;
    const merged = await resolveDeviceMap(prisma, cfg);
    expect(merged['plant-env-only']).toBe('prj-env'); // env pair survives
    expect(merged['plant-uthai']).not.toBe('prj-env-legacy'); // DB row wins
  });
});
