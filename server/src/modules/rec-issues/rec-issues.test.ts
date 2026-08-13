import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { setupTestDatabase, resetDatabase } from '../../test/db.js';
import {
  auth,
  createAdmin,
  createOrg,
  registerUser,
  expectValidChainTail,
  latestAudit,
} from '../../test/fixtures.js';
import { seed } from '../../../prisma/seed.js';
import { buildApp } from '../../app.js';
import { uid } from '../../lib/uid.js';

const REC_ISSUE_PUBLIC_KEYS = [
  'id', 'project_id', 'created_by', 'owner_name', 'assigned_reviewer_name',
  'state', 'request_type', 'period_start', 'period_end',
  'total_production_mwh', 'applied_mwh', 'facility_snapshot',
  'receiving_org_name', 'receiving_account_id', 'evidence_ids',
  'submitted_at', 'issued_at', 'rejection_reason',
];

const FACILITY_SNAPSHOT = {
  evident_org_id: 'EVID-000123',
  organisation_name: 'GreenGrid Asia Co., Ltd.',
  facility_name: 'GGA Rooftop Solar 1',
  fuel_code: 'F01',
  fuel_description: 'Solar',
  technology_code: 'T01',
  technology_description: 'Photovoltaic',
};

describe('rec-issues module', () => {
  let prisma: PrismaClient;
  let app: FastifyInstance;
  let owner: { id: string; token: string };
  let verifier: { id: string; token: string };
  let admin: { id: string; token: string };
  let otherOrgToken: string;
  let recProjectId: string;
  let nonRecProjectId: string;

  beforeAll(async () => {
    const url = await setupTestDatabase();
    prisma = new PrismaClient({ datasourceUrl: url });
    await resetDatabase(prisma);
    await seed(prisma, {});
    app = await buildApp({ prisma });
    owner = await registerUser(app, 'project_owner');
    verifier = await registerUser(app, 'verifier');
    admin = await createAdmin(app, prisma);

    // A second organization to prove org scoping.
    await createOrg(prisma, 'org-0002', 'Other Org');
    await prisma.user.create({
      data: {
        id: 'usr-other-org-rir',
        organization_id: 'org-0002',
        email: 'other-rir@example.com',
        name: 'Other Org Owner',
        role: 'project_owner',
        password_hash: 'not-a-real-hash',
      },
    });
    otherOrgToken = app.jwt.sign({ sub: 'usr-other-org-rir', role: 'project_owner', org: 'org-0002' });

    // REC-registered project: create via API, then insert a `registered` Pdd
    // row directly against meth-rec-solar (faster than walking the full
    // submit → validation flow, and explicitly sanctioned by the plan).
    const recProjectRes = await app.inject({
      method: 'POST', url: '/api/v1/projects', headers: auth(owner.token),
      payload: { name: 'REC Solar Rooftop', location: 'Bangkok, Thailand', capacity_kwp: 500, commission_date: '2024-06-01' },
    });
    recProjectId = recProjectRes.json().project.id as string;
    await prisma.pdd.create({
      data: {
        id: uid('pdd'),
        project_id: recProjectId,
        methodology_id: 'meth-rec-solar',
        methodology_snapshot: 'SF-02 v1.4.1',
        state: 'registered',
        section_data: FACILITY_SNAPSHOT,
        evidence_ids: [],
        assigned_validator_name: 'EGAT (Local Issuer)',
        validated_at: new Date(),
      },
    });

    // Non-REC project (carbon-only) for eligibility 400s — no Pdd at all.
    const nonRecProjectRes = await app.inject({
      method: 'POST', url: '/api/v1/projects', headers: auth(owner.token),
      payload: { name: 'Carbon-only project', location: 'Hanoi, Vietnam', capacity_kwp: 200, commission_date: '2024-01-01' },
    });
    nonRecProjectId = nonRecProjectRes.json().project.id as string;

    // Monitoring records for recProjectId: Jan 1500 + 2500 kWh, Feb 999 kWh.
    await prisma.monitoringRecord.createMany({
      data: [
        { id: uid('mr'), project_id: recProjectId, record_date: '2026-01-01', generation_kwh: 1500, source: 'test-fixture' },
        { id: uid('mr'), project_id: recProjectId, record_date: '2026-01-15', generation_kwh: 2500, source: 'test-fixture' },
        { id: uid('mr'), project_id: recProjectId, record_date: '2026-02-01', generation_kwh: 999, source: 'test-fixture' },
      ],
    });
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function post(url: string, token: string, payload?: Record<string, unknown>) {
    return app.inject({ method: 'POST', url, headers: auth(token), payload: payload ?? {} });
  }
  async function put(url: string, token: string, payload?: Record<string, unknown>) {
    return app.inject({ method: 'PUT', url, headers: auth(token), payload: payload ?? {} });
  }
  async function del(url: string, token: string) {
    return app.inject({ method: 'DELETE', url, headers: auth(token) });
  }

  function createRequest(overrides: Record<string, unknown> = {}, token = owner.token, projectId = recProjectId) {
    return post(`/api/v1/projects/${projectId}/rec-issues`, token, {
      period_start: '2026-01-01',
      period_end: '2026-01-31',
      request_type: 'Normal',
      ...overrides,
    });
  }

  describe('POST /api/v1/projects/:id/rec-issues (create draft)', () => {
    it('creates a draft with server-computed MWh, facility snapshot, and audits REC_ISSUE_CREATED', async () => {
      const res = await createRequest();
      expect(res.statusCode).toBe(201);
      const r = res.json().rec_issue as Record<string, unknown>;
      expect(Object.keys(r).sort()).toEqual([...REC_ISSUE_PUBLIC_KEYS].sort());
      expect(r).toMatchObject({
        project_id: recProjectId,
        created_by: owner.id,
        owner_name: 'Test project_owner',
        assigned_reviewer_name: 'EGAT (Local Issuer)',
        state: 'draft',
        request_type: 'Normal',
        period_start: '2026-01-01',
        period_end: '2026-01-31',
        total_production_mwh: 4,
        applied_mwh: null,
        facility_snapshot: FACILITY_SNAPSHOT,
        receiving_org_name: '',
        receiving_account_id: '',
        evidence_ids: [],
        submitted_at: null,
        issued_at: null,
        rejection_reason: null,
      });
      expect(r.id).toMatch(/^RIR-/);
      expect(await latestAudit(prisma)).toMatchObject({
        action: 'REC_ISSUE_CREATED', entity_type: 'rec_issue', entity_id: r.id,
        new_value: { state: 'draft', total_production_mwh: 4 },
      });
      await expectValidChainTail(prisma);
    });

    it('rejects creation for a project without a registered REC registration (400)', async () => {
      const res = await createRequest({}, owner.token, nonRecProjectId);
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('BAD_REQUEST');
    });

    it('rejects a period with zero production (400)', async () => {
      const res = await createRequest({ period_start: '2025-01-01', period_end: '2025-01-31' });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('BAD_REQUEST');
    });

    it('403s for verifiers and 404s on an unknown project', async () => {
      expect((await createRequest({}, verifier.token)).statusCode).toBe(403);
      const res = await post('/api/v1/projects/prj-nope/rec-issues', owner.token, {
        period_start: '2026-01-01', period_end: '2026-01-31', request_type: 'Normal',
      });
      expect(res.statusCode).toBe(404);
    });

    it('requires auth', async () => {
      const res = await app.inject({ method: 'POST', url: `/api/v1/projects/${recProjectId}/rec-issues`, payload: {} });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('MWh rounding (6 dp)', () => {
    it('rounds 1 kWh in an isolated period to 0.001 MWh', async () => {
      await prisma.monitoringRecord.create({
        data: { id: uid('mr'), project_id: recProjectId, record_date: '2027-05-01', generation_kwh: 1, source: 'test-fixture' },
      });
      const res = await createRequest({ period_start: '2027-05-01', period_end: '2027-05-31' });
      expect(res.statusCode).toBe(201);
      expect(res.json().rec_issue.total_production_mwh).toBe(0.001);
    });

    it('rounds 1234.5678 kWh in an isolated period to 1.234568 MWh (6dp round)', async () => {
      await prisma.monitoringRecord.create({
        data: { id: uid('mr'), project_id: recProjectId, record_date: '2027-06-01', generation_kwh: 1234.5678, source: 'test-fixture' },
      });
      const res = await createRequest({ period_start: '2027-06-01', period_end: '2027-06-30' });
      expect(res.statusCode).toBe(201);
      expect(res.json().rec_issue.total_production_mwh).toBe(1.234568);
    });
  });

  describe('PUT /api/v1/rec-issues/:id (draft recompute + freeze validation)', () => {
    it('recomputes MWh when a draft period changes', async () => {
      const created = await createRequest();
      const id = created.json().rec_issue.id as string;
      const res = await put(`/api/v1/rec-issues/${id}`, owner.token, {
        period_start: '2026-01-01', period_end: '2026-02-28',
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().rec_issue.total_production_mwh).toBe(4.999);
    });

    it('rejects applied_mwh greater than total on submit (400)', async () => {
      const created = await createRequest();
      const id = created.json().rec_issue.id as string;
      await put(`/api/v1/rec-issues/${id}`, owner.token, {
        applied_mwh: 100, receiving_org_name: 'Buyer Co', receiving_account_id: 'ACC-1',
      });
      const res = await post(`/api/v1/rec-issues/${id}/submit`, owner.token);
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('BAD_REQUEST');
    });
  });

  describe('submit / approve / reject', () => {
    it('submit without receiving fields is 400; after filling them → 200, freezes totals, audits REC_ISSUE_SUBMITTED', async () => {
      const created = await createRequest();
      const id = created.json().rec_issue.id as string;

      const badSubmit = await post(`/api/v1/rec-issues/${id}/submit`, owner.token);
      expect(badSubmit.statusCode).toBe(400);
      expect(badSubmit.json().error.code).toBe('BAD_REQUEST');

      await put(`/api/v1/rec-issues/${id}`, owner.token, {
        receiving_org_name: 'Buyer Co', receiving_account_id: 'ACC-1',
      });
      const res = await post(`/api/v1/rec-issues/${id}/submit`, owner.token);
      expect(res.statusCode).toBe(200);
      const r = res.json().rec_issue as Record<string, unknown>;
      expect(r.state).toBe('submitted');
      expect(r.total_production_mwh).toBe(4);
      expect(r.submitted_at).toBeTruthy();
      expect(await latestAudit(prisma)).toMatchObject({
        action: 'REC_ISSUE_SUBMITTED', entity_type: 'rec_issue', entity_id: id,
      });
      await expectValidChainTail(prisma);
    });

    async function requestIn(state: 'submitted', overrides: Record<string, unknown> = {}): Promise<string> {
      const created = await createRequest(overrides);
      const id = created.json().rec_issue.id as string;
      await put(`/api/v1/rec-issues/${id}`, owner.token, {
        receiving_org_name: 'Buyer Co', receiving_account_id: 'ACC-1',
      });
      expect((await post(`/api/v1/rec-issues/${id}/submit`, owner.token)).statusCode).toBe(200);
      return id;
    }

    it('approve → issued with issued_at set; audits REC_ISSUE_ISSUED (verifier token)', async () => {
      const id = await requestIn('submitted');
      const res = await post(`/api/v1/rec-issues/${id}/approve`, verifier.token);
      expect(res.statusCode).toBe(200);
      const r = res.json().rec_issue as Record<string, unknown>;
      expect(r.state).toBe('issued');
      expect(r.issued_at).toBeTruthy();
      expect(await latestAudit(prisma)).toMatchObject({
        action: 'REC_ISSUE_ISSUED', entity_type: 'rec_issue', entity_id: id,
      });
      await expectValidChainTail(prisma);
    });

    it('reject requires a reason and sets rejection_reason (verifier token)', async () => {
      const id = await requestIn('submitted');
      const missing = await post(`/api/v1/rec-issues/${id}/reject`, verifier.token, {});
      expect(missing.statusCode).toBe(400);

      const res = await post(`/api/v1/rec-issues/${id}/reject`, verifier.token, {
        reason: 'Production period overlaps another claim.',
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().rec_issue).toMatchObject({
        state: 'rejected', rejection_reason: 'Production period overlaps another claim.',
      });
      expect(await latestAudit(prisma)).toMatchObject({
        action: 'REC_ISSUE_REJECTED', entity_type: 'rec_issue', entity_id: id,
      });
      await expectValidChainTail(prisma);
    });

    it('409 CONFLICT on illegal transitions (submit a submitted; approve a draft)', async () => {
      const submittedId = await requestIn('submitted');
      const reSubmit = await post(`/api/v1/rec-issues/${submittedId}/submit`, owner.token);
      expect(reSubmit.statusCode).toBe(409);
      expect(reSubmit.json().error.code).toBe('CONFLICT');

      const draft = await createRequest();
      const draftId = draft.json().rec_issue.id as string;
      const approveDraft = await post(`/api/v1/rec-issues/${draftId}/approve`, verifier.token);
      expect(approveDraft.statusCode).toBe(409);
      expect(approveDraft.json().error.code).toBe('CONFLICT');

      const rejectDraft = await post(`/api/v1/rec-issues/${draftId}/reject`, verifier.token, { reason: 'r' });
      expect(rejectDraft.statusCode).toBe(409);
    });

    it('403 FORBIDDEN: owner cannot approve; verifier cannot create', async () => {
      const id = await requestIn('submitted');
      const ownerApprove = await post(`/api/v1/rec-issues/${id}/approve`, owner.token);
      expect(ownerApprove.statusCode).toBe(403);
      expect(ownerApprove.json().error.code).toBe('FORBIDDEN');

      const ownerReject = await post(`/api/v1/rec-issues/${id}/reject`, owner.token, { reason: 'r' });
      expect(ownerReject.statusCode).toBe(403);

      const verifierCreate = await createRequest({}, verifier.token);
      expect(verifierCreate.statusCode).toBe(403);
      expect(verifierCreate.json().error.code).toBe('FORBIDDEN');

      // Admin passes both guards.
      const draft = await createRequest();
      const draftId = draft.json().rec_issue.id as string;
      await put(`/api/v1/rec-issues/${draftId}`, owner.token, {
        receiving_org_name: 'Buyer Co', receiving_account_id: 'ACC-1',
      });
      await post(`/api/v1/rec-issues/${draftId}/submit`, owner.token);
      expect((await post(`/api/v1/rec-issues/${draftId}/approve`, admin.token)).statusCode).toBe(200);
    });
  });

  describe('cross-org isolation', () => {
    it('requests are invisible (404) to another organization', async () => {
      const created = await createRequest();
      const id = created.json().rec_issue.id as string;

      const list = await app.inject({
        method: 'GET', url: `/api/v1/projects/${recProjectId}/rec-issues`, headers: auth(otherOrgToken),
      });
      expect(list.statusCode).toBe(200);
      expect(list.json().rec_issues).toEqual([]);

      const submit = await post(`/api/v1/rec-issues/${id}/submit`, otherOrgToken);
      expect(submit.statusCode).toBe(404);

      const del404 = await del(`/api/v1/rec-issues/${id}`, otherOrgToken);
      expect(del404.statusCode).toBe(404);
    });
  });

  describe('DELETE /api/v1/rec-issues/:id', () => {
    it('removes a draft only; audits REC_ISSUE_DELETED; 409 on submitted', async () => {
      const created = await createRequest();
      const id = created.json().rec_issue.id as string;
      const res = await del(`/api/v1/rec-issues/${id}`, owner.token);
      expect(res.statusCode).toBe(204);
      expect(await latestAudit(prisma)).toMatchObject({
        action: 'REC_ISSUE_DELETED', entity_type: 'rec_issue', entity_id: id,
      });
      await expectValidChainTail(prisma);
      const gone = await prisma.recIssueRequest.findUnique({ where: { id } });
      expect(gone).toBeNull();

      const submittedCreated = await createRequest();
      const submittedId = submittedCreated.json().rec_issue.id as string;
      await put(`/api/v1/rec-issues/${submittedId}`, owner.token, {
        receiving_org_name: 'Buyer Co', receiving_account_id: 'ACC-1',
      });
      await post(`/api/v1/rec-issues/${submittedId}/submit`, owner.token);
      const conflict = await del(`/api/v1/rec-issues/${submittedId}`, owner.token);
      expect(conflict.statusCode).toBe(409);
      expect(conflict.json().error.code).toBe('CONFLICT');
    });
  });

  describe('reads', () => {
    it('GET /projects/:id/rec-issues and GET /rec-issues list org-scoped requests', async () => {
      await createRequest();

      const byProject = await app.inject({
        method: 'GET', url: `/api/v1/projects/${recProjectId}/rec-issues`, headers: auth(owner.token),
      });
      expect(byProject.statusCode).toBe(200);
      const projectRows = byProject.json().rec_issues as Array<{ project_id: string }>;
      expect(projectRows.length).toBeGreaterThan(0);
      for (const r of projectRows) expect(r.project_id).toBe(recProjectId);

      const all = await app.inject({
        method: 'GET', url: '/api/v1/rec-issues', headers: auth(verifier.token),
      });
      expect(all.statusCode).toBe(200);
      expect((all.json().rec_issues as unknown[]).length).toBeGreaterThan(0);
    });

    it('requires auth', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/rec-issues' });
      expect(res.statusCode).toBe(401);
    });
  });
});
