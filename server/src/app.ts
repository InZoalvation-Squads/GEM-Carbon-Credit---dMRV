import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { ZodError } from 'zod';
import { config } from './config.js';

/**
 * Uniform error envelope: every non-2xx response body is
 * `{ error: { code: string, message: string } }`.
 */
function envelope(code: string, message: string) {
  return { error: { code, message } };
}

/** zod issues → single message, capped at 3 issues (same style as the SPA). */
export function zodIssuesMessage(err: ZodError): string {
  const issues = err.issues.map((i) => {
    const path = i.path.join('.');
    return path ? `${path}: ${i.message}` : i.message;
  });
  const shown = issues.slice(0, 3);
  const extra = issues.length - shown.length;
  return extra > 0 ? `${shown.join('; ')} (+${extra} more)` : shown.join('; ');
}

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: process.env.NODE_ENV !== 'test' && { level: 'info' },
  });

  await app.register(cors, { origin: config.CORS_ORIGIN });
  // Registered globally but disabled by default; auth routes opt in with
  // route-level `config.rateLimit` (20/min per the design).
  await app.register(rateLimit, { global: false });

  app.setNotFoundHandler((req, reply) => {
    reply
      .code(404)
      .send(envelope('NOT_FOUND', `Route ${req.method} ${req.url} not found`));
  });

  app.setErrorHandler((err: FastifyError, _req, reply) => {
    if (err instanceof ZodError) {
      reply.code(400).send(envelope('VALIDATION_ERROR', zodIssuesMessage(err)));
      return;
    }
    const statusCode = typeof err.statusCode === 'number' ? err.statusCode : 500;
    if (statusCode >= 500) {
      app.log.error(err);
      reply.code(statusCode).send(envelope('INTERNAL_ERROR', 'Internal server error'));
      return;
    }
    reply.code(statusCode).send(envelope(err.code || 'REQUEST_ERROR', err.message));
  });

  app.get('/health', async () => ({ ok: true }));

  return app;
}
