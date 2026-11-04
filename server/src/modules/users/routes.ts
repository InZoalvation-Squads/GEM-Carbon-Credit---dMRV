import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { unauthorized } from '../../lib/errors.js';
import { actorFromRequest } from '../../lib/audit.js';
import { provisionUser, serializeUser } from './service.js';

// Admin-only provisioning of the roles self-registration cannot grant.
// 'admin' stays absent — admins are created via seed/ops.
const ProvisionBody = z.object({
  name: z.string().trim().min(1, 'name is required'),
  email: z.email().transform((e) => e.toLowerCase()),
  role: z.enum(['project_owner', 'esg_manager', 'verifier']),
  password: z.string().min(8, 'password must be at least 8 characters'),
});

export async function usersRoutes(app: FastifyInstance): Promise<void> {
  app.get('/me', { preHandler: [app.authenticate] }, async (req) => {
    const user = await app.prisma.user.findUnique({ where: { id: req.user.sub } });
    // Valid token but the account is gone — treat as unauthenticated.
    if (!user) throw unauthorized();
    return { user: serializeUser(user) };
  });

  app.post(
    '/',
    { preHandler: [app.authenticate, app.requireRole('admin')] },
    async (req, reply) => {
      const body = ProvisionBody.parse(req.body ?? {});
      const user = await provisionUser(app.prisma, actorFromRequest(req), body);
      return reply.code(201).send({ user: serializeUser(user) });
    },
  );
}
