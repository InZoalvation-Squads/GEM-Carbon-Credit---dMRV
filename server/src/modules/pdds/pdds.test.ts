import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { setupTestDatabase, resetDatabase } from '../../test/db.js';
import {
  auth,
  createAdmin,
  registerUser,
  expectValidChainTail,
  latestAudit,
} from '../../test/fixtures.js';
import { seed } from '../../../prisma/seed.js';
import { buildApp } from '../../app.js';
import { pddContentHash, verifyDisclosedValue } from '../../lib/pdd.js';
import { projectTopicId, toIpfsCid } from '../../lib/guardian-sim.js';

const SOLAR = 'meth-tver-solar';
const WIND = 'meth-tver-wind';

// Same shape as the SPA seed's SOLAR_SECTION_DATA — passes validatePdd for
// T-VER-S-01 v3.0 and publishes both sensitive fields (investment_metric via
// its showIf on barrier_type = Investment, and barrier_explanation).
const SOLAR_SECTION_DATA = {
  technology: 'Solar PV rooftop', grid_connection: 'Grid-connected',
  baseline_scenario: 'Grid electricity displaced by on-site solar generation',
  barrier_type: 'Investment', investment_metric: 'IRR',
  barrier_explanation: 'Project IRR without carbon revenue is below the developer hurdle rate.',
  common_practice: true, performance_ratio: 0.8,
  monitored_parameter: 'EG_PJ', measurement_method: 'Revenue-grade bi-directional meter',
  monitoring_frequency: 'Monthly', qaqc_procedure: 'Monthly meter reads cross-checked against utility bill.',
};

const PDD_PUBLIC_KEYS = [
  'id', 'project_id', 'methodology_id', 'methodology_snapshot', 'state',
  'section_data', 'evidence_ids', 'assigned_validator_name', 'submitted_at',
  'validated_at', 'content_hash', 'ipfs_cid', 'credential_id', 'rejection_reason',
];

