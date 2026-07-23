// Ported from carbon-ready/src/store/index.ts — selectMethodology, savePddDraft,
// submitPdd, startValidation, requestPddRevision, registerProject, rejectPdd,
// addPddComment. Same state guards, same audit actions and payload shapes; the
// only server-side additions are org scoping, 409s on illegal transitions and
// server-generated disclosure salts (node:crypto instead of the browser RNG).
import { randomBytes } from 'node:crypto';
import type { Pdd, PddState, Prisma, PrismaClient } from '@prisma/client';
import { writeAudit, type AuditActor } from '../../lib/audit.js';
import { appError } from '../../lib/errors.js';
import { projectTopicId, toIpfsCid } from '../../lib/guardian-sim.js';
import type { Methodology as MethodologyDoc } from '../../lib/methodology-types.js';
import {
  pddContentHash,
  sensitiveFieldKeys,
  splitDisclosure,
  validatePdd,
  type DisclosureSplit,
} from '../../lib/pdd.js';
import { uid } from '../../lib/uid.js';

/** Seeded reviewer; reassignment out of scope (same stand-in as the SPA). */
const ASSIGNED_VALIDATOR = 'Daniel Okoye';

/**
 * Public PDD shape — explicit typed allowlist, NEVER a `{ ...row }` spread.
 *
 * ⚠️ SECURITY: `disclosure_salts` is INTENTIONALLY ABSENT and MUST STAY absent.
 * The salts are the private half of selective disclosure — publishing them
 * alongside the salted hashes in the PDD credential would let anyone brute-
 * force the redacted values. The SERVER is their custodian (persisted on the
 * pdd row); they are exposed solely through the proponent-scoped
 * GET /pdds/:id/disclosure endpoint (getDisclosure) — never in PublicPdd,
 * lists, or any other response.
 */
export type PublicPdd = {
  id: string;
  project_id: string;
  methodology_id: string;
  methodology_snapshot: string;
  state: PddState;
  section_data: Record<string, unknown>;
  evidence_ids: string[];
  assigned_validator_name: string;
  submitted_at: string | null;
  validated_at: string | null;
  content_hash: string | null;
  ipfs_cid: string | null;
  credential_id: string | null;
  rejection_reason: string | null;
};

export function serializePdd(p: Pdd): PublicPdd {
  return {
    id: p.id,
    project_id: p.project_id,
    methodology_id: p.methodology_id,
    methodology_snapshot: p.methodology_snapshot,
    state: p.state,
    section_data: (p.section_data ?? {}) as Record<string, unknown>,
    evidence_ids: p.evidence_ids,
    assigned_validator_name: p.assigned_validator_name,
    submitted_at: p.submitted_at?.toISOString() ?? null,
    validated_at: p.validated_at?.toISOString() ?? null,
    content_hash: p.content_hash,
    ipfs_cid: p.ipfs_cid,
    credential_id: p.credential_id,
    rejection_reason: p.rejection_reason,
    // disclosure_salts intentionally omitted — see the type's doc comment.
  };
}

type Tx = Prisma.TransactionClient;

/** Org-scoped PDD lookup: a foreign PDD is indistinguishable from a missing one. */
async function requirePdd(tx: Tx, organizationId: string, pddId: string): Promise<Pdd> {
  const pdd = await tx.pdd.findFirst({
    where: { id: pddId, project: { organization_id: organizationId } },
  });
  if (!pdd) throw appError(404, 'NOT_FOUND', 'PDD not found');
  return pdd;
}

function illegalTransition(action: string, state: PddState): never {
  throw appError(409, 'CONFLICT', `Cannot ${action} a PDD in state "${state}"`);
}

/** The stored schema-v2 document carries every field of the SPA Methodology type. */
function documentOf(m: { document: Prisma.JsonValue }): MethodologyDoc {
  return m.document as unknown as MethodologyDoc;
}

