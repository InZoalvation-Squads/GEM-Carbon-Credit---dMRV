import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { ZodError } from 'zod';
import type { PrismaClient } from '@prisma/client';
import { config } from './config.js';
import { ERROR_CODES } from './lib/errors.js';
import { authPlugin } from './plugins/auth.js';
import { authRoutes } from './modules/auth/routes.js';
import { usersRoutes } from './modules/users/routes.js';
import { projectsRoutes } from './modules/projects/routes.js';
import { factorsRoutes } from './modules/factors/routes.js';
import { monitoringRoutes } from './modules/monitoring/routes.js';
import { evidenceRoutes } from './modules/evidence/routes.js';
import { methodologiesRoutes } from './modules/methodologies/routes.js';
import { pddsRoutes } from './modules/pdds/routes.js';
import { verificationsRoutes } from './modules/verifications/routes.js';
import { credentialsRoutes } from './modules/credentials/routes.js';

declare module 'fastify' {
  interface FastifyInstance {
    /** Database handle used by all modules; injectable for tests. */
    prisma: PrismaClient;
  }
}

export interface BuildAppOptions {
  /** Override the PrismaClient (route tests point this at the test DB). */
  prisma?: PrismaClient;
}

/**
 * Uniform error envelope: every non-2xx response body is
 * `{ error: { code: string, message: string } }`.
 */
function envelope(code: string, message: string) {
  return { error: { code, message } };
}

// Only the application-level codes from lib/errors.ts pass through to
// clients verbatim. Everything else (Fastify's FST_*, Node's ERR_*, ad-hoc
// strings) is mapped to a generic family so internals never leak into the
// API contract.
const PASSTHROUGH_ERROR_CODES = new Set<string>(ERROR_CODES);

function publicErrorCode(err: FastifyError, statusCode: number): string {
  if (err.code && PASSTHROUGH_ERROR_CODES.has(err.code)) return err.code;
  if (statusCode === 429) return 'RATE_LIMITED';
  // Any body/file size rejection (Fastify's own FST_ERR_CTP_BODY_TOO_LARGE,
  // @fastify/multipart's FST_REQ_FILE_TOO_LARGE, …) speaks one public code.
  if (statusCode === 413) return 'PAYLOAD_TOO_LARGE';
  return statusCode >= 500 ? 'INTERNAL' : 'BAD_REQUEST';
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

export async function buildApp(opts: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: process.env.NODE_ENV !== 'test' && { level: 'info' },
  });

  if (opts.prisma) {
    app.decorate('prisma', opts.prisma);
  } else {
    // Lazy import so tests that inject their own client never construct the
    // default (real-DB) singleton.
    const { prisma } = await import('./lib/db.js');
    app.decorate('prisma', prisma);
  }

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
      reply.code(statusCode).send(envelope('INTERNAL', 'Internal server error'));
      return;
    }
    reply.code(statusCode).send(envelope(publicErrorCode(err, statusCode), err.message));
  });

  app.get('/health', async () => ({ ok: true }));

  await app.register(authPlugin);
  await app.register(authRoutes, { prefix: '/api/v1/auth' });
  await app.register(usersRoutes, { prefix: '/api/v1/users' });
  await app.register(projectsRoutes, { prefix: '/api/v1/projects' });
  await app.register(factorsRoutes, { prefix: '/api/v1/factors' });
  // Monitoring is a project sub-resource (/projects/:id/monitoring).
  await app.register(monitoringRoutes, { prefix: '/api/v1/projects' });
  // Evidence spans /projects/:id/evidence AND /evidence/:id/… — it registers
  // under the bare /api/v1 prefix and declares full sub-paths itself.
  await app.register(evidenceRoutes, { prefix: '/api/v1' });
  await app.register(methodologiesRoutes, { prefix: '/api/v1/methodologies' });
  // PDDs span /projects/:id/pdd AND /pdds/:id/… — bare prefix, like evidence.
  await app.register(pddsRoutes, { prefix: '/api/v1' });
  await app.register(verificationsRoutes, { prefix: '/api/v1/verifications' });
  // Credentials span /verifications/:id/anchor, /pdds/:id/credential,
  // /credentials/… and /tokens — bare prefix, like evidence and pdds.
  await app.register(credentialsRoutes, { prefix: '/api/v1' });

  return app;
}
