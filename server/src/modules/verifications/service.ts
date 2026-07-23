// Ported from carbon-ready/src/store/index.ts — submitVerification, startReview,
// requestRevision, approveVerification, rejectVerification, addComment. Same
// state guards (submit from draft|revision_required, start-review from
// submitted, request-revision/approve/reject from under_review), same audit
// actions and payload shapes; approve computes hash_value with the exact SPA
// recipe. Create has no SPA counterpart (packages came from seed) — see below.
import type {
  EvidenceCategory,
  Prisma,
  PrismaClient,
  UserRole,
  VerificationComment,
  VerificationRequest,
  VerificationState,
} from '@prisma/client';
import { writeAudit, type AuditActor } from '../../lib/audit.js';
import { appError } from '../../lib/errors.js';
import { shortHash } from '../../lib/hash.js';
import { uid } from '../../lib/uid.js';

/** Seeded reviewer; reassignment out of scope (same stand-in as the SPA seed). */
const ASSIGNED_VERIFIER = 'Daniel Okoye';
/** Defaults mirroring the SPA seed/demo packages. */
const DEFAULT_REQUIRED_CATEGORIES: EvidenceCategory[] = [
  'meter_reading',
  'utility_bill',
  'commissioning_report',
  'site_photo',
];
const DEFAULT_SLA_TARGET_DAYS = 7;

/** Public verification shape — explicit typed allowlist, NEVER a `{ ...row }` spread. */
export type PublicVerification = {
  id: string;
  project_id: string;
  created_by: string;
  owner_name: string;
  assigned_verifier_name: string;
  state: VerificationState;
  monitoring_period_start: string;
  monitoring_period_end: string;
  reduction_kgco2e: number;
  factors_snapshot: string;
  evidence_ids: string[];
  required_categories: EvidenceCategory[];
  submitted_at: string | null;
  locked_at: string | null;
  sla_target_days: number;
  rejection_reason: string | null;
  hash_value: string | null;
  credential_id: string | null;
  anchored_at: string | null;
  hcs_topic_id: string | null;
  hcs_sequence_number: number | null;
};

export function serializeVerification(v: VerificationRequest): PublicVerification {
  return {
    id: v.id,
    project_id: v.project_id,
    created_by: v.created_by,
    owner_name: v.owner_name,
    assigned_verifier_name: v.assigned_verifier_name,
    state: v.state,
    monitoring_period_start: v.monitoring_period_start,
    monitoring_period_end: v.monitoring_period_end,
    reduction_kgco2e: v.reduction_kgco2e,
    factors_snapshot: v.factors_snapshot,
    evidence_ids: v.evidence_ids,
    required_categories: v.required_categories,
    submitted_at: v.submitted_at?.toISOString() ?? null,
    locked_at: v.locked_at?.toISOString() ?? null,
    sla_target_days: v.sla_target_days,
    rejection_reason: v.rejection_reason,
    hash_value: v.hash_value,
    credential_id: v.credential_id,
    anchored_at: v.anchored_at?.toISOString() ?? null,
    hcs_topic_id: v.hcs_topic_id,
    hcs_sequence_number: v.hcs_sequence_number,
  };
}

/**
 * Public comment shape (shared with the pdds module — PDD threads live in the
 * same table with verification_id = pdd.id). Explicit allowlist.
 */
export type PublicComment = {
  id: string;
  verification_id: string;
  evidence_id: string | null;
  evidence_name: string | null;
  section_key: string | null;
  author_id: string;
  author_name: string;
  author_role: UserRole;
  body: string;
  reply_to: string | null;
  created_at: string;
};

export function serializeComment(c: VerificationComment): PublicComment {
  return {
    id: c.id,
    verification_id: c.verification_id,
    evidence_id: c.evidence_id,
    evidence_name: c.evidence_name,
    section_key: c.section_key,
    author_id: c.author_id,
    author_name: c.author_name,
    author_role: c.author_role,
    body: c.body,
    reply_to: c.reply_to,
    created_at: c.created_at.toISOString(),
  };
}

type Tx = Prisma.TransactionClient;

/** Org-scoped lookup: a foreign package is indistinguishable from a missing one. */
async function requireVerification(
  tx: Tx,
  organizationId: string,
  id: string,
): Promise<VerificationRequest> {
  const row = await tx.verificationRequest.findFirst({
    where: { id, project: { organization_id: organizationId } },
  });
  if (!row) throw appError(404, 'NOT_FOUND', 'Verification not found');
  return row;
}