// ---------------- selectMethodology ----------------
export async function selectMethodology(
  prisma: PrismaClient,
  actor: AuditActor,
  projectId: string,
  methodologyId: string,
): Promise<{ pdd: Pdd; created: boolean }> {
  return prisma.$transaction(async (tx) => {
    const project = await tx.project.findFirst({
      where: { id: projectId, organization_id: actor.org },
      select: { id: true },
    });
    if (!project) throw appError(404, 'NOT_FOUND', 'Project not found');
    const methodology = await tx.methodology.findUnique({
      where: { id: methodologyId },
      select: { id: true },
    });
    if (!methodology) throw appError(404, 'NOT_FOUND', 'Methodology not found');

    const existing = await tx.pdd.findFirst({ where: { project_id: projectId } });
    if (existing) {
      // SPA rule: switch methodology only while the PDD is still editable —
      // otherwise (or when unchanged) return the existing PDD untouched, no audit.
      const editable = existing.state === 'draft' || existing.state === 'revision_required';
      if (!editable || existing.methodology_id === methodologyId) {
        return { pdd: existing, created: false };
      }
      const updated = await tx.pdd.update({
        where: { id: existing.id },
        data: { methodology_id: methodologyId },
      });
      await writeAudit(tx, {
        userId: actor.userId,
        role: actor.role,
        ip: actor.ip,
        action: 'METHODOLOGY_SELECTED',
        entityType: 'pdd',
        entityId: existing.id,
        payload: { project_id: projectId, methodology_id: methodologyId },
        previousValue: { methodology_id: existing.methodology_id },
        newValue: { methodology_id: methodologyId },
      });
      return { pdd: updated, created: false };
    }

    const pdd = await tx.pdd.create({
      data: {
        id: uid('PDD'),
        project_id: projectId,
        methodology_id: methodologyId,
        methodology_snapshot: '',
        state: 'draft',
        section_data: {},
        evidence_ids: [],
        assigned_validator_name: ASSIGNED_VALIDATOR,
      },
    });
    await tx.project.update({
      where: { id: projectId },
      data: { lifecycle_stage: 'pdd_draft' },
    });
    await writeAudit(tx, {
      userId: actor.userId,
      role: actor.role,
      ip: actor.ip,
      action: 'METHODOLOGY_SELECTED',
      entityType: 'pdd',
      entityId: pdd.id,
      payload: { project_id: projectId, methodology_id: methodologyId },
      newValue: { state: 'draft' },
    });
    return { pdd, created: true };
  });
}

// ---------------- savePddDraft ----------------
// Draft autosave is intentionally NOT audited — high-frequency editing, not a
// regulatory state change; the audit trail begins at submitPdd (verbatim SPA
// rationale). The server adds the state guard the SPA enforced in its UI.
export async function savePddDraft(
  prisma: PrismaClient,
  actor: AuditActor,
  pddId: string,
  sectionData: Record<string, unknown>,
  evidenceIds: string[],
): Promise<Pdd> {
  const pdd = await requirePdd(prisma, actor.org, pddId);
  // Guarded update (id AND state) so a save racing a submit/validate can
  // never touch a PDD that just left the editable states — the loser sees
  // count 0 and conflicts.
  const updated = await prisma.pdd.updateMany({
    where: { id: pdd.id, state: { in: ['draft', 'revision_required'] } },
    data: {
      section_data: sectionData as Prisma.InputJsonValue,
      evidence_ids: evidenceIds,
    },
  });
  if (updated.count !== 1) illegalTransition('edit', pdd.state);
  return prisma.pdd.findUniqueOrThrow({ where: { id: pdd.id } });
}