describe('pdds module', () => {
  let prisma: PrismaClient;
  let app: FastifyInstance;
  let owner: { id: string; token: string };
  let verifier: { id: string; token: string };
  let admin: { id: string; token: string };

  beforeAll(async () => {
    const url = await setupTestDatabase();
    prisma = new PrismaClient({ datasourceUrl: url });
    await resetDatabase(prisma);
    await seed(prisma, {});
    app = await buildApp({ prisma });
    owner = await registerUser(app, 'project_owner');
    verifier = await registerUser(app, 'verifier');
    admin = await createAdmin(app, prisma);
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function createProject(name: string): Promise<string> {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/projects', headers: auth(owner.token),
      payload: { name, location: 'Chiang Mai, Thailand', capacity_kwp: 100, commission_date: '2024-01-01' },
    });
    expect(res.statusCode).toBe(201);
    return res.json().project.id as string;
  }

  async function selectMethodology(projectId: string, methodologyId = SOLAR, token = owner.token) {
    return app.inject({
      method: 'POST', url: `/api/v1/projects/${projectId}/pdd`,
      headers: auth(token), payload: { methodology_id: methodologyId },
    });
  }

  async function post(url: string, token: string, payload?: Record<string, unknown>) {
    return app.inject({ method: 'POST', url, headers: auth(token), payload: payload ?? {} });
  }

  async function saveDraft(pddId: string, sectionData: Record<string, unknown>, token = owner.token) {
    return app.inject({
      method: 'PUT', url: `/api/v1/pdds/${pddId}/draft`, headers: auth(token),
      payload: { section_data: sectionData, evidence_ids: [] },
    });
  }

  async function lifecycleOf(projectId: string): Promise<string> {
    const row = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
    return row.lifecycle_stage;
  }

  /** Walk a fresh PDD to under_validation with the given section data. */
  async function pddUnderValidation(sectionData: Record<string, unknown>): Promise<{ projectId: string; pddId: string }> {
    const projectId = await createProject(`Gate1 ${Date.now()}-${Math.random()}`);
    const created = await selectMethodology(projectId);
    const pddId = created.json().pdd.id as string;
    expect((await saveDraft(pddId, sectionData)).statusCode).toBe(200);
    expect((await post(`/api/v1/pdds/${pddId}/submit`, owner.token)).statusCode).toBe(200);
    expect((await post(`/api/v1/pdds/${pddId}/start-validation`, verifier.token)).statusCode).toBe(200);
    return { projectId, pddId };
  }

  describe('selectMethodology (POST /api/v1/projects/:id/pdd)', () => {
    it('requires auth', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/projects/prj-x/pdd', payload: { methodology_id: SOLAR },
      });
      expect(res.statusCode).toBe(401);
    });

    it('rejects verifiers (proponent-side action)', async () => {
      const projectId = await createProject('RoleGuard select');
      const res = await selectMethodology(projectId, SOLAR, verifier.token);
      expect(res.statusCode).toBe(403);
    });

    it('404s on unknown project and unknown methodology', async () => {
      expect((await selectMethodology('prj-nope')).statusCode).toBe(404);
      const projectId = await createProject('Unknown methodology');
      expect((await selectMethodology(projectId, 'meth-nope')).statusCode).toBe(404);
    });

    it('creates a draft PDD, flips lifecycle to pdd_draft and audits METHODOLOGY_SELECTED', async () => {
      const projectId = await createProject('Create draft');
      const res = await selectMethodology(projectId);
      expect(res.statusCode).toBe(201);
      const pdd = res.json().pdd as Record<string, unknown>;
      expect(Object.keys(pdd).sort()).toEqual([...PDD_PUBLIC_KEYS].sort());
      expect(pdd).toMatchObject({
        project_id: projectId,
        methodology_id: SOLAR,
        methodology_snapshot: '',
        state: 'draft',
        section_data: {},
        evidence_ids: [],
        assigned_validator_name: 'Daniel Okoye',
        submitted_at: null,
        content_hash: null,
        ipfs_cid: null,
        credential_id: null,
      });
      expect(pdd.id).toMatch(/^PDD-/);
      expect(await lifecycleOf(projectId)).toBe('pdd_draft');

      const audit = await latestAudit(prisma);
      expect(audit).toMatchObject({
        user_id: owner.id,
        action: 'METHODOLOGY_SELECTED',
        entity_type: 'pdd',
        entity_id: pdd.id,
        payload: { project_id: projectId, methodology_id: SOLAR },
        new_value: { state: 'draft' },
      });
    });

    it('switches methodology on an editable PDD (with audit), no-ops when unchanged', async () => {
      const projectId = await createProject('Switch methodology');
      const created = await selectMethodology(projectId);
      const pddId = created.json().pdd.id as string;

      const switched = await selectMethodology(projectId, WIND);
      expect(switched.statusCode).toBe(200);
      expect(switched.json().pdd).toMatchObject({ id: pddId, methodology_id: WIND });
      const audit = await latestAudit(prisma);
      expect(audit).toMatchObject({
        action: 'METHODOLOGY_SELECTED',
        entity_id: pddId,
        payload: { project_id: projectId, methodology_id: WIND },
        previous_value: { methodology_id: SOLAR },
        new_value: { methodology_id: WIND },
      });

      // Unchanged methodology → returns existing, writes no audit.
      const before = await prisma.auditLog.count();
      const same = await selectMethodology(projectId, WIND);
      expect(same.statusCode).toBe(200);
      expect(same.json().pdd).toMatchObject({ id: pddId, methodology_id: WIND });
      expect(await prisma.auditLog.count()).toBe(before);
    });

    it('does not switch methodology once the PDD left the editable states', async () => {
      const projectId = await createProject('No switch after submit');
      const created = await selectMethodology(projectId);
      const pddId = created.json().pdd.id as string;
      await saveDraft(pddId, SOLAR_SECTION_DATA);
      await post(`/api/v1/pdds/${pddId}/submit`, owner.token);

      const before = await prisma.auditLog.count();
      const res = await selectMethodology(projectId, WIND);
      expect(res.statusCode).toBe(200);
      // SPA behavior: returns the existing PDD untouched, no audit.
      expect(res.json().pdd).toMatchObject({ id: pddId, methodology_id: SOLAR, state: 'submitted' });
      expect(await prisma.auditLog.count()).toBe(before);
    });
  });

  describe('savePddDraft (PUT /api/v1/pdds/:id/draft)', () => {
    it('saves section data + evidence ids WITHOUT writing an audit row', async () => {
      const projectId = await createProject('Draft save');
      const created = await selectMethodology(projectId);
      const pddId = created.json().pdd.id as string;

      const before = await prisma.auditLog.count();
      const res = await saveDraft(pddId, SOLAR_SECTION_DATA);
      expect(res.statusCode).toBe(200);
      expect(res.json().pdd.section_data).toEqual(SOLAR_SECTION_DATA);
      // Draft autosave is intentionally unaudited (same as the SPA store).
      expect(await prisma.auditLog.count()).toBe(before);
    });

    it('403s for verifiers and 409s once the PDD is submitted', async () => {
      const projectId = await createProject('Draft guards');
      const created = await selectMethodology(projectId);
      const pddId = created.json().pdd.id as string;

      expect((await saveDraft(pddId, SOLAR_SECTION_DATA, verifier.token)).statusCode).toBe(403);
      await post(`/api/v1/pdds/${pddId}/submit`, owner.token);
      const res = await saveDraft(pddId, SOLAR_SECTION_DATA);
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe('CONFLICT');
    });
  });

  describe('Gate 1 state machine', () => {
    it('walks draft → submitted → under_validation → revision_required → … → registered', async () => {
      const projectId = await createProject('Happy path');
      const created = await selectMethodology(projectId);
      const pddId = created.json().pdd.id as string;
      await saveDraft(pddId, SOLAR_SECTION_DATA);

      // Submit: snapshots "CODE version", project → under_validation.
      const submitted = await post(`/api/v1/pdds/${pddId}/submit`, owner.token);
      expect(submitted.statusCode).toBe(200);
      expect(submitted.json().pdd).toMatchObject({
        state: 'submitted', methodology_snapshot: 'T-VER-S-01 v3.0',
      });
      const submittedAt = submitted.json().pdd.submitted_at as string;
      expect(submittedAt).toBeTruthy();
      expect(await lifecycleOf(projectId)).toBe('under_validation');
      expect(await latestAudit(prisma)).toMatchObject({
        action: 'PDD_SUBMITTED', entity_type: 'pdd', entity_id: pddId,
        payload: { methodology: 'T-VER-S-01 v3.0' },
        previous_value: { state: 'draft' }, new_value: { state: 'submitted' },
      });

      // Start validation (verifier).
      const started = await post(`/api/v1/pdds/${pddId}/start-validation`, verifier.token);
      expect(started.statusCode).toBe(200);
      expect(started.json().pdd.state).toBe('under_validation');
      expect(await latestAudit(prisma)).toMatchObject({
        action: 'VALIDATION_STARTED', entity_id: pddId, payload: {},
        previous_value: { state: 'submitted' }, new_value: { state: 'under_validation' },
      });

      // Request revision: back to the proponent, project → pdd_draft.
      const revision = await post(`/api/v1/pdds/${pddId}/request-revision`, verifier.token, {
        summary: 'Clarify the QA/QC procedure.',
      });
      expect(revision.statusCode).toBe(200);
      expect(revision.json().pdd).toMatchObject({
        state: 'revision_required', rejection_reason: 'Clarify the QA/QC procedure.',
      });
      expect(await lifecycleOf(projectId)).toBe('pdd_draft');
      expect(await latestAudit(prisma)).toMatchObject({
        action: 'PDD_REVISION_REQUESTED', entity_id: pddId,
        payload: { summary: 'Clarify the QA/QC procedure.' },
        previous_value: { state: 'under_validation' },
        new_value: { state: 'revision_required', summary: 'Clarify the QA/QC procedure.' },
      });

      // Revision_required is editable → save + resubmit (submitted_at is kept).
      expect((await saveDraft(pddId, SOLAR_SECTION_DATA)).statusCode).toBe(200);
      const resubmitted = await post(`/api/v1/pdds/${pddId}/submit`, owner.token);
      expect(resubmitted.statusCode).toBe(200);
      expect(resubmitted.json().pdd.submitted_at).toBe(submittedAt);
      await post(`/api/v1/pdds/${pddId}/start-validation`, verifier.token);

      // Register (verifier): freezes hash/CID, salts, flips lifecycle.
      const registered = await post(`/api/v1/pdds/${pddId}/register`, verifier.token);
      expect(registered.statusCode).toBe(200);
      const body = registered.json() as {
        pdd: Record<string, unknown>;
        disclosure: { disclosed: Record<string, unknown>; redacted: Array<{ key: string; value_hash: string }> };
        disclosure_salts: Record<string, string>;
      };
      const expectedHash = pddContentHash({
        methodology_snapshot: 'T-VER-S-01 v3.0',
        section_data: SOLAR_SECTION_DATA,
        evidence_ids: [],
      });
      expect(body.pdd).toMatchObject({
        state: 'registered',
        content_hash: expectedHash,
        ipfs_cid: toIpfsCid(expectedHash),
        credential_id: null, // the browser signs + POSTs the VC in Task 8
      });
      expect(body.pdd.validated_at).toBeTruthy();
      expect(await lifecycleOf(projectId)).toBe('registered');

      // Selective disclosure: both sensitive solar fields are redacted …
      expect(body.disclosure.redacted.map((r) => r.key)).toEqual([
        'barrier_explanation', 'investment_metric',
      ]);
      expect(body.disclosure.disclosed).not.toHaveProperty('barrier_explanation');
      expect(body.disclosure.disclosed).toMatchObject({ technology: 'Solar PV rooftop' });
      // … the salts are returned HERE (and only here), one 16-byte hex per field …
      expect(Object.keys(body.disclosure_salts).sort()).toEqual([
        'barrier_explanation', 'investment_metric',
      ]);
      for (const salt of Object.values(body.disclosure_salts)) {
        expect(salt).toMatch(/^[0-9a-f]{32}$/);
      }
      // … and value + salt verify offline against the published hashes.
      for (const { key, value_hash } of body.disclosure.redacted) {
        expect(verifyDisclosedValue(
          SOLAR_SECTION_DATA[key as keyof typeof SOLAR_SECTION_DATA],
          body.disclosure_salts[key]!,
          value_hash,
        )).toBe(true);
      }
      expect(verifyDisclosedValue(
        'wrong value', body.disclosure_salts.investment_metric!,
        body.disclosure.redacted.find((r) => r.key === 'investment_metric')!.value_hash,
      )).toBe(false);

      // The register response's pdd object itself never carries the salts.
      expect(body.pdd).not.toHaveProperty('disclosure_salts');

      expect(await latestAudit(prisma)).toMatchObject({
        user_id: verifier.id,
        action: 'PROJECT_REGISTERED', entity_type: 'pdd', entity_id: pddId,
        payload: {
          methodology: 'T-VER-S-01 v3.0',
          ipfs_cid: toIpfsCid(expectedHash),
          topic_id: projectTopicId(projectId),
        },
        previous_value: { state: 'under_validation' },
        new_value: { state: 'registered', content_hash: expectedHash, ipfs_cid: toIpfsCid(expectedHash) },
      });
      await expectValidChainTail(prisma);

      // disclosure_salts are persisted but NEVER surface in any GET.
      const row = await prisma.pdd.findUniqueOrThrow({ where: { id: pddId } });
      expect(row.disclosure_salts).toEqual(body.disclosure_salts);
      for (const url of [
        `/api/v1/pdds/${pddId}`,
        `/api/v1/projects/${projectId}/pdd`,
        '/api/v1/pdds?state=registered',
      ]) {
        const res = await app.inject({ method: 'GET', url, headers: auth(owner.token) });
        expect(res.statusCode).toBe(200);
        expect(res.body).not.toContain('disclosure_salts');
        expect(res.body).not.toContain(body.disclosure_salts.investment_metric!);
      }
    });

    it('register 422s with the missing-field list when validatePdd fails', async () => {
      const { qaqc_procedure: _q, barrier_explanation: _b, ...incomplete } = SOLAR_SECTION_DATA;
      const { pddId } = await pddUnderValidation(incomplete);
      const res = await post(`/api/v1/pdds/${pddId}/register`, verifier.token);
      expect(res.statusCode).toBe(422);
      const { code, message } = res.json().error;
      expect(code).toBe('UNPROCESSABLE');
      expect(message).toContain('barrier_explanation');
      expect(message).toContain('qaqc_procedure');
      // Nothing was frozen.
      const row = await prisma.pdd.findUniqueOrThrow({ where: { id: pddId } });
      expect(row.state).toBe('under_validation');
      expect(row.content_hash).toBeNull();
      expect(row.disclosure_salts).toBeNull();
    });

    it('reject flow: under_validation → rejected flips the project too', async () => {
      const { projectId, pddId } = await pddUnderValidation(SOLAR_SECTION_DATA);
      const res = await post(`/api/v1/pdds/${pddId}/reject`, verifier.token, {
        reason: 'Baseline scenario is not credible.',
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().pdd).toMatchObject({
        state: 'rejected', rejection_reason: 'Baseline scenario is not credible.',
      });
      expect(await lifecycleOf(projectId)).toBe('rejected');
      expect(await latestAudit(prisma)).toMatchObject({
        action: 'PDD_REJECTED', entity_id: pddId,
        payload: { reason: 'Baseline scenario is not credible.' },
        previous_value: { state: 'under_validation' },
        new_value: { state: 'rejected', reason: 'Baseline scenario is not credible.' },
      });
      await expectValidChainTail(prisma);
    });

    it('409s every illegal transition', async () => {
      const projectId = await createProject('Illegal transitions');
      const created = await selectMethodology(projectId);
      const pddId = created.json().pdd.id as string;
      await saveDraft(pddId, SOLAR_SECTION_DATA);

      const expect409 = async (url: string, token: string, payload?: Record<string, unknown>) => {
        const res = await post(url, token, payload);
        expect(res.statusCode).toBe(409);
        expect(res.json().error.code).toBe('CONFLICT');
      };

      // From draft: only submit is legal.
      await expect409(`/api/v1/pdds/${pddId}/start-validation`, verifier.token);
      await expect409(`/api/v1/pdds/${pddId}/request-revision`, verifier.token, { summary: 's' });
      await expect409(`/api/v1/pdds/${pddId}/register`, verifier.token);
      await expect409(`/api/v1/pdds/${pddId}/reject`, verifier.token, { reason: 'r' });

      // From submitted: only start-validation is legal.
      await post(`/api/v1/pdds/${pddId}/submit`, owner.token);
      await expect409(`/api/v1/pdds/${pddId}/submit`, owner.token);
      await expect409(`/api/v1/pdds/${pddId}/request-revision`, verifier.token, { summary: 's' });
      await expect409(`/api/v1/pdds/${pddId}/register`, verifier.token);
      await expect409(`/api/v1/pdds/${pddId}/reject`, verifier.token, { reason: 'r' });

      // From under_validation: submit / start-validation are illegal.
      await post(`/api/v1/pdds/${pddId}/start-validation`, verifier.token);
      await expect409(`/api/v1/pdds/${pddId}/submit`, owner.token);
      await expect409(`/api/v1/pdds/${pddId}/start-validation`, verifier.token);

      // Terminal: registered accepts nothing.
      await post(`/api/v1/pdds/${pddId}/register`, verifier.token);
      await expect409(`/api/v1/pdds/${pddId}/submit`, owner.token);
      await expect409(`/api/v1/pdds/${pddId}/start-validation`, verifier.token);
      await expect409(`/api/v1/pdds/${pddId}/request-revision`, verifier.token, { summary: 's' });
      await expect409(`/api/v1/pdds/${pddId}/register`, verifier.token);
      await expect409(`/api/v1/pdds/${pddId}/reject`, verifier.token, { reason: 'r' });
    });

    it('enforces the validator-side role guards (and admin passes them)', async () => {
      const projectId = await createProject('Role guards');
      const created = await selectMethodology(projectId);
      const pddId = created.json().pdd.id as string;
      await saveDraft(pddId, SOLAR_SECTION_DATA);

      // Owner cannot act as validator.
      for (const url of ['start-validation', 'request-revision', 'register', 'reject']) {
        const res = await post(`/api/v1/pdds/${pddId}/${url}`, owner.token, { summary: 's', reason: 'r' });
        expect(res.statusCode).toBe(403);
        expect(res.json().error.code).toBe('FORBIDDEN');
      }
      // Verifier cannot submit (proponent-side action).
      expect((await post(`/api/v1/pdds/${pddId}/submit`, verifier.token)).statusCode).toBe(403);

      // Admin passes the validator guard (Standard Registry).
      await post(`/api/v1/pdds/${pddId}/submit`, owner.token);
      const res = await post(`/api/v1/pdds/${pddId}/start-validation`, admin.token);
      expect(res.statusCode).toBe(200);
    });
  });

  describe('comments', () => {
    it('adds a section-anchored comment with COMMENT_ADDED audit (entity pdd)', async () => {
      const { pddId } = await pddUnderValidation(SOLAR_SECTION_DATA);
      const res = await post(`/api/v1/pdds/${pddId}/comments`, verifier.token, {
        body: 'Please justify the performance ratio.', section_key: 'ghg_reduction',
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().comment).toMatchObject({
        verification_id: pddId,
        evidence_id: null,
        section_key: 'ghg_reduction',
        author_id: verifier.id,
        author_name: 'Test verifier',
        author_role: 'verifier',
        body: 'Please justify the performance ratio.',
      });
      expect(await latestAudit(prisma)).toMatchObject({
        action: 'COMMENT_ADDED', entity_type: 'pdd', entity_id: pddId,
        payload: { section: 'ghg_reduction' },
        new_value: { body: 'Please justify the performance ratio.' },
      });

      // Package-level comment (no section) → empty payload; owner can reply.
      const reply = await post(`/api/v1/pdds/${pddId}/comments`, owner.token, {
        body: 'PR follows the manufacturer datasheet.',
      });
      expect(reply.statusCode).toBe(201);
      expect((await latestAudit(prisma)).payload).toEqual({});

      // Detail GET returns the thread in order.
      const detail = await app.inject({
        method: 'GET', url: `/api/v1/pdds/${pddId}`, headers: auth(owner.token),
      });
      expect(detail.statusCode).toBe(200);
      const comments = detail.json().comments as Array<{ body: string }>;
      expect(comments.map((c) => c.body)).toEqual([
        'Please justify the performance ratio.',
        'PR follows the manufacturer datasheet.',
      ]);
      await expectValidChainTail(prisma);
    });
  });

  describe('reads', () => {
    it('GET /api/v1/pdds without a filter is the validation queue (in-flight states only)', async () => {
      // Ensure at least one in-flight PDD exists.
      await pddUnderValidation(SOLAR_SECTION_DATA);
      const res = await app.inject({
        method: 'GET', url: '/api/v1/pdds', headers: auth(verifier.token),
      });
      expect(res.statusCode).toBe(200);
      const pdds = res.json().pdds as Array<{ state: string }>;
      expect(pdds.length).toBeGreaterThan(0);
      for (const p of pdds) {
        expect(['submitted', 'under_validation', 'revision_required']).toContain(p.state);
      }
      expect(res.body).not.toContain('disclosure_salts');
    });

    it('GET /api/v1/pdds?state= filters to one state', async () => {
      const res = await app.inject({
        method: 'GET', url: '/api/v1/pdds?state=registered', headers: auth(verifier.token),
      });
      expect(res.statusCode).toBe(200);
      const pdds = res.json().pdds as Array<{ state: string }>;
      expect(pdds.length).toBeGreaterThan(0);
      for (const p of pdds) expect(p.state).toBe('registered');
    });

    it('GET /api/v1/projects/:id/pdd returns the project PDD; 404 when none', async () => {
      const { projectId, pddId } = await pddUnderValidation(SOLAR_SECTION_DATA);
      const res = await app.inject({
        method: 'GET', url: `/api/v1/projects/${projectId}/pdd`, headers: auth(owner.token),
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().pdd.id).toBe(pddId);

      const bare = await createProject('No PDD yet');
      const none = await app.inject({
        method: 'GET', url: `/api/v1/projects/${bare}/pdd`, headers: auth(owner.token),
      });
      expect(none.statusCode).toBe(404);
    });

    it('404s on an unknown PDD id and requires auth on reads', async () => {
      const unknown = await app.inject({
        method: 'GET', url: '/api/v1/pdds/PDD-nope', headers: auth(owner.token),
      });
      expect(unknown.statusCode).toBe(404);
      expect((await app.inject({ method: 'GET', url: '/api/v1/pdds' })).statusCode).toBe(401);
    });
  });
});
