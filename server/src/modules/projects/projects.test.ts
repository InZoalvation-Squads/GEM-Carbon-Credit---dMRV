import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { setupTestDatabase, resetDatabase } from '../../test/db.js';
import {
  createOrg,
  registerUser,
  expectValidChainTail,
  latestAudit,
  TEST_ORG_ID,
} from '../../test/fixtures.js';
import { buildApp } from '../../app.js';

const VALID_BODY = {
  name: 'Rooftop Solar A',
  location: 'Pune, India',
  capacity_kwp: 120.5,
  commission_date: '2024-03-01',
  status: 'active',
};

describe('projects module', () => {
  let prisma: PrismaClient;
  let app: FastifyInstance;
  let owner: { id: string; token: string };
  let verifier: { id: string; token: string };
  let otherOrgToken: string;

  beforeAll(async () => {
    const url = await setupTestDatabase();
    prisma = new PrismaClient({ datasourceUrl: url });
    await resetDatabase(prisma);
    await createOrg(prisma);
    app = await buildApp({ prisma });
    owner = await registerUser(app, 'project_owner');
    verifier = await registerUser(app, 'verifier');

    // A second organization to prove org scoping (registration always joins
    // the first org, so build this user directly).
    await createOrg(prisma, 'org-0002', 'Other Org');
    await prisma.user.create({
      data: {
        id: 'usr-other-org',
        organization_id: 'org-0002',
        email: 'other@example.com',
        name: 'Other Org Owner',
        role: 'project_owner',
        password_hash: 'not-a-real-hash',
      },
    });
    otherOrgToken = app.jwt.sign({ sub: 'usr-other-org', role: 'project_owner', org: 'org-0002' });
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  const auth = (token: string) => ({ authorization: `Bearer ${token}` });

  describe('POST /api/v1/projects', () => {
    it('requires auth', async () => {
      const res = await app.inject({ method: 'POST', url: '/api/v1/projects', payload: VALID_BODY });
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe('UNAUTHORIZED');
    });

    it('rejects verifiers', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/projects', headers: auth(verifier.token), payload: VALID_BODY,
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe('FORBIDDEN');
    });

    it('rejects an invalid body with the envelope', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/projects', headers: auth(owner.token),
        payload: { ...VALID_BODY, name: '', capacity_kwp: -1 },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('VALIDATION_ERROR');
    });

    it('creates a project as unregistered and audits PROJECT_CREATED', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/projects', headers: auth(owner.token), payload: VALID_BODY,
      });
      expect(res.statusCode).toBe(201);
      const project = res.json().project;
      expect(project).toMatchObject({
        name: 'Rooftop Solar A',
        location: 'Pune, India',
        capacity_kwp: 120.5,
        commission_date: '2024-03-01',
        status: 'active',
        organization_id: TEST_ORG_ID,
        lifecycle_stage: 'unregistered',
      });
      expect(project.id).toMatch(/^prj-/);

      const audit = await latestAudit(prisma);
      expect(audit).toMatchObject({
        user_id: owner.id,
        user_role: 'project_owner',
        action: 'PROJECT_CREATED',
        entity_type: 'project',
        entity_id: project.id,
        payload: { name: 'Rooftop Solar A' },
        new_value: { name: 'Rooftop Solar A' },
        previous_value: null,
      });
      expect(audit.ip_address).toBeTruthy();
      await expectValidChainTail(prisma);
    });

    it('defaults status to draft (same as the SPA form)', async () => {
      const { status: _s, ...withoutStatus } = VALID_BODY;
      const res = await app.inject({
        method: 'POST', url: '/api/v1/projects', headers: auth(owner.token),
        payload: { ...withoutStatus, name: 'Statusless' },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().project.status).toBe('draft');
    });
  });

  describe('GET /api/v1/projects', () => {
    it('requires auth', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/projects' });
      expect(res.statusCode).toBe(401);
    });

    it('lists only the caller organization projects', async () => {
      const mine = await app.inject({ method: 'GET', url: '/api/v1/projects', headers: auth(owner.token) });
      expect(mine.statusCode).toBe(200);
      expect(mine.json().projects.length).toBeGreaterThan(0);
      for (const p of mine.json().projects) expect(p.organization_id).toBe(TEST_ORG_ID);

      const theirs = await app.inject({ method: 'GET', url: '/api/v1/projects', headers: auth(otherOrgToken) });
      expect(theirs.statusCode).toBe(200);
      expect(theirs.json().projects).toEqual([]);
    });
  });

  describe('PATCH /api/v1/projects/:id', () => {
    let projectId: string;

    beforeAll(async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/projects', headers: auth(owner.token),
        payload: { ...VALID_BODY, name: 'Patch Target' },
      });
      projectId = res.json().project.id;
    });

    it('requires auth and role', async () => {
      const noAuth = await app.inject({
        method: 'PATCH', url: `/api/v1/projects/${projectId}`, payload: { name: 'X' },
      });
      expect(noAuth.statusCode).toBe(401);
      const asVerifier = await app.inject({
        method: 'PATCH', url: `/api/v1/projects/${projectId}`, headers: auth(verifier.token), payload: { name: 'X' },
      });
      expect(asVerifier.statusCode).toBe(403);
    });

    it('404s (envelope) on a missing project', async () => {
      const res = await app.inject({
        method: 'PATCH', url: '/api/v1/projects/prj-nope', headers: auth(owner.token), payload: { name: 'X' },
      });
      expect(res.statusCode).toBe(404);
      expect(res.json().error).toEqual({ code: 'NOT_FOUND', message: 'Project not found' });
    });

    it('404s on another organization project', async () => {
      const res = await app.inject({
        method: 'PATCH', url: `/api/v1/projects/${projectId}`, headers: auth(otherOrgToken), payload: { name: 'Hijack' },
      });
      expect(res.statusCode).toBe(404);
    });

    it('rejects lifecycle_stage (only the PDD workflow moves it)', async () => {
      const res = await app.inject({
        method: 'PATCH', url: `/api/v1/projects/${projectId}`, headers: auth(owner.token),
        payload: { lifecycle_stage: 'registered' },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('VALIDATION_ERROR');
      const row = await prisma.project.findUnique({ where: { id: projectId } });
      expect(row!.lifecycle_stage).toBe('unregistered');
    });

    it('rejects an empty patch', async () => {
      const res = await app.inject({
        method: 'PATCH', url: `/api/v1/projects/${projectId}`, headers: auth(owner.token), payload: {},
      });
      expect(res.statusCode).toBe(400);
    });

    it('updates fields and audits PROJECT_UPDATED with previous/new values', async () => {
      const res = await app.inject({
        method: 'PATCH', url: `/api/v1/projects/${projectId}`, headers: auth(owner.token),
        payload: { name: 'Patched Name', status: 'suspended' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().project).toMatchObject({ name: 'Patched Name', status: 'suspended' });

      const audit = await latestAudit(prisma);
      expect(audit).toMatchObject({
        action: 'PROJECT_UPDATED',
        entity_type: 'project',
        entity_id: projectId,
        payload: { changes: { name: 'Patched Name', status: 'suspended' } },
      });
      const prev = audit.previous_value as Record<string, unknown>;
      const next = audit.new_value as Record<string, unknown>;
      expect(prev.name).toBe('Patch Target');
      expect(next.name).toBe('Patched Name');
      expect(prev.status).toBe('active');
      expect(next.status).toBe('suspended');
      await expectValidChainTail(prisma);
    });
  });
});
