import type { AuditAction, AuditLog, EntityType, UUID } from '../types';

let auditSeq = 0;
export function newAudit(
  userId: UUID,
  action: AuditAction,
  entity_type: EntityType,
  entity_id: UUID | null,
  payload: Record<string, unknown> = {}
): AuditLog {
  auditSeq++;
  return {
    id: `aud-${Date.now()}-${auditSeq}`,
    user_id: userId,
    action,
    entity_type,
    entity_id,
    payload,
    hcs_topic_id: null,
    hcs_sequence_number: null,
    created_at: new Date().toISOString(),
  };
}
