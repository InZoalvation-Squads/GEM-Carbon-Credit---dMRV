// REC ROI assumptions — org-level settings + optional per-project settings.
// The server stores inputs only; ROI is computed in the SPA (lib/rec-roi.ts)
// from current records, so no result can go stale. Every write is audited.
import type { Prisma, PrismaClient, RecRoiProjectSetting, RecRoiSettings } from '@prisma/client';
import { writeAudit, type AuditActor } from '../../lib/audit.js';
import { appError } from '../../lib/errors.js';

export type PublicRecRoiSettings = {
  price_low_thb: number | null;
  price_mid_thb: number | null;
  price_high_thb: number | null;
  price_source: string;
  platform_fee_pct: number | null;
  eur_thb: number | null;
  eur_thb_source: string;
  horizon_years: number;
  updated_by: string | null;
  updated_at: string | null;
};

export type RecRoiSettingsInput = Omit<PublicRecRoiSettings, 'updated_by' | 'updated_at'>;

export type PublicRecRoiProjectSetting = {
  project_id: string;
  issuance_type: string;
  digital_meter_exempt: boolean;
  investment_mthb: number | null;
  updated_by: string | null;
  updated_at: string | null;
};

export type RecRoiProjectSettingInput = {
  issuance_type: 'Normal' | 'Self consumption';
  digital_meter_exempt: boolean;
  investment_mthb: number | null;
};

/** Explicit allowlist serializer; null row → the "nothing entered" shape. */
export function serializeSettings(r: RecRoiSettings | null): PublicRecRoiSettings {
  return {
    price_low_thb: r?.price_low_thb ?? null,
    price_mid_thb: r?.price_mid_thb ?? null,
    price_high_thb: r?.price_high_thb ?? null,
    price_source: r?.price_source ?? '',
    platform_fee_pct: r?.platform_fee_pct ?? null,
    eur_thb: r?.eur_thb ?? null,
    eur_thb_source: r?.eur_thb_source ?? '',
    horizon_years: r?.horizon_years ?? 5,
    updated_by: r?.updated_by ?? null,
    updated_at: r?.updated_at.toISOString() ?? null,
  };
}

export function serializeProjectSetting(r: RecRoiProjectSetting): PublicRecRoiProjectSetting {
  return {
    project_id: r.project_id,
    issuance_type: r.issuance_type,
    digital_meter_exempt: r.digital_meter_exempt,
    investment_mthb: r.investment_mthb,
    updated_by: r.updated_by,
    updated_at: r.updated_at.toISOString(),
  };
}

async function actorName(tx: Prisma.TransactionClient, userId: string): Promise<string> {
  const u = await tx.user.findUnique({ where: { id: userId }, select: { name: true } });
  return u?.name ?? userId;
}

export async function getSettings(prisma: PrismaClient, organizationId: string): Promise<PublicRecRoiSettings> {
  return serializeSettings(await prisma.recRoiSettings.findUnique({ where: { organization_id: organizationId } }));
}

export async function putSettings(
  prisma: PrismaClient,
  actor: AuditActor,
  input: RecRoiSettingsInput,
): Promise<PublicRecRoiSettings> {
  return prisma.$transaction(async (tx) => {
    const previous = await tx.recRoiSettings.findUnique({ where: { organization_id: actor.org } });
    const updated_by = await actorName(tx, actor.userId);
    const row = await tx.recRoiSettings.upsert({
      where: { organization_id: actor.org },
      create: { organization_id: actor.org, ...input, updated_by },
      update: { ...input, updated_by },
    });
    await writeAudit(tx, {
      userId: actor.userId, role: actor.role, ip: actor.ip,
      action: 'REC_ROI_SETTINGS_UPDATED', entityType: 'rec_roi', entityId: actor.org,
      payload: { horizon_years: input.horizon_years },
      previousValue: previous ? { ...serializeSettings(previous) } : null,
      newValue: { ...serializeSettings(row) },
    });
    return serializeSettings(row);
  });
}

export async function listProjectSettings(prisma: PrismaClient, organizationId: string): Promise<PublicRecRoiProjectSetting[]> {
  const rows = await prisma.recRoiProjectSetting.findMany({
    where: { project: { organization_id: organizationId } },
    orderBy: { project_id: 'asc' },
  });
  return rows.map(serializeProjectSetting);
}

export async function putProjectSetting(
  prisma: PrismaClient,
  actor: AuditActor,
  projectId: string,
  input: RecRoiProjectSettingInput,
): Promise<PublicRecRoiProjectSetting> {
  return prisma.$transaction(async (tx) => {
    const project = await tx.project.findFirst({
      where: { id: projectId, organization_id: actor.org },
      select: { id: true },
    });
    if (!project) throw appError(404, 'NOT_FOUND', 'Project not found');
    const previous = await tx.recRoiProjectSetting.findUnique({ where: { project_id: projectId } });
    const updated_by = await actorName(tx, actor.userId);
    const row = await tx.recRoiProjectSetting.upsert({
      where: { project_id: projectId },
      create: { project_id: projectId, ...input, updated_by },
      update: { ...input, updated_by },
    });
    await writeAudit(tx, {
      userId: actor.userId, role: actor.role, ip: actor.ip,
      action: 'REC_ROI_PROJECT_UPDATED', entityType: 'rec_roi', entityId: projectId,
      payload: { issuance_type: input.issuance_type },
      previousValue: previous ? { ...serializeProjectSetting(previous) } : null,
      newValue: { ...serializeProjectSetting(row) },
    });
    return serializeProjectSetting(row);
  });
}
