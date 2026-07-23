// Verification (Gate 2 / MRV) routes — one endpoint per SPA store action plus
// an explicit create (draft packages came from seed in the SPA).
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { EvidenceCategory, VerificationState } from '@prisma/client';
import { actorFromRequest } from '../../lib/audit.js';
import { idParams, isoDateString } from '../../lib/validation.js';
import {
  addComment,
  approveVerification,
  createVerification,
  getVerification,
  listComments,
  listVerifications,
  rejectVerification,
  requestRevision,
  serializeComment,
  serializeVerification,
  startReview,
  submitVerification,
} from './service.js';

const CreateBody = z.object({
  project_id: z.string().min(1),
  monitoring_period_start: isoDateString,
  monitoring_period_end: isoDateString,
  reduction_kgco2e: z.number().min(0, 'reduction_kgco2e must be ≥ 0'),
  factors_snapshot: z.string().trim().min(1, 'factors_snapshot is required'),
  evidence_ids: z.array(z.string().min(1)).default([]),
  required_categories: z.array(z.enum(EvidenceCategory)).optional(),
  sla_target_days: z.number().int().positive().optional(),
});
const SummaryBody = z.object({ summary: z.string().trim().min(1, 'summary is required') });
const ReasonBody = z.object({ reason: z.string().trim().min(1, 'reason is required') });
const ApproveBody = z.object({ note: z.string().trim().min(1).optional() });
const CommentBody = z.object({
  body: z.string().trim().min(1, 'body is required'),
  evidence_id: z.string().min(1).optional(),
});
const ListQuery = z.object({
  project_id: z.string().min(1).optional(),
  state: z.enum(VerificationState).optional(),
});

export async function verificationsRoutes(app: FastifyInstance): Promise<void> {
  // Proponent side prepares and submits packages …
  const proponent = [app.authenticate, app.requireRole('project_owner', 'admin', 'esg_manager')];
  // … the verifier side reviews, approves and rejects.
  const verifier = [app.authenticate, app.requireRole('verifier', 'admin')];

  app.post('/', { preHandler: proponent }, async (req, reply) => {
    const body = CreateBody.parse(req.body ?? {});
    const row = await createVerification(app.prisma, actorFromRequest(req), body);
    return reply.code(201).send({ verification: serializeVerification(row) });
  });

  app.post('/:id/submit', { preHandler: proponent }, async (req) => {
    const { id } = idParams.parse(req.params);
    const row = await submitVerification(app.prisma, actorFromRequest(req), id);
    return { verification: serializeVerification(row) };
  });

  app.post('/:id/start-review', { preHandler: verifier }, async (req) => {
    const { id } = idParams.parse(req.params);
    const row = await startReview(app.prisma, actorFromRequest(req), id);
    return { verification: serializeVerification(row) };
  });

  app.post('/:id/request-revision', { preHandler: verifier }, async (req) => {
    const { id } = idParams.parse(req.params);
    const { summary } = SummaryBody.parse(req.body ?? {});
    const row = await requestRevision(app.prisma, actorFromRequest(req), id, summary);
    return { verification: serializeVerification(row) };
  });

  app.post('/:id/approve', { preHandler: verifier }, async (req) => {
    const { id } = idParams.parse(req.params);
    const { note } = ApproveBody.parse(req.body ?? {});
    const row = await approveVerification(app.prisma, actorFromRequest(req), id, note);
    return { verification: serializeVerification(row) };
  });

  app.post('/:id/reject', { preHandler: verifier }, async (req) => {
    const { id } = idParams.parse(req.params);
    const { reason } = ReasonBody.parse(req.body ?? {});
    const row = await rejectVerification(app.prisma, actorFromRequest(req), id, reason);
    return { verification: serializeVerification(row) };
  });

  // Comments: both sides of the review thread.
  app.post('/:id/comments', { preHandler: [app.authenticate] }, async (req, reply) => {
    const { id } = idParams.parse(req.params);
    const body = CommentBody.parse(req.body ?? {});
    const comment = await addComment(
      app.prisma,
      actorFromRequest(req),
      id,
      body.body,
      body.evidence_id,
    );
    return reply.code(201).send({ comment: serializeComment(comment) });
  });

  app.get('/', { preHandler: [app.authenticate] }, async (req) => {
    const filter = ListQuery.parse(req.query ?? {});
    const rows = await listVerifications(app.prisma, req.user.org, filter);
    return { verifications: rows.map(serializeVerification) };
  });

  app.get('/:id', { preHandler: [app.authenticate] }, async (req) => {
    const { id } = idParams.parse(req.params);
    const row = await getVerification(app.prisma, req.user.org, id);
    const comments = await listComments(app.prisma, row.id);
    return {
      verification: serializeVerification(row),
      comments: comments.map(serializeComment),
    };
  });
}
