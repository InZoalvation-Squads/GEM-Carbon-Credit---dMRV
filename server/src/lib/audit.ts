// Server-side audit hash chain — ported from carbon-ready/src/store/audit.ts
// (source of truth for the algorithm until workspaces, Phase 1b). The core-field
// list, canonicalization and `∅` sentinel are replicated EXACTLY so server and
// SPA chains stay formally comparable.
import type { FastifyRequest } from 'fastify';
import { Prisma, type AuditLog, type UserRole } from '@prisma/client';
import { canonical, shortHash } from './hash.js';
import { uid } from './uid.js';

/**
 * Verbatim from carbon-ready/src/types/index.ts `AuditAction`, plus the
 * server-side extension listed at the bottom of the union.
 */
export type AuditAction =
  | 'PROJECT_CREATED'
  | 'PROJECT_UPDATED'
  | 'CSV_UPLOADED'
  | 'CALCULATION_EXECUTED'
  | 'EMISSION_FACTOR_ADDED'
  | 'EVIDENCE_UPLOADED'
  | 'EVIDENCE_REPLACED'
  | 'EVIDENCE_ARCHIVED'
  | 'VERIFICATION_SUBMITTED'
  | 'REVIEW_STARTED'
  | 'COMMENT_ADDED'
  | 'REVISION_REQUESTED'
  | 'VERIFICATION_APPROVED'
  | 'VERIFICATION_REJECTED'
  | 'VERIFICATION_ANCHORED'
  | 'METHODOLOGY_SELECTED'
  | 'METHODOLOGY_IMPORTED'
  | 'PDD_SUBMITTED'
  | 'VALIDATION_STARTED'
  | 'PDD_REVISION_REQUESTED'
  | 'PROJECT_REGISTERED'
  | 'PDD_REJECTED'
  | 'TOKEN_MINTED'
  // REC issuance (SF-04) — verbatim from the SPA union.
  | 'REC_ISSUE_CREATED'
  | 'REC_ISSUE_SUBMITTED'
  | 'REC_ISSUE_ISSUED'
  | 'REC_ISSUE_REJECTED'
  | 'REC_ISSUE_DELETED'
  // Server-side extension (NOT in the SPA union): the SPA registers + signs
  // the PDD credential in one browser action and folds the credential fields
  // into its PROJECT_REGISTERED entry; the server splits them because the
  // browser signs the VC AFTER register and POSTs it separately (Task 8).
  // AuditLog.action is a plain String column, so no migration is needed.
  | 'PDD_CREDENTIAL_ANCHORED'
  // Server-only: monitoring records pulled from the external IoT database
  // by the scheduled ingest worker (lib/iot.ts) — no human actor.
  | 'IOT_SYNCED';

/** Verbatim from carbon-ready/src/types/index.ts `EntityType`. */
export type EntityType =
  | 'project' | 'monitoring' | 'factor' | 'calculation'
  | 'evidence' | 'verification' | 'methodology' | 'pdd' | 'token' | 'rec_issue';

/** The authenticated caller, as every mutating service needs it. */
export interface AuditActor {
  userId: string;
  role: UserRole;
  org: string;
  ip: string | null;
}

/** Build the actor from a request whose JWT was already verified. */
export function actorFromRequest(req: FastifyRequest): AuditActor {
  return { userId: req.user.sub, role: req.user.role, org: req.user.org, ip: req.ip ?? null };
}

export interface AuditEntry {
  userId: string;
  // null = system job (e.g. the IoT ingest worker); the column is nullable.
  role: UserRole | null;
  ip: string | null;
  action: AuditAction;
  entityType: EntityType;
  entityId: string | null;
  payload?: Record<string, unknown>;
  previousValue?: Record<string, unknown> | null;
  newValue?: Record<string, unknown> | null;
}

// row_hash = hash(prev_row_hash || canonical(core fields)) — chains each entry
// to the previous one so any insertion or edit breaks the chain. Identical to
// the SPA's auditRowHash (carbon-ready/src/store/audit.ts).
export function auditRowHash(prevHash: string | null, fields: Record<string, unknown>): string {
  return shortHash((prevHash ?? '∅') + '|' + canonical(fields));
}

/**
 * The hashed core of a stored row — same field list (and same key order
 * irrelevance, thanks to canonical()) as the SPA's `newAudit`. Exposed so the
 * chain can be re-verified from persisted rows (tests now, GET /audit/verify
 * in Task 9).
 */
export function auditCoreOf(row: AuditLog): Record<string, unknown> {
  return {
    user_id: row.user_id,
    user_role: row.user_role ?? null,
    action: row.action,
    entity_type: row.entity_type,
    entity_id: row.entity_id,
    previous_value: row.previous_value ?? null,
    new_value: row.new_value ?? null,
    ip_address: row.ip_address ?? null,
    created_at: row.created_at.toISOString(),
  };
}

/**
 * Append one row to the audit chain. MUST be called inside the same
 * `prisma.$transaction` as the mutation it records, so the row and the change
 * commit (or roll back) together.
 *
 * Reads the current chain head inside the transaction; a pg advisory xact
 * lock serializes concurrent appends so the chain can never fork (two
 * transactions reading the same head would both chain onto it). The head is
 * the row with the highest `seq` — the monotonic insert counter — because
 * created_at has only ms precision and same-millisecond rows would tie.
 */
export async function writeAudit(tx: Prisma.TransactionClient, entry: AuditEntry): Promise<AuditLog> {
  // ::text because pg_advisory_xact_lock returns void, which Prisma cannot deserialize.
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('audit_log'))::text`;
  const head = await tx.auditLog.findFirst({
    orderBy: { seq: 'desc' },
    select: { row_hash: true },
  });
  const prevRowHash = head?.row_hash ?? null;

  const created_at = new Date(); // ms precision — matches @db column (timestamp(3)) exactly
  const core = {
    user_id: entry.userId,
    user_role: entry.role,
    action: entry.action,
    entity_type: entry.entityType,
    entity_id: entry.entityId,
    previous_value: entry.previousValue ?? null,
    new_value: entry.newValue ?? null,
    ip_address: entry.ip ?? null,
    created_at: created_at.toISOString(),
  };

  return tx.auditLog.create({
    data: {
      id: uid('aud'),
      user_id: entry.userId,
      user_role: entry.role,
      ip_address: entry.ip,
      action: entry.action,
      entity_type: entry.entityType,
      entity_id: entry.entityId,
      payload: (entry.payload ?? {}) as Prisma.InputJsonValue,
      previous_value:
        entry.previousValue == null ? Prisma.DbNull : (entry.previousValue as Prisma.InputJsonValue),
      new_value:
        entry.newValue == null ? Prisma.DbNull : (entry.newValue as Prisma.InputJsonValue),
      row_hash: auditRowHash(prevRowHash, core),
      prev_row_hash: prevRowHash,
      created_at,
    },
  });
}
