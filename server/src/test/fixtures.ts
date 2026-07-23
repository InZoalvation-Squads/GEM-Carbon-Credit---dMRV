// Shared route-test fixtures: users/tokens per role + audit-chain assertions.
import { createHash } from 'node:crypto';
import { expect } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { AuditLog, PrismaClient, UserRole } from '@prisma/client';
import { canonical } from '../lib/hash.js';
import { uid } from '../lib/uid.js';

export const TEST_ORG_ID = 'org-0001';

/** Authorization header for an `app.inject` call. */
export function auth(token: string): { authorization: string } {
  return { authorization: `Bearer ${token}` };
}

export async function createOrg(
  prisma: PrismaClient,
  id = TEST_ORG_ID,
  name = 'GreenGrid Asia',
): Promise<void> {
  await prisma.organization.create({ data: { id, name, country: 'IN' } });
}

/** Register a user through the real API; returns their id + access token. */
export async function registerUser(
  app: FastifyInstance,
  role: 'project_owner' | 'esg_manager' | 'verifier',
  email = `${role}-${uid('u')}@example.com`,
): Promise<{ id: string; token: string }> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: { name: `Test ${role}`, email, role, password: 'password-123' },
  });
  expect(res.statusCode).toBe(201);
  const body = res.json();
  return { id: body.user.id, token: body.access_token };
}

/**
 * Admins cannot self-register (by design) — insert the row directly and sign
 * an access token, same claims the auth module issues.
 */
export async function createAdmin(
  app: FastifyInstance,
  prisma: PrismaClient,
  orgId = TEST_ORG_ID,
): Promise<{ id: string; token: string }> {
  const id = uid('usr');
  await prisma.user.create({
    data: {
      id,
      organization_id: orgId,
      email: `admin-${id}@example.com`,
      name: 'Test admin',
      role: 'admin',
      password_hash: 'not-a-real-hash',
    },
  });
  return { id, token: app.jwt.sign({ sub: id, role: 'admin' as UserRole, org: orgId }) };
}

/**
 * Recompute a stored row's hash INDEPENDENTLY of lib/audit.ts (node:crypto
 * for the digest; only `canonical` is shared) using the SPA's exact recipe:
 * row_hash = 'sha256-' + sha256((prev ?? '∅') + '|' + canonical(core)).
 */
export function expectedRowHash(row: AuditLog): string {
  const core = {
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
  const preimage = (row.prev_row_hash ?? '∅') + '|' + canonical(core);
  return 'sha256-' + createHash('sha256').update(preimage, 'utf8').digest('hex');
}

/**
 * Assert the tail of the audit chain is intact: the last two rows both
 * recompute to their stored row_hash and the head links to its predecessor.
 */
export async function expectValidChainTail(prisma: PrismaClient): Promise<AuditLog[]> {
  const rows = await prisma.auditLog.findMany({
    orderBy: { seq: 'desc' }, // seq is the chain's authoritative order
    take: 2,
  });
  expect(rows.length).toBeGreaterThan(0);
  for (const row of rows) expect(row.row_hash).toBe(expectedRowHash(row));
  if (rows.length === 2) expect(rows[0]!.prev_row_hash).toBe(rows[1]!.row_hash);
  return rows;
}

/** The newest audit row, for asserting what a mutation just recorded. */
export async function latestAudit(prisma: PrismaClient): Promise<AuditLog> {
  const row = await prisma.auditLog.findFirst({ orderBy: { seq: 'desc' } });
  expect(row).not.toBeNull();
  return row!;
}
