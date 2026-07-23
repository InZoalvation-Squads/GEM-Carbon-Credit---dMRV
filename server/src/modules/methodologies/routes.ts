import type { FastifyInstance } from 'fastify';
import { actorFromRequest } from '../../lib/audit.js';
import { idParams } from '../../lib/validation.js';
import {
  getMethodology,
  importMethodology,
  listMethodologies,
  serializeMethodology,
} from './service.js';

/**
 * Export filename, same convention as the SPA's download link
 * (carbon-ready/src/pages/Methodologies.tsx): a leading "v" in the stored
 * version is stripped so "v3.0" still yields `CODE-v3.0.json`. Double quotes
 * are stripped too — the filename is emitted inside a quoted
 * content-disposition parameter, and a stray `"` would break the header.
 */
function exportFileName(code: string, version: string): string {
  return `${code}-v${version.replace(/^v/i, '')}.json`.replace(/"/g, '');
}

export async function methodologiesRoutes(app: FastifyInstance): Promise<void> {
  app.get('/', { preHandler: [app.authenticate] }, async () => {
    const rows = await listMethodologies(app.prisma);
    return { methodologies: rows.map(serializeMethodology) };
  });

  app.get('/:id/export', { preHandler: [app.authenticate] }, async (req, reply) => {
    const { id } = idParams.parse(req.params);
    const row = await getMethodology(app.prisma, id);
    // The stored document verbatim (pretty-printed like methodologyToJson),
    // served as a download.
    return reply
      .header('content-disposition', `attachment; filename="${exportFileName(row.code, row.version)}"`)
      .type('application/json')
      .send(JSON.stringify(row.document, null, 2));
  });

  // Only the Standard Registry curates the methodology library (same rule as
  // the SPA store). Body = the raw JSON document, as an object or a string.
  app.post(
    '/import',
    { preHandler: [app.authenticate, app.requireRole('admin')] },
    async (req, reply) => {
      const row = await importMethodology(app.prisma, actorFromRequest(req), req.body);
      return reply.code(201).send({ methodology: serializeMethodology(row) });
    },
  );
}