// ---------------- submitPdd ----------------
export async function submitPdd(prisma: PrismaClient, actor: AuditActor, pddId: string): Promise<Pdd> {
  return prisma.$transaction(async (tx) => {
    const pdd = await requirePdd(tx, actor.org, pddId);
    if (pdd.state !== 'draft' && pdd.state !== 'revision_required') {
      illegalTransition('submit', pdd.state);
    }
    // Snapshot "CODE version" from the live methodology (the FK guarantees it
    // exists; the SPA's fallback to the old snapshot covered a missing row).
    const m = await tx.methodology.findUniqueOrThrow({
      where: { id: pdd.methodology_id },
      select: { code: true, version: true },
    });
    const snapshot = `${m.code} ${m.version}`;
    const updated = await tx.pdd.update({
      where: { id: pdd.id },
      data: {
        state: 'submitted',
        methodology_snapshot: snapshot,
        submitted_at: pdd.submitted_at ?? new Date(),
      },
    });
    await tx.project.update({
      where: { id: pdd.project_id },
      data: { lifecycle_stage: 'under_validation' },
    });
    await writeAudit(tx, {
      userId: actor.userId,
      role: actor.role,
      ip: actor.ip,
      action: 'PDD_SUBMITTED',
      entityType: 'pdd',
      entityId: pdd.id,
      payload: { methodology: snapshot },
      previousValue: { state: pdd.state },
      newValue: { state: 'submitted' },
    });
    return updated;
  });
}

// ---------------- startValidation ----------------
export async function startValidation(prisma: PrismaClient, actor: AuditActor, pddId: string): Promise<Pdd> {
  return prisma.$transaction(async (tx) => {
    const pdd = await requirePdd(tx, actor.org, pddId);
    if (pdd.state !== 'submitted') illegalTransition('start validation on', pdd.state);
    const updated = await tx.pdd.update({
      where: { id: pdd.id },
      data: { state: 'under_validation' },
    });
    await writeAudit(tx, {
      userId: actor.userId,
      role: actor.role,
      ip: actor.ip,
      action: 'VALIDATION_STARTED',
      entityType: 'pdd',
      entityId: pdd.id,
      payload: {},
      previousValue: { state: pdd.state },
      newValue: { state: 'under_validation' },
    });
    return updated;
  });
}

// ---------------- requestPddRevision ----------------
export async function requestPddRevision(
  prisma: PrismaClient,
  actor: AuditActor,
  pddId: string,
  summary: string,
): Promise<Pdd> {
  return prisma.$transaction(async (tx) => {
    const pdd = await requirePdd(tx, actor.org, pddId);
    if (pdd.state !== 'under_validation') illegalTransition('request revision on', pdd.state);
    const updated = await tx.pdd.update({
      where: { id: pdd.id },
      data: { state: 'revision_required', rejection_reason: summary },
    });
    await tx.project.update({
      where: { id: pdd.project_id },
      data: { lifecycle_stage: 'pdd_draft' },
    });
    await writeAudit(tx, {
      userId: actor.userId,
      role: actor.role,
      ip: actor.ip,
      action: 'PDD_REVISION_REQUESTED',
      entityType: 'pdd',
      entityId: pdd.id,
      payload: { summary },
      previousValue: { state: pdd.state },
      newValue: { state: 'revision_required', summary },
    });
    return updated;
  });
}

// ---------------- registerProject ----------------
export interface RegisterResult {
  pdd: Pdd;
  /**
   * The {disclosed, redacted} split only — NO salts. Register is a
   * validator-triggered action; the salts stay in server custody on the pdd
   * row and are fetched by the PROPONENT via getDisclosure when building
   * selective-disclosure proofs.
   */
  disclosure: DisclosureSplit;
}

