import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { actorFromRequest } from '../../lib/audit.js';
import { isoDateString } from '../../lib/validation.js';
import { addEmissionFactor, listFactors, serializeFactor } from './service.js';

const AddBody = z.object({
  country: z.string().trim().min(1, 'country is required'),
  source: z.string().trim().min(1, 'source is required'),
  factor_kgco2e_per_kwh: z.number().positive('factor_kgco2e_per_kwh must be > 0'),
  effective_date: isoDateString,
});

export async function factorsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/', { preHandler: [app.authenticate] }, async () => {
    const factors = await listFactors(app.prisma);
    return { factors: factors.map(serializeFactor) };
  });

  // Reference data is curated by the registry/ESG side, never project owners.
  app.post(
    '/',
    { preHandler: [app.authenticate, app.requireRole('admin', 'esg_manager')] },
    async (req, reply) => {
      const body = AddBody.parse(req.body ?? {});
      const factor = await addEmissionFactor(app.prisma, actorFromRequest(req), body);
      return reply.code(201).send({ factor: serializeFactor(factor) });
    },
  );
}
