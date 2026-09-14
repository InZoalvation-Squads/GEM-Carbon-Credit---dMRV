import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { ed25519 } from '@noble/curves/ed25519.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { base58 } from '@scure/base';
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
import { canonical, sha256Hex } from '../../lib/hash.js';
import { projectTopicId } from '../../lib/guardian-sim.js';
import { publicKeyFromDidKey } from '../../lib/identity.js';
import { verifyCredential } from '../../lib/vc.js';
import type { VerifiableCredential } from '../../lib/vc-types.js';
import { uid } from '../../lib/uid.js';

// ---------------------------------------------------------------------------
// Test-only signer: fabricates browser-style did:key identities and signs VCs
// with @noble/curves, EXACTLY like carbon-ready/src/lib/identity.ts + vc.ts
// (multicodec 0xed 0x01, proof over sha256(canonical(vc sans proof))). The
// server itself never signs — this stands in for the SPA.
// ---------------------------------------------------------------------------
interface TestIssuer { did: string; priv: Uint8Array }

function makeIssuer(): TestIssuer {
  const priv = ed25519.utils.randomSecretKey();
  const pub = ed25519.getPublicKey(priv);
  const multicodec = new Uint8Array(2 + pub.length);
  multicodec.set([0xed, 0x01]);
  multicodec.set(pub, 2);
  return { did: `did:key:z${base58.encode(multicodec)}`, priv };
}

/** Sign the unsigned VC AS GIVEN (issuer_did is the caller's responsibility). */
function signVc(unsigned: Omit<VerifiableCredential, 'proof'>, signer: TestIssuer): VerifiableCredential {
  const msg = hexToBytes(sha256Hex(canonical(unsigned)));
  return {
    ...unsigned,
    proof: {
      type: 'Ed25519Signature2020',
      created: unsigned.issued_at,
      verificationMethod: signer.did,
      proofValue: bytesToHex(ed25519.sign(msg, signer.priv)),
    },
  };
}

// Same shape as the SPA seed's SOLAR_SECTION_DATA — passes validatePdd for
// T-VER-S-METH-01-01 03 (copied from pdds.test.ts).
const SOLAR = 'meth-tver-solar';
const SOLAR_SECTION_DATA = {
  project_title_th: 'โครงการผลิตไฟฟ้าจากพลังงานแสงอาทิตย์แบบติดตั้งบนหลังคา',
  project_title_en: 'Solar Rooftop Power Generation Project',
  project_owner: 'GreenGrid Asia',
  project_scale: 'เล็กมาก', crediting_years: '7', crediting_start: '2025-04-01',
  preparer_name: 'Anong Siriwan', coordinator_name: 'Kittipong Chaiyo',
  registered_elsewhere: 'ไม่มี', degradation_pct: 0.4,
  technology: 'Solar PV rooftop', grid_connection: 'Grid-connected',
  baseline_scenario: 'Grid electricity displaced by on-site solar generation',
  barrier_type: 'Investment', investment_metric: 'IRR',
  barrier_explanation: 'Project IRR without carbon revenue is below the developer hurdle rate.',
  common_practice: true, performance_ratio: 0.8,
  monitored_parameter: 'EG_PJ', measurement_method: 'Revenue-grade bi-directional meter',
  monitoring_frequency: 'Monthly', qaqc_procedure: 'Monthly meter reads cross-checked against utility bill.',
};

// context/vc_type are covered by the signature (signingInput hashes the whole
// unsigned VC), so responses must carry them for offline re-verification.
const CREDENTIAL_PUBLIC_KEYS = [
  'id', 'schema_id', 'issuer_did', 'issued_at', 'subject', 'package_hash', 'hcs',
  'context', 'vc_type', 'proof', 'anchor',
];
const TOKEN_PUBLIC_KEYS = [
  'id', 'token_id', 'serial_number', 'project_id', 'credential_id', 'amount_tco2e',
  'monitoring_period_start', 'monitoring_period_end', 'minted_at', 'minted_by_role', 'hcs',
  'batch',
];