export async function registerProject(
  prisma: PrismaClient,
  actor: AuditActor,
  pddId: string,
): Promise<RegisterResult> {
  return prisma.$transaction(async (tx) => {
    const pdd = await requirePdd(tx, actor.org, pddId);
    // Same guard as the SPA store: only an under-validation PDD can register.
    if (pdd.state !== 'under_validation') illegalTransition('register', pdd.state);

    const m = await tx.methodology.findUniqueOrThrow({ where: { id: pdd.methodology_id } });
    const doc = documentOf(m);
    const sectionData = (pdd.section_data ?? {}) as Record<string, unknown>;

    // Server-side re-validation (the SPA validated in the browser).
    const check = validatePdd(doc, sectionData);
    if (!check.ok) {
      const missing = check.missing.map((x) => `${x.section}.${x.field} (${x.label})`).join(', ');
      throw appError(422, 'UNPROCESSABLE', `PDD is incomplete — missing required fields: ${missing}`);
    }

    const snapshot = pdd.methodology_snapshot || `${doc.code} ${doc.version}`;
    const content_hash = pddContentHash({
      methodology_snapshot: snapshot,
      section_data: sectionData,
      evidence_ids: pdd.evidence_ids,
    });
    const validated_at = new Date();
    // Guardian publish step: full PDD stays off-chain; the VC carries hash + CID.
    const ipfs_cid = toIpfsCid(content_hash);

    // One private salt per sensitive published field, so value hashes are
    // non-guessable. The server keeps custody of the salts on the pdd row;
    // the proponent fetches them via getDisclosure, and value + salt verify
    // offline against the VC. (SPA: randomSaltHex — node:crypto here.)
    const salts: Record<string, string> = {};
    for (const key of sensitiveFieldKeys(doc, sectionData)) {
      salts[key] = randomBytes(16).toString('hex');
    }
    const disclosure = splitDisclosure(doc, sectionData, salts);

    // credential_id stays null here: the proponent's BROWSER signs the PDD
    // Registration VC (keys never leave the client) and POSTs the signed
    // object via /api/v1/pdds/:id/credential in Task 8.
    const updated = await tx.pdd.update({
      where: { id: pdd.id },
      data: {
        state: 'registered',
        methodology_snapshot: snapshot,
        validated_at,
        content_hash,
        ipfs_cid,
        disclosure_salts: salts,
      },
    });
    await tx.project.update({
      where: { id: pdd.project_id },
      data: { lifecycle_stage: 'registered' },
    });
    await writeAudit(tx, {
      userId: actor.userId,
      role: actor.role,
      ip: actor.ip,
      action: 'PROJECT_REGISTERED',
      entityType: 'pdd',
      entityId: pdd.id,
      // SPA payload shape minus the credential fields (credential_id /
      // sequence_number only exist once the browser-signed VC lands, Task 8).
      payload: { methodology: snapshot, ipfs_cid, topic_id: projectTopicId(pdd.project_id) },
      previousValue: { state: pdd.state },
      newValue: { state: 'registered', content_hash, ipfs_cid },
    });
    return { pdd: updated, disclosure };
  });
}

// ---------------- getDisclosure ----------------
export interface DisclosureResult extends DisclosureSplit {
  /**
   * ⚠️ The ONLY place salts ever leave the server. This endpoint is
   * proponent-scoped (project_owner | esg_manager | admin — never verifiers):
   * the owner fetches value salts to prove redacted fields offline
   * (verifyDisclosedValue) and to build VC subjects. The server remains the
   * custodian — PublicPdd, lists and every other response omit them.
   */
  disclosure_salts: Record<string, string>;
}

export async function getDisclosure(
  prisma: PrismaClient,
  organizationId: string,
  pddId: string,
): Promise<DisclosureResult> {
  const pdd = await requirePdd(prisma, organizationId, pddId);
  // Salts (and the frozen split) only exist once registration froze the PDD.
  if (pdd.state !== 'registered') {
    throw appError(409, 'CONFLICT', `PDD is not registered yet (state: "${pdd.state}")`);
  }
  const m = await prisma.methodology.findUniqueOrThrow({ where: { id: pdd.methodology_id } });
  const salts = (pdd.disclosure_salts ?? {}) as Record<string, string>;
  // Deterministic recomputation of the frozen split: same doc, same frozen
  // section_data, same persisted salts ⇒ bit-identical hashes as at register.
  const split = splitDisclosure(documentOf(m), (pdd.section_data ?? {}) as Record<string, unknown>, salts);
  return { ...split, disclosure_salts: salts };
}

