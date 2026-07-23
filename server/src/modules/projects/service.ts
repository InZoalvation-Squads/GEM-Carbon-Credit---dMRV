// Ported from carbon-ready/src/store/index.ts createProject/updateProject —
// same defaults (lifecycle starts 'unregistered'), same audit actions and
// previous/new value shapes, but persisted and org-scoped.
import type { PrismaClient, Project, ProjectLifecycle, ProjectStatus } from '@prisma/client';
import { writeAudit, type AuditActor } from '../../lib/audit.js';
import { appError } from '../../lib/errors.js';
import { uid } from '../../lib/uid.js';

/**
 * Public project shape — the ONLY way project rows leave the API (and enter
 * audit previous/new values). Explicit allowlist, NEVER a `{ ...row }` spread:
 * a spread silently leaks any column later added to the model.
 *
 * CONVENTION FOR ALL MODULES: serialize with a typed allowlist like this one
 * (see users/service.ts PublicUser). This matters most for upcoming models —
 * Pdd.disclosure_salts and EvidenceFile.storage_path must never be spread
 * into a response.
 */
export type PublicProject = {
  id: string;
  organization_id: string;
  name: string;
  location: string;
  capacity_kwp: number;
  commission_date: string;
  status: ProjectStatus;
  lifecycle_stage: ProjectLifecycle;
  created_at: string;
  updated_at: string;
};

export function serializeProject(p: Project): PublicProject {
  return {
    id: p.id,
    organization_id: p.organization_id,
    name: p.name,
    location: p.location,
    capacity_kwp: p.capacity_kwp,
    commission_date: p.commission_date,
    status: p.status,
    lifecycle_stage: p.lifecycle_stage,
    created_at: p.created_at.toISOString(),
    updated_at: p.updated_at.toISOString(),
  };
}

export async function listProjects(prisma: PrismaClient, organizationId: string): Promise<Project[]> {
  return prisma.project.findMany({
    where: { organization_id: organizationId },
    orderBy: [{ created_at: 'desc' }, { id: 'desc' }], // newest first, like the SPA
  });
}

export interface CreateProjectInput {
  name: string;
  location: string;
  capacity_kwp: number;
  commission_date: string;
  status: ProjectStatus;
}

export async function createProject(
  prisma: PrismaClient,
  actor: AuditActor,
  input: CreateProjectInput,
): Promise<Project> {
  return prisma.$transaction(async (tx) => {
    const project = await tx.project.create({
      data: {
        id: uid('prj'),
        organization_id: actor.org,
        lifecycle_stage: 'unregistered',
        ...input,
      },
    });
    await writeAudit(tx, {
      userId: actor.userId,
      role: actor.role,
      ip: actor.ip,
      action: 'PROJECT_CREATED',
      entityType: 'project',
      entityId: project.id,
      payload: { name: project.name },
      newValue: { name: project.name },
    });
    return project;
  });
}

export type UpdateProjectInput = Partial<CreateProjectInput>;

export async function updateProject(
  prisma: PrismaClient,
  actor: AuditActor,
  id: string,
  patch: UpdateProjectInput,
): Promise<Project> {
  return prisma.$transaction(async (tx) => {
    // Org-scoped lookup: a foreign project is indistinguishable from a missing one.
    const before = await tx.project.findFirst({ where: { id, organization_id: actor.org } });
    if (!before) throw appError(404, 'NOT_FOUND', 'Project not found');

    const updated = await tx.project.update({ where: { id }, data: patch });
    await writeAudit(tx, {
      userId: actor.userId,
      role: actor.role,
      ip: actor.ip,
      action: 'PROJECT_UPDATED',
      entityType: 'project',
      entityId: id,
      payload: { changes: patch },
      previousValue: serializeProject(before),
      newValue: serializeProject(updated),
    });
    return updated;
  });
}
