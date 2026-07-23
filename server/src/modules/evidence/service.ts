// Ported from carbon-ready/src/store/index.ts uploadEvidence / replaceEvidence /
// archiveEvidence. Same version-chain semantics: v1 uploads active, replace
// creates a new row (parent_id = old, version_number+1) and supersedes the old
// one, archive flips status. The server adds what the SPA could not: bytes on
// disk (content-addressed, lib/storage.ts) and a server-computed content_hash.
import type {
  EvidenceCategory,
  EvidenceFile,
  FileKind,
  Prisma,
  PrismaClient,
} from '@prisma/client';
import { writeAudit, type AuditActor } from '../../lib/audit.js';
import { appError } from '../../lib/errors.js';
import { uid } from '../../lib/uid.js';

/**
 * Public evidence shape — explicit typed allowlist, NEVER a `{ ...row }`
 * spread. EvidenceFile.storage_path in particular must never reach a client:
 * it is a server filesystem detail (and the blob is fetchable via /file).
 */
export type PublicEvidence = {
  id: string;
  project_id: string;
  parent_id: string | null;
  category: EvidenceCategory;
  file_name: string;
  kind: FileKind;
  file_size: number;
  version_number: number;
  status: string;
  description: string | null;
  content_hash: string;
  uploaded_by: string;
  uploaded_by_name: string;
  uploaded_at: string;
};

export function serializeEvidence(e: EvidenceFile): PublicEvidence {
  return {
    id: e.id,
    project_id: e.project_id,
    parent_id: e.parent_id,
    category: e.category,
    file_name: e.file_name,
    kind: e.kind,
    file_size: e.file_size,
    version_number: e.version_number,
    status: e.status,
    description: e.description,
    content_hash: e.content_hash,
    uploaded_by: e.uploaded_by,
    uploaded_by_name: e.uploaded_by_name,
    uploaded_at: e.uploaded_at.toISOString(),
    // storage_path intentionally omitted
  };
}

/** Map a file name's extension to FileKind; 400 on anything unsupported. */
export function kindFromFileName(fileName: string): FileKind {
  const dot = fileName.lastIndexOf('.');
  const ext = dot >= 0 ? fileName.slice(dot + 1).toLowerCase() : '';
  switch (ext) {
    case 'pdf':
      return 'pdf';
    case 'png':
    case 'jpg':
    case 'jpeg':
      return 'image';
    case 'xlsx':
      return 'xlsx';
    default:
      throw appError(
        400,
        'BAD_REQUEST',
        `Unsupported file type for "${fileName}" — allowed: pdf, png, jpg, jpeg, xlsx`,
      );
  }
}

/** Everything the route learned from the multipart body + saved blob. */
export interface UploadedBlob {
  file_name: string;
  kind: FileKind;
  file_size: number;
  content_hash: string; // `sha256-<64hex>`, computed server-side
  storage_path: string; // blob file name under STORAGE_DIR (the bare hex)
}

export async function requireProject(
  tx: Pick<PrismaClient, 'project'>,
  organizationId: string,
  projectId: string,
): Promise<void> {
  const project = await tx.project.findFirst({
    where: { id: projectId, organization_id: organizationId },
    select: { id: true },
  });
  if (!project) throw appError(404, 'NOT_FOUND', 'Project not found');
}

async function uploaderName(tx: Prisma.TransactionClient, userId: string): Promise<string> {
  const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true } });
  return user.name;
}

export async function createEvidence(
  prisma: PrismaClient,
  actor: AuditActor,
  projectId: string,
  blob: UploadedBlob,
  fields: { category: EvidenceCategory; description?: string },
): Promise<EvidenceFile> {
  return prisma.$transaction(async (tx) => {
    await requireProject(tx, actor.org, projectId);
    const row = await tx.evidenceFile.create({
      data: {
        id: uid('ev'),
        project_id: projectId,
        parent_id: null,
        category: fields.category,
        file_name: blob.file_name,
        kind: blob.kind,
        file_size: blob.file_size,
        version_number: 1,
        status: 'active',
        description: fields.description ?? null,
        content_hash: blob.content_hash,
        storage_path: blob.storage_path,
        uploaded_by: actor.userId,
        uploaded_by_name: await uploaderName(tx, actor.userId),
      },
    });
    await writeAudit(tx, {
      userId: actor.userId,
      role: actor.role,
      ip: actor.ip,
      action: 'EVIDENCE_UPLOADED',
      entityType: 'evidence',
      entityId: row.id,
      payload: { file_name: row.file_name, category: row.category },
      newValue: { version_number: 1, file_size: row.file_size },
    });
    return row;
  });
}

