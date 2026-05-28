import type { AuditAction, AuditLog, EntityType, UserRole, UUID } from '../types';
import { canonical, shortHash } from '../lib/hash';

let auditSeq = 0;

export interface AuditExtra {
  user_role?: UserRole;
  ip_address?: string | null;
  previous_value?: Record<string, unknown> | null;
  new_value?: Record<string, unknown> | null;
}

// row_hash = hash(prev_row_hash || canonical(core fields)) — chains each entry
// to the previous one so any insertion or edit breaks the chain. Sprint 3 anchors
// the latest row_hash of an approved package to Hedera Guardian.
export function auditRowHash(prevHash: string | null, fields: Record<string, unknown>): string {
  return shortHash((prevHash ?? '∅') + '|' + canonical(fields));
}

export function newAudit(
  userId: UUID,
  action: AuditAction,
  entity_type: EntityType,
  entity_id: UUID | null,
  payload: Record<string, unknown> = {},
  extra: AuditExtra = {},
  prevRowHash: string | null = null
): AuditLog {
  auditSeq++;
  const created_at = new Date().toISOString();
  const core = {
    user_id: userId,
    user_role: extra.user_role ?? null,
    action,
    entity_type,
    entity_id,
    previous_value: extra.previous_value ?? null,
    new_value: extra.new_value ?? null,
    ip_address: extra.ip_address ?? null,
    created_at,
  };
  return {
    id: `aud-${Date.now()}-${auditSeq}`,
    ...core,
    payload,
    hcs_topic_id: null,
    hcs_sequence_number: null,
    row_hash: auditRowHash(prevRowHash, core),
    prev_row_hash: prevRowHash,
  };
}