function illegalTransition(action: string, state: VerificationState): never {
  throw appError(409, 'CONFLICT', `Cannot ${action} a verification in state "${state}"`);
}

// ---------------- create ----------------
export interface CreateVerificationInput {
  project_id: string;
  monitoring_period_start: string;
  monitoring_period_end: string;
  reduction_kgco2e: number;
  factors_snapshot: string;
  evidence_ids: string[];
  required_categories?: EvidenceCategory[];
  sla_target_days?: number;
}

/**
 * Create a draft package. Intentionally UNAUDITED: the SPA store has no create
 * action (packages arrived via seed), so the audit trail's first verification
 * event is VERIFICATION_SUBMITTED — the server mirrors that exactly.
 */
export async function createVerification(
  prisma: PrismaClient,
  actor: AuditActor,
  input: CreateVerificationInput,
): Promise<VerificationRequest> {
  const project = await prisma.project.findFirst({
    where: { id: input.project_id, organization_id: actor.org },
    select: { id: true },
  });
  if (!project) throw appError(404, 'NOT_FOUND', 'Project not found');
  const creator = await prisma.user.findUniqueOrThrow({
    where: { id: actor.userId },
    select: { name: true },
  });
  return prisma.verificationRequest.create({
    data: {
      id: uid('VR'),
      project_id: input.project_id,
      created_by: actor.userId,
      owner_name: creator.name, // like seed: the proponent's display name
      assigned_verifier_name: ASSIGNED_VERIFIER,
      state: 'draft',
      monitoring_period_start: input.monitoring_period_start,
      monitoring_period_end: input.monitoring_period_end,
      reduction_kgco2e: input.reduction_kgco2e,
      factors_snapshot: input.factors_snapshot,
      evidence_ids: input.evidence_ids,
      required_categories: input.required_categories ?? DEFAULT_REQUIRED_CATEGORIES,
      sla_target_days: input.sla_target_days ?? DEFAULT_SLA_TARGET_DAYS,
    },
  });
}

// ---------------- submitVerification ----------------
export async function submitVerification(
  prisma: PrismaClient,
  actor: AuditActor,
  id: string,
): Promise<VerificationRequest> {
  return prisma.$transaction(async (tx) => {
    const v = await requireVerification(tx, actor.org, id);
    if (v.state !== 'draft' && v.state !== 'revision_required') illegalTransition('submit', v.state);
    const updated = await tx.verificationRequest.update({
      where: { id: v.id },
      data: { state: 'submitted', submitted_at: v.submitted_at ?? new Date() },
    });
    await writeAudit(tx, {
      userId: actor.userId,
      role: actor.role,
      ip: actor.ip,
      action: 'VERIFICATION_SUBMITTED',
      entityType: 'verification',
      entityId: v.id,
      payload: {},
      // The SPA hardcodes previous_value {state:'draft'} even when
      // resubmitting from revision_required — replicated verbatim.
      previousValue: { state: 'draft' },
      newValue: { state: 'submitted' },
    });
    return updated;
  });
}

// ---------------- startReview ----------------
export async function startReview(
  prisma: PrismaClient,
  actor: AuditActor,
  id: string,
): Promise<VerificationRequest> {
  return prisma.$transaction(async (tx) => {
    const v = await requireVerification(tx, actor.org, id);
    if (v.state !== 'submitted') illegalTransition('start review on', v.state);
    const updated = await tx.verificationRequest.update({
      where: { id: v.id },
      data: { state: 'under_review' },
    });
    await writeAudit(tx, {
      userId: actor.userId,
      role: actor.role,
      ip: actor.ip,
      action: 'REVIEW_STARTED',
      entityType: 'verification',
      entityId: v.id,
      payload: {},
      previousValue: { state: 'submitted' },
      newValue: { state: 'under_review' },
    });
    return updated;
  });
}

// ---------------- requestRevision ----------------
export async function requestRevision(
  prisma: PrismaClient,
  actor: AuditActor,
  id: string,
  summary: string,
): Promise<VerificationRequest> {
  return prisma.$transaction(async (tx) => {
    const v = await requireVerification(tx, actor.org, id);
    if (v.state !== 'under_review') illegalTransition('request revision on', v.state);
    // SPA stores only the state flip; the summary lives in the audit entry.
    const updated = await tx.verificationRequest.update({
      where: { id: v.id },
      data: { state: 'revision_required' },
    });
    await writeAudit(tx, {
      userId: actor.userId,
      role: actor.role,
      ip: actor.ip,
      action: 'REVISION_REQUESTED',
      entityType: 'verification',
      entityId: v.id,
      payload: { summary },
      previousValue: { state: 'under_review' },
      newValue: { state: 'revision_required', summary },
    });
    return updated;
  });
}

