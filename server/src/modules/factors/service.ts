// Ported from carbon-ready/src/store/index.ts addEmissionFactor — next version
// is max(version)+1 for the country+source pair, the previous current factor
// flips is_current=false, all inside one transaction with the audit row.
import type { EmissionFactor, PrismaClient } from '@prisma/client';
import { writeAudit, type AuditActor } from '../../lib/audit.js';
import { uid } from '../../lib/uid.js';

/**
 * Public factor shape — explicit typed allowlist, NEVER a `{ ...row }` spread
 * (a spread silently leaks any column later added to the model). All modules
 * MUST serialize this way — in particular, Pdd.disclosure_salts and
 * EvidenceFile.storage_path must never be spread into a response.
 */
export type PublicFactor = {
  id: string;
  country: string;
  source: string;
  factor_kgco2e_per_kwh: number;
  effective_date: string;
  version: number;
  is_current: boolean;
  created_at: string;
};

export function serializeFactor(f: EmissionFactor): PublicFactor {
  return {
    id: f.id,
    country: f.country,
    source: f.source,
    factor_kgco2e_per_kwh: f.factor_kgco2e_per_kwh,
    effective_date: f.effective_date,
    version: f.version,
    is_current: f.is_current,
    created_at: f.created_at.toISOString(),
  };
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
    // Pair-scoped advisory lock BEFORE the max-version read: two concurrent
    // inserts for the same country+source would otherwise both read the same
    // max and claim the same version / both stay is_current. Scoping the lock
    // to the pair keeps unrelated factor inserts fully parallel; the
    // @@unique([country, source, version]) constraint is the schema backstop.
    // ::text because pg_advisory_xact_lock returns void (Prisma can't deserialize it).
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${input.country} || '|' || ${input.source}))::text`;
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
