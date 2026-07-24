import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { listAudit, serializeAuditEntry, verifyAuditChain } from './service.js';

const ListQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  // Kept as a string→BigInt transform (not z.coerce.bigint()): the cursor is
  // the raw seq column value and BigInt('abc') must surface as a 400, not throw.
  before_seq: z
    .string()
    .regex(/^\d+$/, 'must be a non-negative integer')
    .transform(BigInt)
    .optional(),
  action: z.string().trim().min(1).optional(),
  entity_type: z.string().trim().min(1).optional(),
});

export async function auditRoutes(app: FastifyInstance): Promise<void> {
  // The audit trail exposes every actor's activity across the org — registry
  // oversight roles only (same rule the SPA applies to its audit page).
  const reader = [app.authenticate, app.requireRole('admin', 'esg_manager')];

  app.get('/', { preHandler: reader }, async (req) => {
    const q = ListQuery.parse(req.query ?? {});
    const rows = await listAudit(app.prisma, {
      limit: q.limit,
      beforeSeq: q.before_seq,
      action: q.action,
      entityType: q.entity_type,
    });
    return { entries: rows.map(serializeAuditEntry) };
  });

  app.get('/verify', { preHandler: reader }, async () => {
    return verifyAuditChain(app.prisma);
  });
}