describe('credentials module', () => {
  let prisma: PrismaClient;
  let app: FastifyInstance;
  let owner: { id: string; token: string };
  let verifier: { id: string; token: string };
  let admin: { id: string; token: string };
  let otherOrgVerifierToken: string;
  let otherOrgAdminToken: string;
  let issuer: TestIssuer;
  let serialCounter = 0;

  beforeAll(async () => {
    const url = await setupTestDatabase();
    prisma = new PrismaClient({ datasourceUrl: url });
    await resetDatabase(prisma);
    await seed(prisma, {});
    app = await buildApp({ prisma });
    owner = await registerUser(app, 'project_owner');
    verifier = await registerUser(app, 'verifier');
    admin = await createAdmin(app, prisma);
    issuer = makeIssuer();

    // A second organization to prove org scoping (registration always joins
    // the first org, so build these users directly).
    await createOrg(prisma, 'org-0002', 'Other Org');
    await prisma.user.create({
      data: {
        id: 'usr-other-org-cred-v',
        organization_id: 'org-0002',
        email: 'other-cred-v@example.com',
        name: 'Other Org Verifier',
        role: 'verifier',
        password_hash: 'not-a-real-hash',
      },
    });
    await prisma.user.create({
      data: {
        id: 'usr-other-org-cred-a',
        organization_id: 'org-0002',
        email: 'other-cred-a@example.com',
        name: 'Other Org Admin',
        role: 'admin',
        password_hash: 'not-a-real-hash',
      },
    });
    otherOrgVerifierToken = app.jwt.sign({ sub: 'usr-other-org-cred-v', role: 'verifier', org: 'org-0002' });
    otherOrgAdminToken = app.jwt.sign({ sub: 'usr-other-org-cred-a', role: 'admin', org: 'org-0002' });
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function post(url: string, token: string, payload?: Record<string, unknown>) {
    return app.inject({ method: 'POST', url, headers: auth(token), payload: payload ?? {} });
  }

  async function get(url: string, token: string) {
    return app.inject({ method: 'GET', url, headers: auth(token) });
  }

  // ---- fixtures: walk real workflows through the existing endpoints --------

  async function createProject(name: string): Promise<string> {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/projects', headers: auth(owner.token),
      payload: { name, location: 'Bangkok, Thailand', capacity_kwp: 500, commission_date: '2024-06-01' },
    });
    expect(res.statusCode).toBe(201);
    return res.json().project.id as string;
  }

  /** Create + submit + start-review + approve a package; returns its key facts. */
  async function approvedVerification(): Promise<{ id: string; project_id: string; hash_value: string }> {
    const project_id = await createProject(`Anchor ${Date.now()}-${Math.random()}`);
    const created = await post('/api/v1/verifications', owner.token, {
      project_id,
      monitoring_period_start: '2026-03-01',
      monitoring_period_end: '2026-03-31',
      reduction_kgco2e: 24_550,
      factors_snapshot: 'MoEnCo 2025-v1 · 0.4999 kgCO₂e/kWh',
      evidence_ids: [],
    });
    const id = created.json().verification.id as string;
    expect((await post(`/api/v1/verifications/${id}/submit`, owner.token)).statusCode).toBe(200);
    expect((await post(`/api/v1/verifications/${id}/start-review`, verifier.token)).statusCode).toBe(200);
    const approved = await post(`/api/v1/verifications/${id}/approve`, verifier.token);
    expect(approved.statusCode).toBe(200);
    return { id, project_id, hash_value: approved.json().verification.hash_value as string };
  }

  /** Walk a fresh PDD to registered; returns its key facts. */
  async function registeredPdd(): Promise<{ id: string; project_id: string; content_hash: string }> {
    const project_id = await createProject(`Gate1 ${Date.now()}-${Math.random()}`);
    const created = await app.inject({
      method: 'POST', url: `/api/v1/projects/${project_id}/pdd`,
      headers: auth(owner.token), payload: { methodology_id: SOLAR },
    });
    const id = created.json().pdd.id as string;
    const drafted = await app.inject({
      method: 'PUT', url: `/api/v1/pdds/${id}/draft`, headers: auth(owner.token),
      payload: { section_data: SOLAR_SECTION_DATA, evidence_ids: [] },
    });
    expect(drafted.statusCode).toBe(200);
    expect((await post(`/api/v1/pdds/${id}/submit`, owner.token)).statusCode).toBe(200);
    expect((await post(`/api/v1/pdds/${id}/start-validation`, verifier.token)).statusCode).toBe(200);
    const registered = await post(`/api/v1/pdds/${id}/register`, verifier.token);
    expect(registered.statusCode).toBe(200);
    return { id, project_id, content_hash: registered.json().pdd.content_hash as string };
  }

  // ---- fixtures: browser-style VCs and tokens -------------------------------

  function approvalVc(
    v: { id: string; project_id: string; hash_value: string },
    overrides: Partial<Omit<VerifiableCredential, 'proof'>> = {},
    signer: TestIssuer = issuer,
  ): VerifiableCredential {
    const issued_at = new Date().toISOString();
    const topic_id = projectTopicId(v.project_id);
    return signVc({
      id: `urn:vc:${uid('t').replace('t-', '')}`,
      schema_id: 'mrv-approval-v1',
      issuer_did: signer.did,
      issued_at,
      subject: {
        verification_id: v.id,
        project_id: v.project_id,
        monitoring_period_start: '2026-03-01',
        monitoring_period_end: '2026-03-31',
        reduction_tco2e: 24.55,
        evidence: [],
        approval_role: 'verifier',
        package_hash: v.hash_value,
      },
      package_hash: v.hash_value,
      hcs: {
        topic_id,
        sequence_number: 1,
        consensus_timestamp: issued_at,
        explorer_url: `https://hashscan.io/testnet/topic/${topic_id}/message/1`,
      },
      context: ['https://www.w3.org/ns/credentials/v2'],
      // NOT a typo: the SPA builds vc_type as ['VerifiableCredential', schema.type],
      // and both guardian-schema.ts schemas have type 'VerifiableCredential'.
      vc_type: ['VerifiableCredential', 'VerifiableCredential'],
      ...overrides,
    }, signer);
  }

  function pddVc(
    p: { id: string; project_id: string; content_hash: string },
    overrides: Partial<Omit<VerifiableCredential, 'proof'>> = {},
    signer: TestIssuer = issuer,
  ): VerifiableCredential {
    const issued_at = new Date().toISOString();
    const topic_id = projectTopicId(p.project_id);
    return signVc({
      id: `urn:vc:${uid('t').replace('t-', '')}`,
      schema_id: 'pdd-registration-v1',
      issuer_did: signer.did,
      issued_at,
      subject: {
        pdd_id: p.id,
        project_id: p.project_id,
        methodology: 'T-VER-S-METH-01-01 03',
        content_hash: p.content_hash,
      },
      package_hash: p.content_hash,
      hcs: {
        topic_id,
        sequence_number: 1,
        consensus_timestamp: issued_at,
        explorer_url: `https://hashscan.io/testnet/topic/${topic_id}/message/1`,
      },
      context: ['https://www.w3.org/ns/credentials/v2'],
      // Same as approvalVc: ['VerifiableCredential', schema.type] with
      // guardian-schema.ts type 'VerifiableCredential' — faithful, not a typo.
      vc_type: ['VerifiableCredential', 'VerifiableCredential'],
      ...overrides,
    }, signer);
  }

  function tokenBody(credentialId: string, projectId: string, overrides: Record<string, unknown> = {}) {
    const serial = ++serialCounter;
    return {
      id: `token:0.0.480200:${serial}`,
      token_id: '0.0.480200',
      serial_number: serial,
      project_id: projectId,
      credential_id: credentialId,
      amount_tco2e: 24.55,
      monitoring_period_start: '2026-03-01',
      monitoring_period_end: '2026-03-31',
      minted_at: new Date().toISOString(),
      minted_by_role: 'admin',
      hcs: { topic_id: '0.0.480100', sequence_number: serial, explorer_url: 'https://hashscan.io/testnet/token/0.0.480200' },
      ...overrides,
    };
  }

  /** Anchor a fresh approved verification; returns the ids involved. */
  async function anchoredCredential(): Promise<{ credentialId: string; projectId: string; verificationId: string }> {
    const v = await approvedVerification();
    const vc = approvalVc(v);
    const res = await post(`/api/v1/verifications/${v.id}/anchor`, verifier.token, vc as unknown as Record<string, unknown>);
    expect(res.statusCode).toBe(201);
    return { credentialId: vc.id, projectId: v.project_id, verificationId: v.id };
  }

  // ==========================================================================

  describe('ported verify path (lib/vc.ts + lib/identity.ts)', () => {
    it('verifies a noble-signed VC, flags unsigned, and enforces issuer binding', () => {
      const vc = approvalVc({ id: 'VR-x', project_id: 'prj-x', hash_value: 'sha256-x' });
      expect(verifyCredential(vc)).toBe('valid');

      const { proof: _p, ...rest } = vc;
      expect(verifyCredential(rest as VerifiableCredential)).toBe('unsigned');

      // The classic re-signing attack: attacker signs the (tampered) content
      // with their OWN key and points verificationMethod at their own did —
      // the raw signature checks out, but issuer_did no longer matches.
      const attacker = makeIssuer();
      const forged = signVc(
        { ...rest, subject: { ...rest.subject, reduction_tco2e: 999_999 } },
        attacker,
      );
      forged.issuer_did = vc.issuer_did; // still claims the real issuer
      expect(verifyCredential(forged)).toBe('invalid');

      // Any field edit after signing breaks the proof.
      expect(verifyCredential({ ...vc, package_hash: 'sha256-tampered' })).toBe('invalid');
    });

    it('publicKeyFromDidKey round-trips and rejects malformed dids', () => {
      const pub = publicKeyFromDidKey(issuer.did);
      expect(pub).toBeInstanceOf(Uint8Array);
      expect(pub!.length).toBe(32);
      expect(publicKeyFromDidKey('did:web:example.com')).toBeNull();
      expect(publicKeyFromDidKey('did:key:zNotBase58!!!')).toBeNull();
    });
  });

  describe('POST /api/v1/verifications/:id/anchor', () => {
    it('anchors a browser-signed VC: persists it, stamps the verification, audits', async () => {
      const v = await approvedVerification();
      const vc = approvalVc(v);
      const res = await post(`/api/v1/verifications/${v.id}/anchor`, verifier.token, vc as unknown as Record<string, unknown>);
      expect(res.statusCode).toBe(201);

      // Exact allowlist — proof is intentionally public (offline verification).
      const credential = res.json().credential as Record<string, unknown>;
      expect(Object.keys(credential).sort()).toEqual([...CREDENTIAL_PUBLIC_KEYS].sort());
      expect(credential).toMatchObject({
        id: vc.id, schema_id: 'mrv-approval-v1', issuer_did: issuer.did,
        issued_at: vc.issued_at, package_hash: v.hash_value,
      });
      expect(credential.proof).toEqual(vc.proof);
      expect(credential.subject).toEqual(vc.subject);

      // The verification is stamped exactly like the SPA store does it.
      const verification = res.json().verification as Record<string, unknown>;
      expect(verification).toMatchObject({
        credential_id: vc.id,
        anchored_at: vc.issued_at,
        hcs_topic_id: vc.hcs.topic_id,
        hcs_sequence_number: vc.hcs.sequence_number,
      });

      // Whole VC persisted as the payload; project linkage denormalized.
      const row = await prisma.credential.findUniqueOrThrow({ where: { id: vc.id } });
      expect(row.project_id).toBe(v.project_id);
      expect(row.payload).toEqual(JSON.parse(JSON.stringify(vc)));

      expect(await latestAudit(prisma)).toMatchObject({
        action: 'VERIFICATION_ANCHORED', entity_type: 'verification', entity_id: v.id,
        payload: { credential_id: vc.id, topic_id: vc.hcs.topic_id, sequence_number: vc.hcs.sequence_number },
        previous_value: { anchored: false },
        new_value: { credential_id: vc.id, hcs_topic_id: vc.hcs.topic_id, hcs_sequence_number: vc.hcs.sequence_number },
      });
      await expectValidChainTail(prisma);
    });

    it('422s a VC whose subject was tampered after signing', async () => {
      const v = await approvedVerification();
      const vc = approvalVc(v);
      (vc.subject as Record<string, unknown>).reduction_tco2e = 999_999;
      const res = await post(`/api/v1/verifications/${v.id}/anchor`, verifier.token, vc as unknown as Record<string, unknown>);
      expect(res.statusCode).toBe(422);
      expect(res.json().error).toMatchObject({ code: 'UNPROCESSABLE', message: 'credential signature invalid' });
    });

    it('400s when the proof is missing (zod — proof is required at the API edge)', async () => {
      const v = await approvedVerification();
      const { proof: _p, ...unsigned } = approvalVc(v);
      const res = await post(`/api/v1/verifications/${v.id}/anchor`, verifier.token, unsigned as unknown as Record<string, unknown>);
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('VALIDATION_ERROR');
    });

    it('422s when issuer_did does not match proof.verificationMethod (issuer binding)', async () => {
      const v = await approvedVerification();
      const attacker = makeIssuer();
      // Signature is genuinely valid under the attacker's key — only the
      // claimed issuer_did disagrees with the proof's verificationMethod.
      const vc = approvalVc(v, { issuer_did: issuer.did }, attacker);
      expect(vc.proof!.verificationMethod).toBe(attacker.did);
      const res = await post(`/api/v1/verifications/${v.id}/anchor`, verifier.token, vc as unknown as Record<string, unknown>);
      expect(res.statusCode).toBe(422);
      expect(res.json().error.message).toBe('credential signature invalid');
    });

    it('422s when package_hash does not match the approved package hash', async () => {
      const v = await approvedVerification();
      const vc = approvalVc({ ...v, hash_value: 'sha256-' + '9'.repeat(64) });
      const res = await post(`/api/v1/verifications/${v.id}/anchor`, verifier.token, vc as unknown as Record<string, unknown>);
      expect(res.statusCode).toBe(422);
      expect(res.json().error.message).toMatch(/package_hash/);
    });

    it('422s when the subject points at a different package or project', async () => {
      const v = await approvedVerification();
      const vc = approvalVc(v, {
        subject: { verification_id: 'VR-someone-else', project_id: v.project_id, package_hash: v.hash_value },
      });
      const res = await post(`/api/v1/verifications/${v.id}/anchor`, verifier.token, vc as unknown as Record<string, unknown>);
      expect(res.statusCode).toBe(422);
      expect(res.json().error.message).toMatch(/subject/);

      // Right verification_id, wrong project — the subject must be pinned to
      // the verification's own project (symmetric with the mint pinning).
      const wrongProject = approvalVc(v, {
        subject: { verification_id: v.id, project_id: 'prj-someone-else', package_hash: v.hash_value },
      });
      const res2 = await post(`/api/v1/verifications/${v.id}/anchor`, verifier.token, wrongProject as unknown as Record<string, unknown>);
      expect(res2.statusCode).toBe(422);
      expect(res2.json().error.message).toMatch(/subject\.project_id/);
    });

    it('409s a double anchor', async () => {
      const v = await approvedVerification();
      const first = approvalVc(v);
      expect((await post(`/api/v1/verifications/${v.id}/anchor`, verifier.token, first as unknown as Record<string, unknown>)).statusCode).toBe(201);
      const second = approvalVc(v);
      const res = await post(`/api/v1/verifications/${v.id}/anchor`, verifier.token, second as unknown as Record<string, unknown>);
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe('CONFLICT');
    });

    it('409s anchoring a non-approved verification', async () => {
      const project_id = await createProject('Not approved yet');
      const created = await post('/api/v1/verifications', owner.token, {
        project_id,
        monitoring_period_start: '2026-03-01',
        monitoring_period_end: '2026-03-31',
        reduction_kgco2e: 1000,
        factors_snapshot: 'MoEnCo 2025-v1 · 0.4999 kgCO₂e/kWh',
        evidence_ids: [],
      });
      const id = created.json().verification.id as string;
      await post(`/api/v1/verifications/${id}/submit`, owner.token);
      const vc = approvalVc({ id, project_id, hash_value: 'sha256-' + '1'.repeat(64) });
      const res = await post(`/api/v1/verifications/${id}/anchor`, verifier.token, vc as unknown as Record<string, unknown>);
      expect(res.statusCode).toBe(409);
    });

    it('403s proponent-side roles (anchor is a verifier/admin action)', async () => {
      const v = await approvedVerification();
      const vc = approvalVc(v);
      const res = await post(`/api/v1/verifications/${v.id}/anchor`, owner.token, vc as unknown as Record<string, unknown>);
      expect(res.statusCode).toBe(403);
    });
  });

  describe('POST /api/v1/pdds/:id/credential', () => {
    it('anchors the PDD registration VC and stamps pdd.credential_id (audited)', async () => {
      const p = await registeredPdd();
      const vc = pddVc(p);
      const res = await post(`/api/v1/pdds/${p.id}/credential`, verifier.token, vc as unknown as Record<string, unknown>);
      expect(res.statusCode).toBe(201);
      expect(res.json().pdd).toMatchObject({ id: p.id, credential_id: vc.id });
      const credential = res.json().credential as Record<string, unknown>;
      expect(Object.keys(credential).sort()).toEqual([...CREDENTIAL_PUBLIC_KEYS].sort());

      const row = await prisma.credential.findUniqueOrThrow({ where: { id: vc.id } });
      expect(row.project_id).toBe(p.project_id);

      // Server-side extension: the SPA folds these fields into its
      // PROJECT_REGISTERED entry; the server anchors in a separate step.
      expect(await latestAudit(prisma)).toMatchObject({
        action: 'PDD_CREDENTIAL_ANCHORED', entity_type: 'pdd', entity_id: p.id,
        payload: { credential_id: vc.id, topic_id: vc.hcs.topic_id, sequence_number: vc.hcs.sequence_number },
        previous_value: { credential_id: null },
        new_value: { credential_id: vc.id },
      });
      await expectValidChainTail(prisma);
    });

    it('guards: not registered 409, wrong content hash 422, wrong pdd_id 422, tampered 422, double 409', async () => {
      // Not registered yet (under_validation).
      const project_id = await createProject(`Gate1 guard ${Date.now()}`);
      const created = await app.inject({
        method: 'POST', url: `/api/v1/projects/${project_id}/pdd`,
        headers: auth(owner.token), payload: { methodology_id: SOLAR },
      });
      const draftId = created.json().pdd.id as string;
      const notRegistered = pddVc({ id: draftId, project_id, content_hash: 'sha256-' + '2'.repeat(64) });
      expect((await post(`/api/v1/pdds/${draftId}/credential`, verifier.token, notRegistered as unknown as Record<string, unknown>)).statusCode).toBe(409);

      const p = await registeredPdd();
      // package_hash must equal the frozen content_hash.
      const wrongHash = pddVc({ ...p, content_hash: 'sha256-' + '3'.repeat(64) });
      expect((await post(`/api/v1/pdds/${p.id}/credential`, verifier.token, wrongHash as unknown as Record<string, unknown>)).statusCode).toBe(422);
      // subject.pdd_id must point at :id.
      const wrongSubject = pddVc(p, { subject: { pdd_id: 'PDD-other', project_id: p.project_id } });
      expect((await post(`/api/v1/pdds/${p.id}/credential`, verifier.token, wrongSubject as unknown as Record<string, unknown>)).statusCode).toBe(422);
      // … and subject.project_id must be the PDD's own project.
      const wrongProject = pddVc(p, { subject: { pdd_id: p.id, project_id: 'prj-someone-else' } });
      expect((await post(`/api/v1/pdds/${p.id}/credential`, verifier.token, wrongProject as unknown as Record<string, unknown>)).statusCode).toBe(422);
      // Tampered after signing.
      const tampered = pddVc(p);
      (tampered.subject as Record<string, unknown>).methodology = 'T-VER-S-METH-01-01 99';
      expect((await post(`/api/v1/pdds/${p.id}/credential`, verifier.token, tampered as unknown as Record<string, unknown>)).statusCode).toBe(422);
      // Happy, then double anchor.
      const vc = pddVc(p);
      expect((await post(`/api/v1/pdds/${p.id}/credential`, verifier.token, vc as unknown as Record<string, unknown>)).statusCode).toBe(201);
      expect((await post(`/api/v1/pdds/${p.id}/credential`, verifier.token, pddVc(p) as unknown as Record<string, unknown>)).statusCode).toBe(409);
    });
  });

  describe('POST /api/v1/credentials/:id/mint', () => {
    it('mints one token per credential as admin and audits TOKEN_MINTED', async () => {
      const { credentialId, projectId } = await anchoredCredential();
      const body = tokenBody(credentialId, projectId);
      const res = await post(`/api/v1/credentials/${credentialId}/mint`, admin.token, body);
      expect(res.statusCode).toBe(201);
      const token = res.json().token as Record<string, unknown>;
      expect(Object.keys(token).sort()).toEqual([...TOKEN_PUBLIC_KEYS].sort());
      expect(token).toMatchObject({
        id: body.id, token_id: '0.0.480200', serial_number: body.serial_number,
        project_id: projectId, credential_id: credentialId, amount_tco2e: 24.55,
        monitoring_period_start: '2026-03-01', monitoring_period_end: '2026-03-31',
        minted_at: body.minted_at, minted_by_role: 'admin', hcs: body.hcs,
      });
      expect(await latestAudit(prisma)).toMatchObject({
        action: 'TOKEN_MINTED', entity_type: 'token', entity_id: body.id,
        payload: {
          token_id: '0.0.480200', serial_number: body.serial_number,
          amount_tco2e: 24.55, credential_id: credentialId,
        },
        new_value: { serial_number: body.serial_number, amount_tco2e: 24.55 },
      });
      await expectValidChainTail(prisma);
    });

    it('403s non-admin roles (only the Standard Registry mints)', async () => {
      const { credentialId, projectId } = await anchoredCredential();
      for (const token of [owner.token, verifier.token]) {
        const res = await post(`/api/v1/credentials/${credentialId}/mint`, token, tokenBody(credentialId, projectId));
        expect(res.statusCode).toBe(403);
        expect(res.json().error.code).toBe('FORBIDDEN');
      }
    });

    it('409s a second mint for the same credential — parallel-safe', async () => {
      const { credentialId, projectId } = await anchoredCredential();
      const [a, b] = await Promise.all([
        post(`/api/v1/credentials/${credentialId}/mint`, admin.token, tokenBody(credentialId, projectId)),
        post(`/api/v1/credentials/${credentialId}/mint`, admin.token, tokenBody(credentialId, projectId)),
      ]);
      expect([a.statusCode, b.statusCode].sort()).toEqual([201, 409]);
      const loser = a.statusCode === 409 ? a : b;
      expect(loser.json().error.code).toBe('CONFLICT');
      // Exactly one token exists for the credential.
      expect(await prisma.guardianToken.count({ where: { credential_id: credentialId } })).toBe(1);
    });

    it('422s when body.credential_id disagrees with :id, 404s unknown credentials', async () => {
      const { credentialId, projectId } = await anchoredCredential();
      const mismatch = await post(
        `/api/v1/credentials/${credentialId}/mint`, admin.token,
        tokenBody('urn:vc:someone-else', projectId),
      );
      expect(mismatch.statusCode).toBe(422);
      const missing = await post(
        '/api/v1/credentials/urn:vc:nope/mint', admin.token,
        tokenBody('urn:vc:nope', projectId),
      );
      expect(missing.statusCode).toBe(404);
    });
  });

  describe('cross-org isolation (org-0002)', () => {
    it('foreign org cannot anchor, mint, or see our credentials/tokens', async () => {
      const v = await approvedVerification();
      const vc = approvalVc(v);
      // Anchor: foreign verifier passes the role gate but the org scope 404s.
      expect((await post(`/api/v1/verifications/${v.id}/anchor`, otherOrgVerifierToken, vc as unknown as Record<string, unknown>)).statusCode).toBe(404);

      // PDD credential: same.
      const p = await registeredPdd();
      expect((await post(`/api/v1/pdds/${p.id}/credential`, otherOrgVerifierToken, pddVc(p) as unknown as Record<string, unknown>)).statusCode).toBe(404);

      // Mint: foreign admin, our credential — indistinguishable from missing.
      const { credentialId, projectId } = await anchoredCredential();
      expect((await post(`/api/v1/credentials/${credentialId}/mint`, otherOrgAdminToken, tokenBody(credentialId, projectId))).statusCode).toBe(404);

      // Lists: the foreign org sees nothing of ours.
      const credentials = await get('/api/v1/credentials', otherOrgAdminToken);
      expect(credentials.statusCode).toBe(200);
      expect(credentials.json().credentials).toEqual([]);
      const tokens = await get('/api/v1/tokens', otherOrgAdminToken);
      expect(tokens.statusCode).toBe(200);
      expect(tokens.json().tokens).toEqual([]);
    });
  });

  describe('GET /api/v1/credentials and /api/v1/tokens', () => {
    it('lists org credentials and tokens with exact serializer key-sets', async () => {
      const { credentialId, projectId } = await anchoredCredential();
      const minted = await post(`/api/v1/credentials/${credentialId}/mint`, admin.token, tokenBody(credentialId, projectId));
      expect(minted.statusCode).toBe(201);

      const credentials = await get('/api/v1/credentials', owner.token);
      expect(credentials.statusCode).toBe(200);
      const credentialRows = credentials.json().credentials as Array<Record<string, unknown>>;
      expect(credentialRows.length).toBeGreaterThan(0);
      for (const c of credentialRows) {
        expect(Object.keys(c).sort()).toEqual([...CREDENTIAL_PUBLIC_KEYS].sort());
      }
      expect(credentialRows.some((c) => c.id === credentialId)).toBe(true);

      const tokens = await get('/api/v1/tokens', owner.token);
      expect(tokens.statusCode).toBe(200);
      const tokenRows = tokens.json().tokens as Array<Record<string, unknown>>;
      expect(tokenRows.length).toBeGreaterThan(0);
      for (const t of tokenRows) {
        expect(Object.keys(t).sort()).toEqual([...TOKEN_PUBLIC_KEYS].sort());
      }
      expect(tokenRows.some((t) => t.credential_id === credentialId)).toBe(true);
    });

    it('returns credentials that re-verify offline (round-trip through GET)', async () => {
      await anchoredCredential(); // at least one row to verify
      const res = await get('/api/v1/credentials', owner.token);
      expect(res.statusCode).toBe(200);
      const rows = res.json().credentials as VerifiableCredential[];
      expect(rows.length).toBeGreaterThan(0);
      // The serializer must round-trip every signed field (incl. context and
      // vc_type, which sit inside signingInput) — anyone holding the response
      // can re-run the exact server-side verification and get 'valid'.
      for (const credential of rows) {
        expect(verifyCredential(credential)).toBe('valid');
      }
    });

    it('requires auth', async () => {
      expect((await app.inject({ method: 'GET', url: '/api/v1/credentials' })).statusCode).toBe(401);
      expect((await app.inject({ method: 'GET', url: '/api/v1/tokens' })).statusCode).toBe(401);
    });
  });
});
