import type { User, UserRole } from '@prisma/client';

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
