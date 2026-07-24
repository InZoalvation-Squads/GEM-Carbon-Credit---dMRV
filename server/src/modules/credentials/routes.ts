// Credential & token routes (Task 8). Spans three URL families
// (/verifications/:id/anchor, /pdds/:id/credential, /credentials + /tokens),
// so this plugin registers under the bare /api/v1 prefix and declares full
// sub-paths itself (same pattern as evidence and pdds).
//
// The bodies are BROWSER-SIGNED objects: the SPA builds and signs the VC (and
// assembles the token) client-side — issuer keys never reach the server — and
// POSTs the result here for verification + persistence.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { UserRole } from '@prisma/client';
import { actorFromRequest } from '../../lib/audit.js';
import { idParams, isoDateString } from '../../lib/validation.js';
import { serializePdd } from '../pdds/service.js';
import { serializeVerification } from '../verifications/service.js';
import {
  anchorPddCredential,
  anchorVerification,
  listCredentials,
  listTokens,
  mintToken,
  serializeCredential,
  serializeToken,
} from './service.js';

// Exactly the SPA VerifiableCredential shape (lib/vc-types.ts) — with the
// proof REQUIRED: an unsigned VC is a 400 at the edge, not a 422. Unknown keys
// are stripped, which is safe: the Ed25519 proof covers the whole unsigned
// object, so a VC that relied on extra fields fails signature verification.
const VcHcs = z.object({
  topic_id: z.string().min(1),
  sequence_number: z.number().int().nonnegative(),
  consensus_timestamp: z.string().min(1),
  explorer_url: z.string().min(1),
});
const VcProof = z.object({
  type: z.literal('Ed25519Signature2020'),
  created: z.string().min(1),
  verificationMethod: z.string().min(1),
  proofValue: z.string().min(1),
});
const VcBody = z.object({
  id: z.string().min(1),
  schema_id: z.string().min(1),
  issuer_did: z.string().min(1),
  issued_at: z.iso.datetime(), // becomes verification.anchored_at — must parse
  subject: z.record(z.string(), z.unknown()),
  package_hash: z.string().min(1),
  hcs: VcHcs,
  context: z.array(z.string()).optional(),
  vc_type: z.array(z.string()).optional(),
  proof: VcProof,
});

// Exactly the SPA GuardianToken shape (lib/vc-types.ts).
const TokenHcs = z.object({
  topic_id: z.string().min(1),
  sequence_number: z.number().int().nonnegative(),
  explorer_url: z.string().min(1),
});
const TokenBody = z.object({
  id: z.string().min(1),
  token_id: z.string().min(1),
  serial_number: z.number().int().positive(),
  project_id: z.string().min(1),
  credential_id: z.string().min(1),
  amount_tco2e: z.number(),
  monitoring_period_start: isoDateString,
  monitoring_period_end: isoDateString,
  minted_at: z.iso.datetime(),
  minted_by_role: z.enum(UserRole),
  hcs: TokenHcs,
});

export async function credentialsRoutes(app: FastifyInstance): Promise<void> {
  // Anchoring finalizes a gate outcome — verifier-side action (like approve/register).
  const anchorer = [app.authenticate, app.requireRole('admin', 'verifier')];
  // Only the Standard Registry mints tokens.
  const registry = [app.authenticate, app.requireRole('admin')];

  app.post('/verifications/:id/anchor', { preHandler: anchorer }, async (req, reply) => {
    const { id } = idParams.parse(req.params);
    const vc = VcBody.parse(req.body ?? {});
    const result = await anchorVerification(app.prisma, actorFromRequest(req), id, vc);
    return reply.code(201).send({
      verification: serializeVerification(result.verification),
      credential: serializeCredential(result.credential),
    });
  });

  app.post('/pdds/:id/credential', { preHandler: anchorer }, async (req, reply) => {
    const { id } = idParams.parse(req.params);
    const vc = VcBody.parse(req.body ?? {});
    const result = await anchorPddCredential(app.prisma, actorFromRequest(req), id, vc);
    return reply.code(201).send({
      pdd: serializePdd(result.pdd),
      credential: serializeCredential(result.credential),
    });
  });

  app.post('/credentials/:id/mint', { preHandler: registry }, async (req, reply) => {
    const { id } = idParams.parse(req.params);
    const body = TokenBody.parse(req.body ?? {});
    const token = await mintToken(app.prisma, actorFromRequest(req), id, body);
    return reply.code(201).send({ token: serializeToken(token) });
  });

  app.get('/credentials', { preHandler: [app.authenticate] }, async (req) => {
    const rows = await listCredentials(app.prisma, req.user.org);
    return { credentials: rows.map(serializeCredential) };
  });

  app.get('/tokens', { preHandler: [app.authenticate] }, async (req) => {
    const rows = await listTokens(app.prisma, req.user.org);
    return { tokens: rows.map(serializeToken) };
  });
}
