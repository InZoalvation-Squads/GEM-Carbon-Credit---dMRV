// Read-only audit API: paginated chain reads plus full-chain verification.
// Hash recomputation reuses auditCoreOf/auditRowHash from lib/audit.ts — the
// exact construction writeAudit hashes — so this can never drift from the
// writer's recipe.
import type { AuditLog, Prisma, PrismaClient } from '@prisma/client';
import { auditCoreOf, auditRowHash } from '../../lib/audit.js';

/**
 * Public audit-entry shape — explicit typed allowlist, NEVER a `{ ...row }`
 * spread (module convention; see factors/service.ts).
 */
export type PublicAuditEntry = {
  id: string;
  seq: number;
  user_id: string;
  user_role: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  payload: unknown;
  previous_value: unknown;
  new_value: unknown;
  ip_address: string | null;
  hcs_topic_id: string | null;
  hcs_sequence_number: number | null;
  created_at: string;
  row_hash: string;
  prev_row_hash: string | null;
};

export function serializeAuditEntry(row: AuditLog): PublicAuditEntry {
  return {
    id: row.id,
    // seq is a Postgres BIGINT (Prisma BigInt) and JSON.stringify throws a
    // TypeError on BigInt values. It is a plain autoincrement insert counter,
    // permanently far below Number.MAX_SAFE_INTEGER (2^53 - 1), so Number()
    // is lossless here.
    seq: Number(row.seq),
    user_id: row.user_id,
    user_role: row.user_role ?? null,
    action: row.action,
    entity_type: row.entity_type,
    entity_id: row.entity_id,
    payload: row.payload,
    previous_value: row.previous_value ?? null,
    new_value: row.new_value ?? null,
    ip_address: row.ip_address,
    hcs_topic_id: row.hcs_topic_id,
    hcs_sequence_number: row.hcs_sequence_number,
    created_at: row.created_at.toISOString(),
    row_hash: row.row_hash,
    prev_row_hash: row.prev_row_hash,
  };
}

export interface ListAuditInput {
  limit: number;
  beforeSeq?: bigint;
  action?: string;
  entityType?: string;
}

/** Newest-first page of the chain; `beforeSeq` is an exclusive cursor. */
export async function listAudit(prisma: PrismaClient, input: ListAuditInput): Promise<AuditLog[]> {
  const where: Prisma.AuditLogWhereInput = {};
  if (input.beforeSeq !== undefined) where.seq = { lt: input.beforeSeq };
  if (input.action !== undefined) where.action = input.action;
  if (input.entityType !== undefined) where.entity_type = input.entityType;
  return prisma.auditLog.findMany({
    where,
    orderBy: { seq: 'desc' },
    take: input.limit,
  });
}

export interface VerifyResult {
  ok: boolean;
  /** Rows confirmed intact (the whole chain when ok, rows before the break otherwise). */
  checked: number;
  /** seq of the first row whose hash or back-link fails (only when !ok). */
  broken_at_seq?: number;
}

/** Rows per findMany while walking the chain (the test DB may be remote). */
const VERIFY_BATCH_SIZE = 500;

/**
 * Walk the WHOLE chain ascending by seq (its authoritative order), checking
 * for every row that (a) prev_row_hash equals the previous row's row_hash —
 * catches deletions and re-parenting — and (b) the stored row_hash recomputes
 * from the core fields — catches edits. Batched keyset scan; appends land at
 * the end of the walk, so verifying a live chain stays consistent.
 */
export async function verifyAuditChain(prisma: PrismaClient): Promise<VerifyResult> {
  let prevHash: string | null = null;
  let checked = 0;
  let cursor: bigint | null = null;

  for (;;) {
    const rows: AuditLog[] = await prisma.auditLog.findMany({
      orderBy: { seq: 'asc' },
      take: VERIFY_BATCH_SIZE,
      ...(cursor === null ? {} : { cursor: { seq: cursor }, skip: 1 }),
    });
    if (rows.length === 0) return { ok: true, checked };

    for (const row of rows) {
      const linksToPredecessor = (row.prev_row_hash ?? null) === prevHash;
      const recomputed = auditRowHash(prevHash, auditCoreOf(row));
      if (!linksToPredecessor || recomputed !== row.row_hash) {
        return { ok: false, checked, broken_at_seq: Number(row.seq) };
      }
      checked += 1;
      prevHash = row.row_hash;
    }
    cursor = rows[rows.length - 1]!.seq;
  }
}