// ---------------- approveVerification ----------------
export async function approveVerification(
  prisma: PrismaClient,
  actor: AuditActor,
  id: string,
  note?: string,
): Promise<VerificationRequest> {
  return prisma.$transaction(async (tx) => {
    const v = await requireVerification(tx, actor.org, id);
    if (v.state !== 'under_review') illegalTransition('approve', v.state);
    const lockedAt = new Date();
    const locked_at = lockedAt.toISOString();
    // EXACT SPA recipe (store approveVerification) — the package lock hash.
    const hash_value = shortHash(
      `${v.id}|${v.project_id}|${v.reduction_kgco2e}|${v.evidence_ids.join(',')}|${locked_at}`,
    );
    const updated = await tx.verificationRequest.update({
      where: { id: v.id },
      data: { state: 'approved', locked_at: lockedAt, hash_value },
    });
    await writeAudit(tx, {
      userId: actor.userId,
      role: actor.role,
      ip: actor.ip,
      action: 'VERIFICATION_APPROVED',
      entityType: 'verification',
      entityId: v.id,
      payload: { reduction_tco2e: v.reduction_kgco2e / 1000, note: note ?? null },
      previousValue: { state: v.state },
      newValue: { state: 'approved', hash_value, locked_at },
    });
    return updated;
  });
}

// ---------------- rejectVerification ----------------
export async function rejectVerification(
  prisma: PrismaClient,
  actor: AuditActor,
  id: string,
  reason: string,
): Promise<VerificationRequest> {
  return prisma.$transaction(async (tx) => {
    const v = await requireVerification(tx, actor.org, id);
    if (v.state !== 'under_review') illegalTransition('reject', v.state);
    const updated = await tx.verificationRequest.update({
      where: { id: v.id },
      data: { state: 'rejected', rejection_reason: reason },
    });
    await writeAudit(tx, {
      userId: actor.userId,
      role: actor.role,
      ip: actor.ip,
      action: 'VERIFICATION_REJECTED',
      entityType: 'verification',
      entityId: v.id,
      payload: { reason },
      previousValue: { state: v.state },
      newValue: { state: 'rejected', reason },
    });
    return updated;
  });
}

// ---------------- addComment ----------------
export async function addComment(
  prisma: PrismaClient,
  actor: AuditActor,
  verificationId: string,
  body: string,
  evidenceId?: string,
): Promise<VerificationComment> {
  return prisma.$transaction(async (tx) => {
    const v = await requireVerification(tx, actor.org, verificationId);
    // The SPA passes {id, name} from its evidence store; the server resolves
    // the name from the evidence row (must belong to the same project).
    let evidence: { id: string; file_name: string } | null = null;
    if (evidenceId) {
      evidence = await tx.evidenceFile.findFirst({
        where: { id: evidenceId, project_id: v.project_id },
        select: { id: true, file_name: true },
      });
      if (!evidence) throw appError(404, 'NOT_FOUND', 'Evidence not found');
    }
    const author = await tx.user.findUniqueOrThrow({
      where: { id: actor.userId },
      select: { name: true },
    });
    const comment = await tx.verificationComment.create({
      data: {
        id: uid('cmt'),
        verification_id: v.id,
        evidence_id: evidence?.id ?? null,
        evidence_name: evidence?.file_name ?? null,
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
      entityType: 'verification',
      entityId: v.id,
      payload: evidence ? { evidence: evidence.file_name } : {},
      newValue: { body },
    });
    return comment;
  });
}

// ---------------- reads ----------------
export async function listVerifications(
  prisma: PrismaClient,
  organizationId: string,
  filter: { project_id?: string; state?: VerificationState },
): Promise<VerificationRequest[]> {
  return prisma.verificationRequest.findMany({
    where: {
      project: { organization_id: organizationId },
      project_id: filter.project_id,
      state: filter.state,
    },
    // Newest submission first, drafts (unsubmitted) on top — SPA store order.
    orderBy: [{ submitted_at: { sort: 'desc', nulls: 'first' } }, { id: 'desc' }],
  });
}

export async function getVerification(
  prisma: PrismaClient,
  organizationId: string,
  id: string,
): Promise<VerificationRequest> {
  return requireVerification(prisma, organizationId, id);
}

export async function listComments(
  prisma: PrismaClient,
  verificationId: string,
): Promise<VerificationComment[]> {
  return prisma.verificationComment.findMany({
    where: { verification_id: verificationId },
    orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
  });
}
