// Ported from carbon-ready/src/store/index.ts addEmissionFactor — next version
// is max(version)+1 for the country+source pair, the previous current factor
// flips is_current=false, all inside one transaction with the audit row.
import type { EmissionFactor, PrismaClient } from '@prisma/client';
import { writeAudit, type AuditActor } from '../../lib/audit.js';
import { uid } from '../../lib/uid.js';

/** API shape of a factor — created_at as ISO string (matches the SPA type). */
export function serializeFactor(f: EmissionFactor): Record<string, unknown> {
  return { ...f, created_at: f.created_at.toISOString() };
}

export async function listFactors(prisma: PrismaClient): Promise<EmissionFactor[]> {
  return prisma.emissionFactor.findMany({
    orderBy: [{ created_at: 'desc' }, { id: 'desc' }], // newest first, like the SPA
  });
}

export interface AddFactorInput {
  country: string;
  source: string;
  factor_kgco2e_per_kwh: number;
  effective_date: string;
}

export async function addEmissionFactor(
  prisma: PrismaClient,
  actor: AuditActor,
  input: AddFactorInput,
): Promise<EmissionFactor> {
  return prisma.$transaction(async (tx) => {
    const pair = { country: input.country, source: input.source };
    const agg = await tx.emissionFactor.aggregate({ where: pair, _max: { version: true } });
    const version = (agg._max.version ?? 0) + 1;

    await tx.emissionFactor.updateMany({
      where: { ...pair, is_current: true },
      data: { is_current: false },
    });
    const factor = await tx.emissionFactor.create({
      data: { id: uid('ef'), version, is_current: true, ...input },
    });

    await writeAudit(tx, {
      userId: actor.userId,
      role: actor.role,
      ip: actor.ip,
      action: 'EMISSION_FACTOR_ADDED',
      entityType: 'factor',
      entityId: factor.id,
      payload: { country: factor.country, source: factor.source, version: factor.version },
      newValue: { factor_kgco2e_per_kwh: factor.factor_kgco2e_per_kwh, version: factor.version },
    });
    return factor;
  });
}
