// SF-04: I-REC(E) Issue Request service. Parallel to the verifications module
// (same shape: explicit typed serializer, org-scoped lookups, transactions +
// writeAudit for every mutation, illegalTransition idiom) — never entangled
// with VerificationRequest.
import type { Prisma, PrismaClient, RecIssueRequest, RecIssueState } from '@prisma/client';
import { writeAudit, type AuditActor } from '../../lib/audit.js';
import { appError } from '../../lib/errors.js';
import { uid } from '../../lib/uid.js';

/** Seeded Local Issuer stand-in (same pattern as ASSIGNED_VERIFIER). */
export const REC_REVIEWER_NAME = 'EGAT (Local Issuer)';

type Tx = Prisma.TransactionClient;

/** Σ generation_kwh ÷ 1000, rounded to 6 decimal places (SF-04 §1.3). */
export function computeTotalMwh(records: Array<{ generation_kwh: number }>): number {
  const kwh = records.reduce((sum, r) => sum + r.generation_kwh, 0);
  return Math.round((kwh / 1000) * 1e6) / 1e6;
}

/** Public REC issue request shape — explicit typed allowlist, NEVER a `{ ...row }` spread. */
export type PublicRecIssue = {
  id: string;
  project_id: string;
  created_by: string;
  owner_name: string;
  assigned_reviewer_name: string;
  state: RecIssueState;
  request_type: string;
  period_start: string;
  period_end: string;
  total_production_mwh: number;
  applied_mwh: number | null;
  facility_snapshot: Prisma.JsonValue;
  receiving_org_name: string;
  receiving_account_id: string;
  facility_id: string;
  requested_labels: string;
  evidence_ids: string[];
  submitted_at: string | null;
  issued_at: string | null;
  rejection_reason: string | null;
};

export function serializeRecIssue(r: RecIssueRequest): PublicRecIssue {
  return {
    id: r.id,
    project_id: r.project_id,
    created_by: r.created_by,
    owner_name: r.owner_name,
    assigned_reviewer_name: r.assigned_reviewer_name,
    state: r.state,
    request_type: r.request_type,
    period_start: r.period_start,
    period_end: r.period_end,
    total_production_mwh: r.total_production_mwh,
    applied_mwh: r.applied_mwh,
    facility_snapshot: r.facility_snapshot,
    receiving_org_name: r.receiving_org_name,
    receiving_account_id: r.receiving_account_id,
    facility_id: r.facility_id,
    requested_labels: r.requested_labels,
    evidence_ids: r.evidence_ids,
    submitted_at: r.submitted_at?.toISOString() ?? null,
    issued_at: r.issued_at?.toISOString() ?? null,
    rejection_reason: r.rejection_reason ?? null,
  };
}

function illegalTransition(action: string, state: RecIssueState): never {
  throw appError(409, 'CONFLICT', `Cannot ${action} a REC issue request in state "${state}"`);
}

/** Org-scoped lookup: a foreign request is indistinguishable from a missing one. */
async function requireRecIssue(tx: Tx, organizationId: string, id: string): Promise<RecIssueRequest> {
  const row = await tx.recIssueRequest.findFirst({
    where: { id, project: { organization_id: organizationId } },
  });
  if (!row) throw appError(404, 'NOT_FOUND', 'REC issue request not found');
  return row;
}

/** Project must belong to the org AND hold a registered REC registration. */
async function requireRecProject(
  tx: Tx,
  organizationId: string,
  projectId: string,
): Promise<{ project: { id: string }; pdd: { section_data: Prisma.JsonValue } }> {
  const project = await tx.project.findFirst({
    where: { id: projectId, organization_id: organizationId },
    select: { id: true },
  });
  if (!project) throw appError(404, 'NOT_FOUND', 'Project not found');
  const pdd = await tx.pdd.findFirst({
    where: { project_id: projectId, state: 'registered', methodology: { standard: 'REC' } },
    select: { section_data: true },
  });
  if (!pdd) {
    throw appError(
      400,
      'BAD_REQUEST',
      'Project has no registered REC registration (SF-02) — register it before requesting issuance',
    );
  }
  return { project, pdd };
}

function snapshotFromSectionData(sectionData: Prisma.JsonValue): Record<string, string> {
  const d = (sectionData ?? {}) as Record<string, unknown>;
  const s = (k: string) => (typeof d[k] === 'string' ? (d[k] as string) : '');
  return {
    evident_org_id: s('evident_org_id'),
    organisation_name: s('organisation_name'),
    facility_name: s('facility_name'),
    fuel_code: s('fuel_code'),
    fuel_description: s('fuel_description'),
    technology_code: s('technology_code'),
    technology_description: s('technology_description'),
  };
}

