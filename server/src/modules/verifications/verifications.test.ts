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
import { shortHash } from '../../lib/hash.js';
import { uid } from '../../lib/uid.js';

const FACTORS_SNAPSHOT = 'MoEnCo 2025-v1 · 0.4999 kgCO₂e/kWh';
const DEFAULT_CATEGORIES = ['meter_reading', 'utility_bill', 'commissioning_report', 'site_photo'];

const VERIFICATION_PUBLIC_KEYS = [
  'id', 'project_id', 'created_by', 'owner_name', 'assigned_verifier_name', 'state',
  'monitoring_period_start', 'monitoring_period_end', 'reduction_kgco2e',
  'factors_snapshot', 'evidence_ids', 'required_categories', 'submitted_at',
  'locked_at', 'sla_target_days', 'rejection_reason', 'hash_value',
  'credential_id', 'anchored_at', 'hcs_topic_id', 'hcs_sequence_number',
];

describe('verifications module', () => {
  let prisma: PrismaClient;
  let app: FastifyInstance;
  let owner: { id: string; token: string };
  let verifier: { id: string; token: string };
  let admin: { id: string; token: string };
  let otherOrgToken: string;
  let projectId: string;

  beforeAll(async () => {
    const url = await setupTestDatabase();
    prisma = new PrismaClient({ datasourceUrl: url });
    await resetDatabase(prisma);
    await seed(prisma, {});
    app = await buildApp({ prisma });
    owner = await registerUser(app, 'project_owner');
    verifier = await registerUser(app, 'verifier');
    admin = await createAdmin(app, prisma);

    // A second organization to prove org scoping (registration always joins
    // the first org, so build this user directly).
    await createOrg(prisma, 'org-0002', 'Other Org');
    await prisma.user.create({
      data: {
        id: 'usr-other-org-vr',
        organization_id: 'org-0002',
        email: 'other-vr@example.com',
        name: 'Other Org Owner',
        role: 'project_owner',
        password_hash: 'not-a-real-hash',
      },
    });
    otherOrgToken = app.jwt.sign({ sub: 'usr-other-org-vr', role: 'project_owner', org: 'org-0002' });

    const res = await app.inject({
      method: 'POST', url: '/api/v1/projects', headers: auth(owner.token),
      payload: { name: 'MRV project', location: 'Bangkok, Thailand', capacity_kwp: 500, commission_date: '2024-06-01' },
    });
    projectId = res.json().project.id as string;
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function insertEvidence(fileName: string, forProject = projectId): Promise<string> {
    const id = uid('ev');
    await prisma.evidenceFile.create({
      data: {
        id, project_id: forProject, category: 'meter_reading', file_name: fileName,
        kind: 'pdf', file_size: 1234, version_number: 1, status: 'active',
        content_hash: `sha256-${'0'.repeat(64)}`, uploaded_by: owner.id,
        uploaded_by_name: 'Test project_owner',
      },
    });
    return id;
  }

  async function post(url: string, token: string, payload?: Record<string, unknown>) {
    return app.inject({ method: 'POST', url, headers: auth(token), payload: payload ?? {} });
  }

  async function createPackage(overrides: Record<string, unknown> = {}, token = owner.token) {
    return post('/api/v1/verifications', token, {
      project_id: projectId,
      monitoring_period_start: '2026-03-01',
      monitoring_period_end: '2026-03-31',
      reduction_kgco2e: 24_550,
      factors_snapshot: FACTORS_SNAPSHOT,
      evidence_ids: [],
      ...overrides,
    });
  }

  /** Walk a fresh package to the given state. */
  async function packageIn(state: 'submitted' | 'under_review', evidenceIds: string[] = []): Promise<string> {
    const created = await createPackage({ evidence_ids: evidenceIds });
    const id = created.json().verification.id as string;
    expect((await post(`/api/v1/verifications/${id}/submit`, owner.token)).statusCode).toBe(200);
    if (state === 'under_review') {
      expect((await post(`/api/v1/verifications/${id}/start-review`, verifier.token)).statusCode).toBe(200);
    }
    return id;
  }

  describe('POST /api/v1/verifications (create draft)', () => {
    it('creates a draft with seed-style defaults and writes NO audit row', async () => {
      const before = await prisma.auditLog.count();
      const res = await createPackage();
      expect(res.statusCode).toBe(201);
      const v = res.json().verification as Record<string, unknown>;
      // Exact allowlist — nothing beyond PublicVerification ever leaves the API.
      expect(Object.keys(v).sort()).toEqual([...VERIFICATION_PUBLIC_KEYS].sort());
      expect(v).toMatchObject({
        project_id: projectId,
        created_by: owner.id,
        owner_name: 'Test project_owner',      // creator's display name, like seed
        assigned_verifier_name: 'Daniel Okoye', // seeded reviewer stand-in
        state: 'draft',
        reduction_kgco2e: 24_550,
        factors_snapshot: FACTORS_SNAPSHOT,
        required_categories: DEFAULT_CATEGORIES,
        sla_target_days: 7,
        submitted_at: null,
        locked_at: null,
        hash_value: null,
        credential_id: null,
      });
      expect(v.id).toMatch(/^VR-/);
      // The SPA store has no create action (packages came from seed) — the
      // audit trail starts at VERIFICATION_SUBMITTED, so create is unaudited.
      expect(await prisma.auditLog.count()).toBe(before);
    });

    it('honors explicit required_categories and sla_target_days', async () => {
      const res = await createPackage({
        required_categories: ['meter_reading'], sla_target_days: 14,
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().verification).toMatchObject({
        required_categories: ['meter_reading'], sla_target_days: 14,
      });
    });

    it('403s for verifiers and 404s on an unknown project', async () => {
      expect((await createPackage({}, verifier.token)).statusCode).toBe(403);
      expect((await createPackage({ project_id: 'prj-nope' })).statusCode).toBe(404);
    });

    it('requires auth', async () => {
      const res = await app.inject({ method: 'POST', url: '/api/v1/verifications', payload: {} });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('Gate 2 state machine', () => {
    it('walks draft → submitted → under_review → revision_required → … → approved', async () => {
      const ev1 = await insertEvidence('meter-mar.pdf');
      const ev2 = await insertEvidence('bill-mar.pdf');
      const created = await createPackage({ evidence_ids: [ev1, ev2] });
      const id = created.json().verification.id as string;

      // Submit.
      const submitted = await post(`/api/v1/verifications/${id}/submit`, owner.token);
      expect(submitted.statusCode).toBe(200);
      expect(submitted.json().verification.state).toBe('submitted');
      const submittedAt = submitted.json().verification.submitted_at as string;
      expect(submittedAt).toBeTruthy();
      expect(await latestAudit(prisma)).toMatchObject({
        action: 'VERIFICATION_SUBMITTED', entity_type: 'verification', entity_id: id,
        payload: {}, previous_value: { state: 'draft' }, new_value: { state: 'submitted' },
      });

      // Start review (verifier).
      const started = await post(`/api/v1/verifications/${id}/start-review`, verifier.token);
      expect(started.statusCode).toBe(200);
      expect(started.json().verification.state).toBe('under_review');
      expect(await latestAudit(prisma)).toMatchObject({
        action: 'REVIEW_STARTED', entity_id: id, payload: {},
        previous_value: { state: 'submitted' }, new_value: { state: 'under_review' },
      });

      // Request revision — state flips, summary lives only in the audit entry.
      const revision = await post(`/api/v1/verifications/${id}/request-revision`, verifier.token, {
        summary: 'Meter serial not legible.',
      });
      expect(revision.statusCode).toBe(200);
      expect(revision.json().verification).toMatchObject({
        state: 'revision_required', rejection_reason: null,
      });
      expect(await latestAudit(prisma)).toMatchObject({
        action: 'REVISION_REQUESTED', entity_id: id,
        payload: { summary: 'Meter serial not legible.' },
        previous_value: { state: 'under_review' },
        new_value: { state: 'revision_required', summary: 'Meter serial not legible.' },
      });

      // Resubmit keeps the original submitted_at (SPA semantics), then approve.
      const resubmitted = await post(`/api/v1/verifications/${id}/submit`, owner.token);
      expect(resubmitted.statusCode).toBe(200);
      expect(resubmitted.json().verification.submitted_at).toBe(submittedAt);
      await post(`/api/v1/verifications/${id}/start-review`, verifier.token);

      const approved = await post(`/api/v1/verifications/${id}/approve`, verifier.token, {
        note: 'All evidence consistent.',
      });
      expect(approved.statusCode).toBe(200);
      const v = approved.json().verification as Record<string, unknown>;
      expect(v.state).toBe('approved');
      const lockedAt = v.locked_at as string;
      expect(lockedAt).toBeTruthy();
      // hash_value follows the EXACT SPA recipe from approveVerification.
      expect(v.hash_value).toBe(
        shortHash(`${id}|${projectId}|${24_550}|${[ev1, ev2].join(',')}|${lockedAt}`),
      );
      expect(await latestAudit(prisma)).toMatchObject({
        user_id: verifier.id,
        action: 'VERIFICATION_APPROVED', entity_id: id,
        payload: { reduction_tco2e: 24.55, note: 'All evidence consistent.' },
        previous_value: { state: 'under_review' },
        new_value: { state: 'approved', hash_value: v.hash_value, locked_at: lockedAt },
      });
      await expectValidChainTail(prisma);
    });

    it('approve without a note audits note: null', async () => {
      const id = await packageIn('under_review');
      const res = await post(`/api/v1/verifications/${id}/approve`, verifier.token);
      expect(res.statusCode).toBe(200);
      expect((await latestAudit(prisma)).payload).toEqual({ reduction_tco2e: 24.55, note: null });
    });

    it('reject flow stores the reason and audits VERIFICATION_REJECTED', async () => {
      const id = await packageIn('under_review');
      const res = await post(`/api/v1/verifications/${id}/reject`, verifier.token, {
        reason: 'Claimed reduction exceeds metered generation.',
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().verification).toMatchObject({
        state: 'rejected', rejection_reason: 'Claimed reduction exceeds metered generation.',
      });
      expect(await latestAudit(prisma)).toMatchObject({
        action: 'VERIFICATION_REJECTED', entity_id: id,
        payload: { reason: 'Claimed reduction exceeds metered generation.' },
        previous_value: { state: 'under_review' },
        new_value: { state: 'rejected', reason: 'Claimed reduction exceeds metered generation.' },
      });
      await expectValidChainTail(prisma);
    });

    it('409s every illegal transition', async () => {
      const expect409 = async (url: string, token: string, payload?: Record<string, unknown>) => {
        const res = await post(url, token, payload);
        expect(res.statusCode).toBe(409);
        expect(res.json().error.code).toBe('CONFLICT');
      };

      // From draft: only submit is legal.
      const created = await createPackage();
      const draft = created.json().verification.id as string;
      await expect409(`/api/v1/verifications/${draft}/start-review`, verifier.token);
      await expect409(`/api/v1/verifications/${draft}/request-revision`, verifier.token, { summary: 's' });
      await expect409(`/api/v1/verifications/${draft}/approve`, verifier.token);
      await expect409(`/api/v1/verifications/${draft}/reject`, verifier.token, { reason: 'r' });

      // From submitted: only start-review is legal.
      const submitted = await packageIn('submitted');
      await expect409(`/api/v1/verifications/${submitted}/submit`, owner.token);
      await expect409(`/api/v1/verifications/${submitted}/request-revision`, verifier.token, { summary: 's' });
      await expect409(`/api/v1/verifications/${submitted}/approve`, verifier.token);
      await expect409(`/api/v1/verifications/${submitted}/reject`, verifier.token, { reason: 'r' });

      // From under_review: submit / start-review are illegal.
      const reviewing = await packageIn('under_review');
      await expect409(`/api/v1/verifications/${reviewing}/submit`, owner.token);
      await expect409(`/api/v1/verifications/${reviewing}/start-review`, verifier.token);

      // Terminal: approved accepts nothing.
      await post(`/api/v1/verifications/${reviewing}/approve`, verifier.token);
      await expect409(`/api/v1/verifications/${reviewing}/submit`, owner.token);
      await expect409(`/api/v1/verifications/${reviewing}/start-review`, verifier.token);
      await expect409(`/api/v1/verifications/${reviewing}/request-revision`, verifier.token, { summary: 's' });
      await expect409(`/api/v1/verifications/${reviewing}/approve`, verifier.token);
      await expect409(`/api/v1/verifications/${reviewing}/reject`, verifier.token, { reason: 'r' });

      // From revision_required: only submit is legal.
      const revising = await packageIn('under_review');
      await post(`/api/v1/verifications/${revising}/request-revision`, verifier.token, { summary: 's' });
      await expect409(`/api/v1/verifications/${revising}/start-review`, verifier.token);
      await expect409(`/api/v1/verifications/${revising}/request-revision`, verifier.token, { summary: 's' });
      await expect409(`/api/v1/verifications/${revising}/approve`, verifier.token);
      await expect409(`/api/v1/verifications/${revising}/reject`, verifier.token, { reason: 'r' });

      // Terminal: rejected accepts nothing.
      const rejected = await packageIn('under_review');
      await post(`/api/v1/verifications/${rejected}/reject`, verifier.token, { reason: 'r' });
      await expect409(`/api/v1/verifications/${rejected}/submit`, owner.token);
      await expect409(`/api/v1/verifications/${rejected}/start-review`, verifier.token);
      await expect409(`/api/v1/verifications/${rejected}/request-revision`, verifier.token, { summary: 's' });
      await expect409(`/api/v1/verifications/${rejected}/approve`, verifier.token);
      await expect409(`/api/v1/verifications/${rejected}/reject`, verifier.token, { reason: 'r' });
    });

    it('enforces the verifier-side role guards (and admin passes them)', async () => {
      const id = await packageIn('submitted');
      for (const [action, payload] of [
        ['start-review', undefined],
        ['request-revision', { summary: 's' }],
        ['approve', undefined],
        ['reject', { reason: 'r' }],
      ] as const) {
        const res = await post(`/api/v1/verifications/${id}/${action}`, owner.token, payload);
        expect(res.statusCode).toBe(403);
        expect(res.json().error.code).toBe('FORBIDDEN');
      }
      // Verifier cannot submit (proponent-side action).
      const created = await createPackage();
      const draft = created.json().verification.id as string;
      expect((await post(`/api/v1/verifications/${draft}/submit`, verifier.token)).statusCode).toBe(403);

      // Admin passes the verifier guard.
      expect((await post(`/api/v1/verifications/${id}/start-review`, admin.token)).statusCode).toBe(200);
    });
  });

  describe('comments', () => {
    it('adds package-level and evidence-linked comments with COMMENT_ADDED audits', async () => {
      const ev = await insertEvidence('meter-apr.pdf');
      const id = await packageIn('under_review', [ev]);

      const pkg = await post(`/api/v1/verifications/${id}/comments`, verifier.token, {
        body: 'Package looks complete.',
      });
      expect(pkg.statusCode).toBe(201);
      expect(pkg.json().comment).toMatchObject({
        verification_id: id, evidence_id: null, evidence_name: null,
        author_id: verifier.id, author_name: 'Test verifier', author_role: 'verifier',
        body: 'Package looks complete.',
      });
      expect(await latestAudit(prisma)).toMatchObject({
        action: 'COMMENT_ADDED', entity_type: 'verification', entity_id: id,
        payload: {}, new_value: { body: 'Package looks complete.' },
      });

      // Evidence-linked: the server resolves evidence_name from the row.
      const linked = await post(`/api/v1/verifications/${id}/comments`, owner.token, {
        body: 'Re-uploaded a clearer scan.', evidence_id: ev,
      });
      expect(linked.statusCode).toBe(201);
      expect(linked.json().comment).toMatchObject({
        evidence_id: ev, evidence_name: 'meter-apr.pdf',
      });
      expect(await latestAudit(prisma)).toMatchObject({
        payload: { evidence: 'meter-apr.pdf' }, new_value: { body: 'Re-uploaded a clearer scan.' },
      });

      // Evidence from another project cannot be referenced.
      const otherProject = await app.inject({
        method: 'POST', url: '/api/v1/projects', headers: auth(owner.token),
        payload: { name: 'Other', location: 'Hanoi, Vietnam', capacity_kwp: 10, commission_date: '2024-01-01' },
      });
      const foreignEv = await insertEvidence('foreign.pdf', otherProject.json().project.id as string);
      const bad = await post(`/api/v1/verifications/${id}/comments`, owner.token, {
        body: 'x', evidence_id: foreignEv,
      });
      expect(bad.statusCode).toBe(404);

      // Detail GET returns the thread in order.
      const detail = await app.inject({
        method: 'GET', url: `/api/v1/verifications/${id}`, headers: auth(owner.token),
      });
      expect(detail.statusCode).toBe(200);
      const comments = detail.json().comments as Array<{ body: string }>;
      expect(comments.map((c) => c.body)).toEqual([
        'Package looks complete.', 'Re-uploaded a clearer scan.',
      ]);
      await expectValidChainTail(prisma);
    });
  });

  describe('cross-org isolation', () => {
    it('a foreign-org user cannot see, transition or comment on our packages (404)', async () => {
      const id = await packageIn('submitted');
      // Detail GET — a foreign package is indistinguishable from a missing one.
      const detail = await app.inject({
        method: 'GET', url: `/api/v1/verifications/${id}`, headers: auth(otherOrgToken),
      });
      expect(detail.statusCode).toBe(404);
      // Transition (role passes — project_owner — but org scoping 404s first).
      expect((await post(`/api/v1/verifications/${id}/submit`, otherOrgToken)).statusCode).toBe(404);
      // Comment create.
      const comment = await post(`/api/v1/verifications/${id}/comments`, otherOrgToken, { body: 'x' });
      expect(comment.statusCode).toBe(404);
    });
  });

  describe('reads', () => {
    it('lists org packages with project_id and state filters', async () => {
      const all = await app.inject({
        method: 'GET', url: '/api/v1/verifications', headers: auth(verifier.token),
      });
      expect(all.statusCode).toBe(200);
      expect((all.json().verifications as unknown[]).length).toBeGreaterThan(0);

      const byProject = await app.inject({
        method: 'GET', url: `/api/v1/verifications?project_id=${projectId}`, headers: auth(verifier.token),
      });
      for (const v of byProject.json().verifications as Array<{ project_id: string }>) {
        expect(v.project_id).toBe(projectId);
      }

      const approved = await app.inject({
        method: 'GET', url: '/api/v1/verifications?state=approved', headers: auth(verifier.token),
      });
      const rows = approved.json().verifications as Array<{ state: string }>;
      expect(rows.length).toBeGreaterThan(0);
      for (const v of rows) expect(v.state).toBe('approved');
    });

    it('404s on an unknown id and requires auth', async () => {
      const res = await app.inject({
        method: 'GET', url: '/api/v1/verifications/VR-nope', headers: auth(owner.token),
      });
      expect(res.statusCode).toBe(404);
      expect((await app.inject({ method: 'GET', url: '/api/v1/verifications' })).statusCode).toBe(401);
    });
  });
});