// ---------------- rejectPdd ----------------
export async function rejectPdd(
  prisma: PrismaClient,
  actor: AuditActor,
  pddId: string,
  reason: string,
): Promise<Pdd> {
  return prisma.$transaction(async (tx) => {
    const pdd = await requirePdd(tx, actor.org, pddId);
    if (pdd.state !== 'under_validation') illegalTransition('reject', pdd.state);
    const updated = await tx.pdd.update({
      where: { id: pdd.id },
      data: { state: 'rejected', rejection_reason: reason },
    });
    await tx.project.update({
      where: { id: pdd.project_id },
      data: { lifecycle_stage: 'rejected' },
    });
    await writeAudit(tx, {
      userId: actor.userId,
      role: actor.role,
      ip: actor.ip,
      action: 'PDD_REJECTED',
      entityType: 'pdd',
      entityId: pdd.id,
      payload: { reason },
      previousValue: { state: pdd.state },
      newValue: { state: 'rejected', reason },
    });
    return updated;
  });
}

// ---------------- addPddComment ----------------
// PDD threads live in the shared verification_comments table with
// verification_id = pdd.id — exactly the SPA's reuse of VerificationComment.
export async function addPddComment(
  prisma: PrismaClient,
  actor: AuditActor,
  pddId: string,
  body: string,
  sectionKey?: string,
) {
  return prisma.$transaction(async (tx) => {
    const pdd = await requirePdd(tx, actor.org, pddId);
    const author = await tx.user.findUniqueOrThrow({
      where: { id: actor.userId },
      select: { name: true },
    });
    const comment = await tx.verificationComment.create({
      data: {
        id: uid('cmt'),
        verification_id: pdd.id,
        evidence_id: null,
        section_key: sectionKey ?? null,
        author_id: actor.userId,
        author_name: author.name,
        author_role: actor.role,
        body,
      },
    });
    await writeAudit(tx, {
      userId: actor.userId,
      role: actor.role,
      ip: actor.ip,
      action: 'COMMENT_ADDED',
      entityType: 'pdd',
      entityId: pdd.id,
      payload: sectionKey ? { section: sectionKey } : {},
      newValue: { body },
    });
    return comment;
  });
}

// ---------------- reads ----------------

/**
 * List PDDs, org-scoped. Without a state filter this is the SPA's
 * validationQueue(): every in-flight PDD needing validator attention —
 * state NOT in draft/registered/rejected (revision_required included).
 */
export async function listPdds(
  prisma: PrismaClient,
  organizationId: string,
  state?: PddState,
): Promise<Pdd[]> {
  return prisma.pdd.findMany({
    where: {
      project: { organization_id: organizationId },
      state: state ?? { notIn: ['draft', 'registered', 'rejected'] },
    },
    orderBy: [{ submitted_at: { sort: 'asc', nulls: 'first' } }, { id: 'asc' }], // oldest submission first — queue order
  });
}

/** The project's PDD (SPA pddByProject); 404 when the project has none yet. */
export async function getPddByProject(
  prisma: PrismaClient,
  organizationId: string,
  projectId: string,
): Promise<Pdd> {
  const project = await prisma.project.findFirst({
    where: { id: projectId, organization_id: organizationId },
    select: { id: true },
  });
  if (!project) throw appError(404, 'NOT_FOUND', 'Project not found');
  const pdd = await prisma.pdd.findFirst({ where: { project_id: projectId } });
  if (!pdd) throw appError(404, 'NOT_FOUND', 'Project has no PDD yet');
  return pdd;
}

export async function getPdd(
  prisma: PrismaClient,
  organizationId: string,
  pddId: string,
): Promise<Pdd> {
  return requirePdd(prisma, organizationId, pddId);
}

export async function listPddComments(prisma: PrismaClient, pddId: string) {
  return prisma.verificationComment.findMany({
    where: { verification_id: pddId },
    orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
  });
}
