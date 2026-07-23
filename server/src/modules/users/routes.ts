import type { FastifyInstance } from 'fastify';
import { appError } from '../../lib/errors.js';
import { serializeUser } from '../auth/service.js';

export async function usersRoutes(app: FastifyInstance): Promise<void> {
  app.get('/me', { preHandler: [app.authenticate] }, async (req) => {
    const user = await app.prisma.user.findUnique({ where: { id: req.user.sub } });
    // Valid token but the account is gone — treat as unauthenticated.
    if (!user) throw appError(401, 'UNAUTHORIZED', 'Missing or invalid access token');
    return { user: serializeUser(user) };
  });
}