async function mwhForPeriod(tx: Tx, projectId: string, start: string, end: string): Promise<number> {
  const records = await tx.monitoringRecord.findMany({
    where: { project_id: projectId, record_date: { gte: start, lte: end } },
    select: { generation_kwh: true },
  });
  return computeTotalMwh(records);
}

// ---------------- createRecIssue ----------------
export interface CreateRecIssueInput {
  period_start: string;
  period_end: string;
  request_type: string;
  applied_mwh?: number;
  receiving_org_name?: string;
  receiving_account_id?: string;
  facility_id?: string;
  requested_labels?: string;
  evidence_ids?: string[];
}

export async function createRecIssue(
  prisma: PrismaClient,
  actor: AuditActor,
  projectId: string,
  input: CreateRecIssueInput,
): Promise<RecIssueRequest> {
  return prisma.$transaction(async (tx) => {
    const { pdd } = await requireRecProject(tx, actor.org, projectId);
    if (input.period_start > input.period_end) {
      throw appError(400, 'BAD_REQUEST', 'period_start must not be after period_end');
    }
    const total_production_mwh = await mwhForPeriod(tx, projectId, input.period_start, input.period_end);
    if (total_production_mwh <= 0) {
      throw appError(400, 'BAD_REQUEST', 'No production recorded in the selected period');
    }
    const creator = await tx.user.findUniqueOrThrow({
      where: { id: actor.userId },
      select: { name: true },
    });
    const row = await tx.recIssueRequest.create({
      data: {
        id: uid('RIR'),
        project_id: projectId,
        created_by: actor.userId,
        owner_name: creator.name,
        assigned_reviewer_name: REC_REVIEWER_NAME,
        state: 'draft',
        request_type: input.request_type,
        period_start: input.period_start,
        period_end: input.period_end,
        total_production_mwh,
        applied_mwh: input.applied_mwh ?? null,
        facility_snapshot: snapshotFromSectionData(pdd.section_data) as Prisma.InputJsonValue,
        receiving_org_name: input.receiving_org_name ?? '',
        receiving_account_id: input.receiving_account_id ?? '',
        facility_id: input.facility_id ?? '',
        requested_labels: input.requested_labels ?? '',
        evidence_ids: input.evidence_ids ?? [],
      },
    });
    await writeAudit(tx, {
      userId: actor.userId,
      role: actor.role,
      ip: actor.ip,
      action: 'REC_ISSUE_CREATED',
      entityType: 'rec_issue',
      entityId: row.id,
      payload: {},
      newValue: { state: 'draft', total_production_mwh },
    });
    return row;
  });
}

// ---------------- updateRecIssue ----------------
export interface UpdateRecIssuePatch {
  period_start?: string;
  period_end?: string;
  request_type?: string;
  applied_mwh?: number | null;
  receiving_org_name?: string;
  receiving_account_id?: string;
  facility_id?: string;
  requested_labels?: string;
  evidence_ids?: string[];
}

/**
 * Draft-only patch. Quiet (no audit) — routine editing, same rationale as
 * savePddDraft: the audit trail begins at submit, not at every keystroke.
 */
export async function updateRecIssue(
  prisma: PrismaClient,
  actor: AuditActor,
  id: string,
  patch: UpdateRecIssuePatch,
): Promise<RecIssueRequest> {
  return prisma.$transaction(async (tx) => {
    const r = await requireRecIssue(tx, actor.org, id);
    if (r.state !== 'draft') illegalTransition('update', r.state);

    const period_start = patch.period_start ?? r.period_start;
    const period_end = patch.period_end ?? r.period_end;
    const data: Prisma.RecIssueRequestUpdateInput = {
      period_start,
      period_end,
      request_type: patch.request_type ?? r.request_type,
      receiving_org_name: patch.receiving_org_name ?? r.receiving_org_name,
      receiving_account_id: patch.receiving_account_id ?? r.receiving_account_id,
      facility_id: patch.facility_id ?? r.facility_id,
      requested_labels: patch.requested_labels ?? r.requested_labels,
      evidence_ids: patch.evidence_ids ?? r.evidence_ids,
    };
    if ('applied_mwh' in patch) {
      data.applied_mwh = patch.applied_mwh ?? null;
    }
    if (patch.period_start !== undefined || patch.period_end !== undefined) {
      const total = await mwhForPeriod(tx, r.project_id, period_start, period_end);
      if (total <= 0) {
        throw appError(400, 'BAD_REQUEST', 'No production recorded in the selected period');
      }
      data.total_production_mwh = total;
    }

    return tx.recIssueRequest.update({ where: { id: r.id }, data });
  });
}