export async function replaceEvidence(
  prisma: PrismaClient,
  actor: AuditActor,
  evidenceId: string,
  blob: UploadedBlob,
  fields: { category?: EvidenceCategory; description?: string },
): Promise<EvidenceFile> {
  return prisma.$transaction(async (tx) => {
    const prev = await tx.evidenceFile.findFirst({
      where: { id: evidenceId, project: { organization_id: actor.org } },
    });
    if (!prev) throw appError(404, 'NOT_FOUND', 'Evidence not found');
    // Guarded update (id AND status) so two racing replaces can never both
    // chain a v(n+1) onto the same row — the loser sees count 0 and conflicts.
    const flipped = await tx.evidenceFile.updateMany({
      where: { id: prev.id, status: 'active' },
      data: { status: 'superseded' },
    });
    if (flipped.count !== 1) {
      throw appError(409, 'CONFLICT', 'Only active evidence can be replaced');
    }
    const next = await tx.evidenceFile.create({
      data: {
        id: uid('ev'),
        project_id: prev.project_id,
        parent_id: prev.id,
        // SPA spread semantics: fields not re-sent carry over from the old version.
        category: fields.category ?? prev.category,
        file_name: blob.file_name,
        kind: blob.kind,
        file_size: blob.file_size,
        version_number: prev.version_number + 1,
        status: 'active',
        description: fields.description ?? prev.description,
        content_hash: blob.content_hash,
        storage_path: blob.storage_path,
        uploaded_by: actor.userId,
        uploaded_by_name: await uploaderName(tx, actor.userId),
      },
    });
    await writeAudit(tx, {
      userId: actor.userId,
      role: actor.role,
      ip: actor.ip,
      action: 'EVIDENCE_REPLACED',
      entityType: 'evidence',
      entityId: next.id,
      payload: { file_name: next.file_name },
      previousValue: { version_number: prev.version_number, content_hash: prev.content_hash },
      newValue: { version_number: next.version_number, content_hash: next.content_hash },
    });
    return next;
  });
}

export async function archiveEvidence(
  prisma: PrismaClient,
  actor: AuditActor,
  evidenceId: string,
): Promise<EvidenceFile> {
  return prisma.$transaction(async (tx) => {
    const row = await tx.evidenceFile.findFirst({
      where: { id: evidenceId, project: { organization_id: actor.org } },
    });
    if (!row) throw appError(404, 'NOT_FOUND', 'Evidence not found');
    const updated = await tx.evidenceFile.update({
      where: { id: row.id },
      data: { status: 'archived' },
    });
    await writeAudit(tx, {
      userId: actor.userId,
      role: actor.role,
      ip: actor.ip,
      action: 'EVIDENCE_ARCHIVED',
      entityType: 'evidence',
      entityId: row.id,
      payload: {},
      newValue: { status: 'archived' },
    });
    return updated;
  });
}

export async function listEvidence(
  prisma: PrismaClient,
  organizationId: string,
  projectId: string,
): Promise<EvidenceFile[]> {
  await requireProject(prisma, organizationId, projectId);
  return prisma.evidenceFile.findMany({
    where: { project_id: projectId },
    orderBy: [{ uploaded_at: 'desc' }, { id: 'desc' }],
  });
}

/** Org-scoped row lookup for the download route; 404 when unknown. */
export async function getEvidence(
  prisma: PrismaClient,
  organizationId: string,
  evidenceId: string,
): Promise<EvidenceFile> {
  const row = await prisma.evidenceFile.findFirst({
    where: { id: evidenceId, project: { organization_id: organizationId } },
  });
  if (!row) throw appError(404, 'NOT_FOUND', 'Evidence not found');
  return row;
}
