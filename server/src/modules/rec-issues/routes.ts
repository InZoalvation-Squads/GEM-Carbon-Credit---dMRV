// REC issuance (SF-04) routes — registered under the bare /api/v1 prefix
// because paths span /projects/:id/rec-issues and /rec-issues/:id/… (same
// pattern as pdds and verifications' sibling modules).
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { actorFromRequest } from '../../lib/audit.js';
import { idParams, isoDateString } from '../../lib/validation.js';
import {
  approveRecIssue,
  createRecIssue,
  deleteRecIssue,
  listAll,
  listForProject,
  rejectRecIssue,
  serializeRecIssue,
  submitRecIssue,
  updateRecIssue,
} from './service.js';

const CreateBody = z.object({
  period_start: isoDateString,
  period_end: isoDateString,
  request_type: z.enum(['Normal', 'Self consumption']),
  applied_mwh: z.number().positive().optional(),
  receiving_org_name: z.string().trim().optional(),
  receiving_account_id: z.string().trim().optional(),
  evidence_ids: z.array(z.string().min(1)).optional(),
});

const PatchBody = z
  .object({
    period_start: isoDateString.optional(),
    period_end: isoDateString.optional(),
    request_type: z.enum(['Normal', 'Self consumption']).optional(),
    applied_mwh: z.number().positive().nullable().optional(),
    receiving_org_name: z.string().trim().optional(),
    receiving_account_id: z.string().trim().optional(),
    evidence_ids: z.array(z.string().min(1)).optional(),
  })
  .strict()
  .refine((p) => Object.keys(p).length > 0, 'at least one field to update is required');

const ReasonBody = z.object({ reason: z.string().trim().min(1, 'reason is required') });

export async function recIssuesRoutes(app: FastifyInstance): Promise<void> {
  // Proponent side creates, edits and submits requests …
  const proponent = [app.authenticate, app.requireRole('project_owner', 'admin', 'esg_manager')];
  // … the reviewer side (EGAT / Local Issuer) approves or rejects.
  const reviewer = [app.authenticate, app.requireRole('verifier', 'admin')];

  app.post('/projects/:id/rec-issues', { preHandler: proponent }, async (req, reply) => {
    const { id } = idParams.parse(req.params);
    const body = CreateBody.parse(req.body ?? {});
    const row = await createRecIssue(app.prisma, actorFromRequest(req), id, body);
    return reply.code(201).send({ rec_issue: serializeRecIssue(row) });
  });

  app.get('/projects/:id/rec-issues', { preHandler: [app.authenticate] }, async (req) => {
    const { id } = idParams.parse(req.params);
    const rows = await listForProject(app.prisma, req.user.org, id);
    return { rec_issues: rows.map(serializeRecIssue) };
  });

  app.get('/rec-issues', { preHandler: [app.authenticate] }, async (req) => {
    const rows = await listAll(app.prisma, req.user.org);
    return { rec_issues: rows.map(serializeRecIssue) };
  });

  app.put('/rec-issues/:id', { preHandler: proponent }, async (req) => {
    const { id } = idParams.parse(req.params);
    const patch = PatchBody.parse(req.body ?? {});
    const row = await updateRecIssue(app.prisma, actorFromRequest(req), id, patch);
    return { rec_issue: serializeRecIssue(row) };
  });

  app.post('/rec-issues/:id/submit', { preHandler: proponent }, async (req) => {
    const { id } = idParams.parse(req.params);
    const row = await submitRecIssue(app.prisma, actorFromRequest(req), id);
    return { rec_issue: serializeRecIssue(row) };
  });

  app.post('/rec-issues/:id/approve', { preHandler: reviewer }, async (req) => {
    const { id } = idParams.parse(req.params);
    const row = await approveRecIssue(app.prisma, actorFromRequest(req), id);
    return { rec_issue: serializeRecIssue(row) };
  });

  app.post('/rec-issues/:id/reject', { preHandler: reviewer }, async (req) => {
    const { id } = idParams.parse(req.params);
    const { reason } = ReasonBody.parse(req.body ?? {});
    const row = await rejectRecIssue(app.prisma, actorFromRequest(req), id, reason);
    return { rec_issue: serializeRecIssue(row) };
  });

  app.delete('/rec-issues/:id', { preHandler: proponent }, async (req, reply) => {
    const { id } = idParams.parse(req.params);
    await deleteRecIssue(app.prisma, actorFromRequest(req), id);
    return reply.code(204).send();
  });
}
