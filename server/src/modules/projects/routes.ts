import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { actorFromRequest } from '../../lib/audit.js';
import { idParams, isoDateString } from '../../lib/validation.js';
import { createProject, listProjects, serializeProject, updateProject } from './service.js';

const PROJECT_STATUS = ['draft', 'active', 'suspended', 'retired'] as const;

const CreateBody = z.object({
  name: z.string().trim().min(1, 'name is required'),
  location: z.string().trim().min(1, 'location is required'),
  // 0 is legal: land-based projects (forestry / ARR) have no installed kWp.
  capacity_kwp: z.number().min(0, 'capacity_kwp must be ≥ 0'),
  commission_date: isoDateString,
  status: z.enum(PROJECT_STATUS).default('draft'), // same default as the SPA form
});

// strictObject: unknown keys are a validation error — most importantly
// lifecycle_stage, which only the PDD workflow (Task 7) may move.
const PatchBody = z
  .strictObject({
    name: z.string().trim().min(1).optional(),
    location: z.string().trim().min(1).optional(),
    capacity_kwp: z.number().min(0).optional(),
    commission_date: isoDateString.optional(),
    status: z.enum(PROJECT_STATUS).optional(),
  })
  .refine((p) => Object.keys(p).length > 0, 'at least one field to update is required');

export async function projectsRoutes(app: FastifyInstance): Promise<void> {
  const canWrite = [app.authenticate, app.requireRole('project_owner', 'admin', 'esg_manager')];

  app.get('/', { preHandler: [app.authenticate] }, async (req) => {
    const projects = await listProjects(app.prisma, req.user.org);
    return { projects: projects.map(serializeProject) };
  });

  app.post('/', { preHandler: canWrite }, async (req, reply) => {
    const body = CreateBody.parse(req.body ?? {});
    const project = await createProject(app.prisma, actorFromRequest(req), body);
    return reply.code(201).send({ project: serializeProject(project) });
  });

  app.patch('/:id', { preHandler: canWrite }, async (req) => {
    const { id } = idParams.parse(req.params);
    const patch = PatchBody.parse(req.body ?? {});
    const project = await updateProject(app.prisma, actorFromRequest(req), id, patch);
    return { project: serializeProject(project) };
  });
}
