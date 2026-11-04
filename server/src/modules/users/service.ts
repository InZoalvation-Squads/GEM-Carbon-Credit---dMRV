import type { PrismaClient, User, UserRole } from '@prisma/client';
import { writeAudit, type AuditActor } from '../../lib/audit.js';
import { createUserRow, type ProvisionableRole } from '../auth/service.js';

/** Admin creates a user in the admin's own organization (audited). */
export async function provisionUser(
  prisma: PrismaClient,
  actor: AuditActor,
  input: { name: string; email: string; role: ProvisionableRole; password: string },
): Promise<User> {
  return prisma.$transaction(async (tx) => {
    const user = await createUserRow(tx, actor.org, input);
    await writeAudit(tx, {
      userId: actor.userId,
      role: actor.role,
      ip: actor.ip,
      action: 'USER_PROVISIONED',
      entityType: 'user',
      entityId: user.id,
      newValue: { email: user.email, role: user.role },
    });
    return user;
  });
}

/**
 * Public user shape — the ONLY way user rows leave the API. Sensitive
 * columns (password_hash, refresh_token_hash, refresh_token_expires_at)
 * never appear in any response.
 */
export interface PublicUser {
  id: string;
  organization_id: string;
  email: string;
  name: string;
  role: UserRole;
  created_at: string;
}

export function serializeUser(user: User): PublicUser {
  return {
    id: user.id,
    organization_id: user.organization_id,
    email: user.email,
    name: user.name,
    role: user.role,
    created_at: user.created_at.toISOString(),
  };
}
