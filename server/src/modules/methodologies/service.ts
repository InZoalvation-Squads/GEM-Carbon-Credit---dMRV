// Ported from carbon-ready/src/store/index.ts importMethodology: same
// parseMethodologyJson gate, same capped-3-issues error message, same
// duplicate code+version rule and METHODOLOGY_IMPORTED audit entry. The server
// persists each methodology as denormalized summary columns + the full
// schema-v2 document Json (exactly the methodologyToJson shape: schema_version
// stamped, id stripped).
import { Prisma, type Methodology, type PrismaClient } from '@prisma/client';
import { writeAudit, type AuditActor } from '../../lib/audit.js';
import { appError, type AppError } from '../../lib/errors.js';
import {
  METHODOLOGY_SCHEMA_VERSION,
  parseMethodologyJson,
} from '../../lib/methodology-schema.js';
import { uid } from '../../lib/uid.js';

/**
 * Public list shape — summary allowlist only, NEVER the document (or a
 * `{ ...row }` spread). The full document is available solely via /export.
 */
export type PublicMethodologySummary = {
  id: string;
  code: string;
  name: string;
  standard: string;
  version: string;
  sectoral_scope: string;
  status: string;
};

export function serializeMethodology(m: Methodology): PublicMethodologySummary {
  // sectoral_scope lives only inside the document (no dedicated column).
  const doc = m.document as { sectoral_scope?: string };
  return {
    id: m.id,
    code: m.code,
    name: m.name,
    standard: m.standard,
    version: m.version,
    sectoral_scope: doc.sectoral_scope ?? '',
    status: m.status,
    // document intentionally omitted
  };
}

export async function listMethodologies(prisma: PrismaClient): Promise<Methodology[]> {
  return prisma.methodology.findMany({ orderBy: [{ code: 'asc' }, { version: 'asc' }] });
}

export async function getMethodology(prisma: PrismaClient, id: string): Promise<Methodology> {
  const row = await prisma.methodology.findUnique({ where: { id } });
  if (!row) throw appError(404, 'NOT_FOUND', 'Methodology not found');
  return row;
}

function duplicateError(code: string, version: string): AppError {
  // Same wording as the SPA store.
  return appError(409, 'CONFLICT', `Methodology ${code} ${version} is already in the library.`);
}

/**
 * Import a schema-v2 methodology document. `rawBody` is the request body as
 * Fastify parsed it — either the document object itself or a JSON-encoded
 * string of it (both are normalized to text for parseMethodologyJson, which
 * owns ALL validation).
 */
export async function importMethodology(
  prisma: PrismaClient,
  actor: AuditActor,
  rawBody: unknown,
): Promise<Methodology> {
  const text = typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody ?? null);
  const parsed = parseMethodologyJson(text);
  if (!parsed.ok) {
    // Cap the message at the first few issues — a malformed document can carry
    // dozens. Same format as the SPA store's importMethodology.
    const shown = parsed.errors.slice(0, 3);
    const extra = parsed.errors.length - shown.length;
    throw appError(
      422,
      'UNPROCESSABLE',
      shown.join('; ') + (extra > 0 ? ` … and ${extra} more issue(s)` : ''),
    );
  }
  const doc = parsed.methodology;

  try {
    return await prisma.$transaction(async (tx) => {
      const dup = await tx.methodology.findFirst({
        where: { code: doc.code, version: doc.version },
        select: { id: true },
      });
      if (dup) throw duplicateError(doc.code, doc.version);
      const row = await tx.methodology.create({
        data: {
          id: uid('mth'),
          code: doc.code,
          name: doc.name,
          standard: doc.standard,
          version: doc.version,
          status: doc.status,
          // methodologyToJson shape: schema_version first, no id.
          document: {
            schema_version: METHODOLOGY_SCHEMA_VERSION,
            ...doc,
          } as unknown as Prisma.InputJsonValue,
        },
      });
      await writeAudit(tx, {
        userId: actor.userId,
        role: actor.role,
        ip: actor.ip,
        action: 'METHODOLOGY_IMPORTED',
        entityType: 'methodology',
        entityId: row.id,
        payload: { code: row.code, version: row.version },
        newValue: { code: row.code, version: row.version },
      });
      return row;
    });
  } catch (err) {
    // Two racing imports can both pass the read check; the loser then hits
    // @@unique([code, version]) — surface it as the same 409.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw duplicateError(doc.code, doc.version);
    }
    throw err;
  }
}
