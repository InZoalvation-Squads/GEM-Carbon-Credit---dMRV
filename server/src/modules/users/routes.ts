import type { FastifyInstance } from 'fastify';
import { unauthorized } from '../../lib/errors.js';
import { serializeUser } from './service.js';

export async function usersRoutes(app: FastifyInstance): Promise<void> {
  app.get('/me', { preHandler: [app.authenticate] }, async (req) => {
    const user = await app.prisma.user.findUnique({ where: { id: req.user.sub } });
    // Valid token but the account is gone — treat as unauthenticated.
    if (!user) throw unauthorized();
    return { user: serializeUser(user) };
  });
}
