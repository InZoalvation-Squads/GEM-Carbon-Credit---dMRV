// Ported from carbon-ready/src/store/index.ts addMonitoringRecords + the
// CSV_UPLOADED audit write in carbon-ready/src/lib/api.ts uploadMonitoringCsv.
//
// Stamping rule (verbatim from the SPA): each record is stamped with the
// methodology's driver param + unit (param_key/unit) resolved via the
// project's PDD — but only once the PDD is REGISTERED. A draft PDD's
// methodology can still change, and a stale param_key would silently exclude
// records from calc totals. Unregistered projects stay unstamped (legacy shape).
import type { MonitoringRecord, PrismaClient } from '@prisma/client';
import { writeAudit, type AuditActor } from '../../lib/audit.js';
import { appError } from '../../lib/errors.js';
import { uid } from '../../lib/uid.js';

/**
 * Public monitoring-record shape — explicit typed allowlist, NEVER a
 * `{ ...row }` spread (a spread silently leaks any column later added to the
 * model). All modules MUST serialize this way — in particular,
 * Pdd.disclosure_salts and EvidenceFile.storage_path must never be spread
 * into a response.
 */
export type PublicMonitoringRecord = {
  id: string;
  project_id: string;
  record_date: string;
  generation_kwh: number;
  source: string;
  uploaded_at: string;
  param_key: string | null;
  unit: string | null;
};

export function serializeRecord(r: MonitoringRecord): PublicMonitoringRecord {
  return {
    id: r.id,
    project_id: r.project_id,
    record_date: r.record_date,
    generation_kwh: r.generation_kwh,
    source: r.source,
    uploaded_at: r.uploaded_at.toISOString(),
    param_key: r.param_key,
    unit: r.unit,
  };
}

export interface MonitoringRowInput {
  record_date: string;
  generation_kwh: number;
}

async function requireProject(
  tx: Pick<PrismaClient, 'project'>,
  projectId: string,
  organizationId: string,
): Promise<void> {
  const project = await tx.project.findFirst({
    where: { id: projectId, organization_id: organizationId },
    select: { id: true },
  });
  if (!project) throw appError(404, 'NOT_FOUND', 'Project not found');
}

export async function addMonitoringRecords(
  prisma: PrismaClient,
  actor: AuditActor,
  projectId: string,
  rows: MonitoringRowInput[],
): Promise<number> {
  return prisma.$transaction(async (tx) => {
    await requireProject(tx, projectId, actor.org);

    const pdd = await tx.pdd.findFirst({
      where: { project_id: projectId, state: 'registered' },
      include: { methodology: { select: { document: true } } },
    });
    const calc = (pdd?.methodology.document as
      | { calculation?: { input_param?: string; input_unit?: string } }
      | null)?.calculation;
    const stamp = calc ? { param_key: calc.input_param, unit: calc.input_unit } : {};

    const uploaded_at = new Date();
    await tx.monitoringRecord.createMany({
      data: rows.map((r) => ({
        id: uid('mon'),
        project_id: projectId,
        source: 'csv_upload',
        uploaded_at,
        ...stamp,
        ...r,
      })),
    });

    await writeAudit(tx, {
      userId: actor.userId,
      role: actor.role,
      ip: actor.ip,
      action: 'CSV_UPLOADED',
      entityType: 'monitoring',
      entityId: projectId,
      // Same payload shape as the SPA; the server rejects bad rows with 400
      // up front, so nothing reaches this point rejected.
      payload: { accepted: rows.length, rejected: 0 },
    });
    return rows.length;
  });
}

export async function listMonitoringRecords(
  prisma: PrismaClient,
  organizationId: string,
  projectId: string,
  range: { from?: string; to?: string },
): Promise<MonitoringRecord[]> {
  await requireProject(prisma, projectId, organizationId);
  return prisma.monitoringRecord.findMany({
    where: {
      project_id: projectId,
      // ISO date strings compare lexicographically — inclusive on both ends.
      record_date: { gte: range.from, lte: range.to },
    },
    orderBy: [{ record_date: 'asc' }, { id: 'asc' }],
  });
}