// ---------------- submitRecIssue ----------------
export async function submitRecIssue(
  prisma: PrismaClient,
  actor: AuditActor,
  id: string,
): Promise<RecIssueRequest> {
  return prisma.$transaction(async (tx) => {
    const r = await requireRecIssue(tx, actor.org, id);
    if (r.state !== 'draft') illegalTransition('submit', r.state);

    const total_production_mwh = await mwhForPeriod(tx, r.project_id, r.period_start, r.period_end);
    if (total_production_mwh <= 0) {
      throw appError(400, 'BAD_REQUEST', 'No production recorded in the selected period');
    }
    if (!r.receiving_org_name.trim() || !r.receiving_account_id.trim()) {
      throw appError(400, 'BAD_REQUEST', 'receiving_org_name and receiving_account_id are required to submit');
    }
    if (r.applied_mwh != null && (r.applied_mwh <= 0 || r.applied_mwh > total_production_mwh)) {
      throw appError(400, 'BAD_REQUEST', 'applied_mwh must be > 0 and ≤ total_production_mwh');
    }

    const updated = await tx.recIssueRequest.update({
      where: { id: r.id },
      data: { state: 'submitted', total_production_mwh, submitted_at: new Date() },
    });
    await writeAudit(tx, {
      userId: actor.userId,
      role: actor.role,
      ip: actor.ip,
      action: 'REC_ISSUE_SUBMITTED',
      entityType: 'rec_issue',
      entityId: r.id,
      payload: {},
      previousValue: { state: 'draft' },
      newValue: { state: 'submitted', total_production_mwh },
    });
    return updated;
  });
}

// ---------------- approveRecIssue ----------------
export async function approveRecIssue(
  prisma: PrismaClient,
  actor: AuditActor,
  id: string,
): Promise<RecIssueRequest> {
  return prisma.$transaction(async (tx) => {
    const r = await requireRecIssue(tx, actor.org, id);
    if (r.state !== 'submitted') illegalTransition('approve', r.state);

    const issuedAt = new Date();
    const updated = await tx.recIssueRequest.update({
      where: { id: r.id },
      data: { state: 'issued', issued_at: issuedAt },
    });
    await writeAudit(tx, {
      userId: actor.userId,
      role: actor.role,
      ip: actor.ip,
      action: 'REC_ISSUE_ISSUED',
      entityType: 'rec_issue',
      entityId: r.id,
      payload: { mwh: r.applied_mwh ?? r.total_production_mwh },
      previousValue: { state: 'submitted' },
      newValue: { state: 'issued', issued_at: issuedAt.toISOString() },
    });
    return updated;
  });
}

// ---------------- rejectRecIssue ----------------
export async function rejectRecIssue(
  prisma: PrismaClient,
  actor: AuditActor,
  id: string,
  reason: string,
): Promise<RecIssueRequest> {
  return prisma.$transaction(async (tx) => {
    const r = await requireRecIssue(tx, actor.org, id);
    if (r.state !== 'submitted') illegalTransition('reject', r.state);

    const updated = await tx.recIssueRequest.update({
      where: { id: r.id },
      data: { state: 'rejected', rejection_reason: reason },
    });
    await writeAudit(tx, {
      userId: actor.userId,
      role: actor.role,
      ip: actor.ip,
      action: 'REC_ISSUE_REJECTED',
      entityType: 'rec_issue',
      entityId: r.id,
      payload: { reason },
      previousValue: { state: 'submitted' },
      newValue: { state: 'rejected', reason },
    });
    return updated;
  });
}

// ---------------- deleteRecIssue ----------------
export async function deleteRecIssue(prisma: PrismaClient, actor: AuditActor, id: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const r = await requireRecIssue(tx, actor.org, id);
    if (r.state !== 'draft') throw appError(409, 'CONFLICT', `Cannot delete a REC issue request in state "${r.state}"`);

    await tx.recIssueRequest.delete({ where: { id: r.id } });
    await writeAudit(tx, {
      userId: actor.userId,
      role: actor.role,
      ip: actor.ip,
      action: 'REC_ISSUE_DELETED',
      entityType: 'rec_issue',
      entityId: r.id,
      payload: {},
      previousValue: { state: r.state },
      newValue: null,
    });
  });
}

// ---------------- reads ----------------
export async function listForProject(
  prisma: PrismaClient,
  organizationId: string,
  projectId: string,
): Promise<RecIssueRequest[]> {
  return prisma.recIssueRequest.findMany({
    where: { project_id: projectId, project: { organization_id: organizationId } },
    orderBy: { created_at: 'desc' },
  });
}

export async function listAll(prisma: PrismaClient, organizationId: string): Promise<RecIssueRequest[]> {
  return prisma.recIssueRequest.findMany({
    where: { project: { organization_id: organizationId } },
    orderBy: { created_at: 'desc' },
  });
}
