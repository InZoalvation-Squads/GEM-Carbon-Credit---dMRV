// PDD (Gate 1 / registration) routes. Spans two URL families
// (/projects/:id/pdd and /pdds/:id/…), so this plugin registers under the bare
// /api/v1 prefix and declares full sub-paths itself (same pattern as evidence).
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { PddState } from '@prisma/client';
import { actorFromRequest } from '../../lib/audit.js';
import { idParams } from '../../lib/validation.js';
import { serializeComment } from '../verifications/service.js';
import {
  addPddComment,
  getPdd,
  getPddByProject,
  listPddComments,
  listPdds,
  registerProject,
  rejectPdd,
  requestPddRevision,
  savePddDraft,
  selectMethodology,
  serializePdd,
  startValidation,
  submitPdd,
} from './service.js';

const SelectBody = z.object({ methodology_id: z.string().min(1) });
const DraftBody = z.object({
  section_data: z.record(z.string(), z.unknown()),
  evidence_ids: z.array(z.string().min(1)),
});
const SummaryBody = z.object({ summary: z.string().trim().min(1, 'summary is required') });
const ReasonBody = z.object({ reason: z.string().trim().min(1, 'reason is required') });
const CommentBody = z.object({
  body: z.string().trim().min(1, 'body is required'),
  section_key: z.string().trim().min(1).optional(),
});
const ListQuery = z.object({ state: z.enum(PddState).optional() });

export async function pddsRoutes(app: FastifyInstance): Promise<void> {
  // Proponent side (same circle as project writes) drafts and submits …
  const proponent = [app.authenticate, app.requireRole('project_owner', 'admin', 'esg_manager')];
  // … the validator side (Standard Registry / VVB) moves the gate.
  const validator = [app.authenticate, app.requireRole('verifier', 'admin')];

  // selectMethodology: create the project's draft PDD, or switch methodology
  // while it is still editable (draft | revision_required).
  app.post('/projects/:id/pdd', { preHandler: proponent }, async (req, reply) => {
    const { id } = idParams.parse(req.params);
    const { methodology_id } = SelectBody.parse(req.body ?? {});
    const { pdd, created } = await selectMethodology(
      app.prisma,
      actorFromRequest(req),
      id,
      methodology_id,
    );
    return reply.code(created ? 201 : 200).send({ pdd: serializePdd(pdd) });
  });

  // savePddDraft: NO audit — high-frequency autosave, not a regulatory state
  // change; the audit trail begins at submit (same rationale as the SPA store).
  app.put('/pdds/:id/draft', { preHandler: proponent }, async (req) => {
    const { id } = idParams.parse(req.params);
    const body = DraftBody.parse(req.body ?? {});
    const pdd = await savePddDraft(
      app.prisma,
      actorFromRequest(req),
      id,
      body.section_data,
      body.evidence_ids,
    );
    return { pdd: serializePdd(pdd) };
  });

  app.post('/pdds/:id/submit', { preHandler: proponent }, async (req) => {
    const { id } = idParams.parse(req.params);
    const pdd = await submitPdd(app.prisma, actorFromRequest(req), id);
    return { pdd: serializePdd(pdd) };
  });

  app.post('/pdds/:id/start-validation', { preHandler: validator }, async (req) => {
    const { id } = idParams.parse(req.params);
    const pdd = await startValidation(app.prisma, actorFromRequest(req), id);
    return { pdd: serializePdd(pdd) };
  });

  app.post('/pdds/:id/request-revision', { preHandler: validator }, async (req) => {
    const { id } = idParams.parse(req.params);
    const { summary } = SummaryBody.parse(req.body ?? {});
    const pdd = await requestPddRevision(app.prisma, actorFromRequest(req), id, summary);
    return { pdd: serializePdd(pdd) };
  });

  // registerProject: the ONLY response that ever carries disclosure_salts —
  // the proponent's browser must retain them privately for later selective-
  // disclosure proofs and for building the VC subject (Task 8). Every GET
  // serializes via PublicPdd, which omits them permanently.
  app.post('/pdds/:id/register', { preHandler: validator }, async (req) => {
    const { id } = idParams.parse(req.params);
    const result = await registerProject(app.prisma, actorFromRequest(req), id);
    return {
      pdd: serializePdd(result.pdd),
      disclosure: result.disclosure,
      disclosure_salts: result.disclosure_salts,
    };
  });

  app.post('/pdds/:id/reject', { preHandler: validator }, async (req) => {
    const { id } = idParams.parse(req.params);
    const { reason } = ReasonBody.parse(req.body ?? {});
    const pdd = await rejectPdd(app.prisma, actorFromRequest(req), id, reason);
    return { pdd: serializePdd(pdd) };
  });

  // Comments: both sides of the review thread (proponent AND validator).
  app.post('/pdds/:id/comments', { preHandler: [app.authenticate] }, async (req, reply) => {
    const { id } = idParams.parse(req.params);
    const body = CommentBody.parse(req.body ?? {});
    const comment = await addPddComment(
      app.prisma,
      actorFromRequest(req),
      id,
      body.body,
      body.section_key,
    );
    return reply.code(201).send({ comment: serializeComment(comment) });
  });

  // Without ?state= this is the SPA's validationQueue() (in-flight PDDs only).
  app.get('/pdds', { preHandler: [app.authenticate] }, async (req) => {
    const { state } = ListQuery.parse(req.query ?? {});
    const rows = await listPdds(app.prisma, req.user.org, state);
    return { pdds: rows.map(serializePdd) };
  });

  app.get('/projects/:id/pdd', { preHandler: [app.authenticate] }, async (req) => {
    const { id } = idParams.parse(req.params);
    const pdd = await getPddByProject(app.prisma, req.user.org, id);
    return { pdd: serializePdd(pdd) };
  });

  app.get('/pdds/:id', { preHandler: [app.authenticate] }, async (req) => {
    const { id } = idParams.parse(req.params);
    const pdd = await getPdd(app.prisma, req.user.org, id);
    const comments = await listPddComments(app.prisma, pdd.id);
    return { pdd: serializePdd(pdd), comments: comments.map(serializeComment) };
  });
}
