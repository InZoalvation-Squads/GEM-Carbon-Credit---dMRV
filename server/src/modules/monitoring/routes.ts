// Registered under the /api/v1/projects prefix — monitoring records are a
// sub-resource of a project, exactly how the SPA scopes them.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { actorFromRequest } from '../../lib/audit.js';
import { isoDateString } from '../../lib/validation.js';
import { addMonitoringRecords, listMonitoringRecords, serializeRecord } from './service.js';

const UploadBody = z.object({
  rows: z
    .array(
      z.object({
        record_date: isoDateString,
        generation_kwh: z.number().min(0, 'generation_kwh must be ≥ 0'),
      }),
    )
    .min(1, 'at least one row is required'),
});

const RangeQuery = z.object({
  from: isoDateString.optional(),
  to: isoDateString.optional(),
});

const Params = z.object({ id: z.string().min(1) });

export async function monitoringRoutes(app: FastifyInstance): Promise<void> {
  // Uploading data is a proponent-side action, same circle as project writes;
  // verifiers only ever read.
  app.post(
    '/:id/monitoring',
    { preHandler: [app.authenticate, app.requireRole('project_owner', 'admin', 'esg_manager')] },
    async (req, reply) => {
      const { id } = Params.parse(req.params);
      const { rows } = UploadBody.parse(req.body ?? {});
      const accepted = await addMonitoringRecords(app.prisma, actorFromRequest(req), id, rows);
      return reply.code(201).send({ accepted });
    },
  );

  app.get('/:id/monitoring', { preHandler: [app.authenticate] }, async (req) => {
    const { id } = Params.parse(req.params);
    const range = RangeQuery.parse(req.query ?? {});
    const records = await listMonitoringRecords(app.prisma, req.user.org, id, range);
    return { records: records.map(serializeRecord) };
  });
}
