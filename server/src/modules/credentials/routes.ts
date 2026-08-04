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
import { anchorBestEffort, anchorCredentialOnChain, anchorMintOnChain, mintRealToken } from './anchor.js';
import { approvePddInBackground, guardianEnabled } from '../../lib/guardian-client.js';
import { appError } from '../../lib/errors.js';

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
    // Real HCS write happens AFTER the transaction committed — best-effort so
    // a flaky testnet never rolls back a valid credential. Refetch to pick up
    // the anchor + propagated verification coordinates.
    await anchorBestEffort(() => anchorCredentialOnChain(app.prisma, result.credential.id), req.log);
    const [credential, verification] = await Promise.all([
      app.prisma.credential.findUniqueOrThrow({ where: { id: result.credential.id } }),
      app.prisma.verificationRequest.findUniqueOrThrow({ where: { id: result.verification.id } }),
    ]);
    return reply.code(201).send({
      verification: serializeVerification(verification),
      credential: serializeCredential(credential),
    });
  });

  app.post('/pdds/:id/credential', { preHandler: anchorer }, async (req, reply) => {
    const { id } = idParams.parse(req.params);
    const vc = VcBody.parse(req.body ?? {});
    const result = await anchorPddCredential(app.prisma, actorFromRequest(req), id, vc);
    await anchorBestEffort(() => anchorCredentialOnChain(app.prisma, result.credential.id), req.log);
    // The VC anchor is our Standard-Registry approval moment — mirror it into
    // the Guardian policy (fires Guardian's own mint). The PP document needs
    // its Hedera round-trip (~1–2 min) before it can be approved, so this
    // runs in the background and never delays the response.
    if (guardianEnabled()) {
      approvePddInBackground(app.prisma, result.pdd.id, req.log);
    }
    const credential = await app.prisma.credential.findUniqueOrThrow({ where: { id: result.credential.id } });
    return reply.code(201).send({
      pdd: serializePdd(result.pdd),
      credential: serializeCredential(credential),
    });
  });

  app.post('/credentials/:id/mint', { preHandler: registry }, async (req, reply) => {
    const { id } = idParams.parse(req.params);
    const body = TokenBody.parse(req.body ?? {});
    const token = await mintToken(app.prisma, actorFromRequest(req), id, body);
    // Real HTS serial first (replaces the browser's simulated token_id/serial),
    // then the HCS anchor message for the mint event — both best-effort.
    await anchorBestEffort(() => mintRealToken(app.prisma, token.id), req.log);
    await anchorBestEffort(() => anchorMintOnChain(app.prisma, token.id), req.log);
    const fresh = await app.prisma.guardianToken.findUniqueOrThrow({ where: { id: token.id } });
    return reply.code(201).send({ token: serializeToken(fresh) });
  });

  // Retry a failed/deferred on-chain anchor. Idempotent: an already-anchored
  // credential returns its stored receipt without another HCS submit.
  app.post('/credentials/:id/anchor', { preHandler: anchorer }, async (req) => {
    const { id } = idParams.parse(req.params);
    const row = await app.prisma.credential.findFirst({
      where: { id, project: { organization_id: req.user.org } },
    });
    if (!row) throw appError(404, 'NOT_FOUND', 'Credential not found');
    try {
      await anchorCredentialOnChain(app.prisma, id);
    } catch (err) {
      req.log.warn({ err: String(err) }, 'hedera anchor retry failed');
      throw appError(502, 'INTERNAL', 'Hedera anchoring failed — try again shortly');
    }
    const fresh = await app.prisma.credential.findUniqueOrThrow({ where: { id } });
    return { credential: serializeCredential(fresh) };
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
