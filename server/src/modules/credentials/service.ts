// Server side of the Guardian credential/token flow (Task 8). Signing stays in
// the BROWSER (carbon-ready/src/store anchorVerification / registerProject /
// mintToken build and sign the objects; keys never leave the client) — the
// server verifies the Ed25519 proof, cross-checks the object against the row
// it certifies, and persists it. Audit actions/payloads mirror the SPA store.
import { Prisma, type Credential, type GuardianToken, type Pdd, type PrismaClient, type UserRole, type VerificationRequest } from '@prisma/client';
import { writeAudit, type AuditActor } from '../../lib/audit.js';
import { appError } from '../../lib/errors.js';
import { verifyCredential } from '../../lib/vc.js';
import type { VerifiableCredential } from '../../lib/vc-types.js';

/** A VC as accepted at the API edge — the proof is REQUIRED there (zod). */
export type SignedCredential = VerifiableCredential & {
  proof: NonNullable<VerifiableCredential['proof']>;
};

/**
 * Public credential shape — explicit typed allowlist, NEVER a `{ ...row }`
 * spread. The proof is INTENTIONALLY public: anyone can re-verify the
 * credential offline (publicKeyFromDidKey + Ed25519), that is the point.
 * context/vc_type sit INSIDE the signed canonical form (signingInput covers
 * every field but the proof), so they MUST round-trip for that offline
 * verification to succeed — dropping them would fail verifyCredential on
 * every response.
 */
export type PublicCredential = {
  id: string;
  schema_id: string;
  issuer_did: string;
  issued_at: string;
  subject: Record<string, unknown>;
  package_hash: string;
  hcs: VerifiableCredential['hcs'];
  context?: string[];
  vc_type?: string[];
  proof: SignedCredential['proof'];
};

export function serializeCredential(row: Credential): PublicCredential {
  // The payload column stores the whole signed VC exactly as anchored (it was
  // zod-validated at insert), so every VC field is read back verbatim — the
  // response re-verifies offline bit-for-bit.
  const vc = row.payload as unknown as SignedCredential;
  const credential: PublicCredential = {
    id: row.id,
    schema_id: row.schema_id,
    issuer_did: vc.issuer_did,
    issued_at: vc.issued_at,
    subject: vc.subject,
    package_hash: vc.package_hash,
    hcs: vc.hcs,
    proof: vc.proof,
  };
  // Optional in the VC shape — include them exactly when the signed payload
  // has them (an added-or-dropped key would change canonical() and break the
  // proof), never invent defaults.
  if (vc.context !== undefined) credential.context = vc.context;
  if (vc.vc_type !== undefined) credential.vc_type = vc.vc_type;
  return credential;
}

/** Public token shape — all SPA GuardianToken fields, explicit allowlist. */
export type PublicToken = {
  id: string;
  token_id: string;
  serial_number: number;
  project_id: string;
  credential_id: string;
  amount_tco2e: number;
  monitoring_period_start: string;
  monitoring_period_end: string;
  minted_at: string;
  minted_by_role: UserRole;
  hcs: { topic_id: string; sequence_number: number; explorer_url: string };
};

export function serializeToken(t: GuardianToken): PublicToken {
  return {
    id: t.id,
    token_id: t.token_id,
    serial_number: t.serial_number,
    project_id: t.project_id,
    credential_id: t.credential_id,
    amount_tco2e: t.amount_tco2e,
    monitoring_period_start: t.monitoring_period_start,
    monitoring_period_end: t.monitoring_period_end,
    minted_at: t.minted_at.toISOString(),
    minted_by_role: t.minted_by_role,
    hcs: t.hcs as PublicToken['hcs'],
  };
}

type Tx = Prisma.TransactionClient;

/**
 * Verify the browser-signed proof — the LAST guard in every anchor flow, after
 * the cheap row cross-checks. One public message for every signature-shaped
 * failure (tampered fields, foreign key re-signing, malformed did): details
 * would only help an attacker probe.
 */
function requireValidSignature(vc: SignedCredential): void {
  if (verifyCredential(vc) !== 'valid') {
    throw appError(422, 'UNPROCESSABLE', 'credential signature invalid');
  }
}

/** Insert the credential row; a duplicate VC id is a conflict, not a crash. */
async function insertCredential(tx: Tx, vc: SignedCredential, projectId: string): Promise<Credential> {
  try {
    return await tx.credential.create({
      data: {
        id: vc.id,
        schema_id: vc.schema_id,
        project_id: projectId,
        payload: vc as unknown as Prisma.InputJsonValue,
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw appError(409, 'CONFLICT', 'A credential with this id already exists');
    }
    throw err;
  }
}

// ---------------- anchorVerification ----------------
export interface AnchorVerificationResult {
  verification: VerificationRequest;
  credential: Credential;
}

export async function anchorVerification(
  prisma: PrismaClient,
  actor: AuditActor,
  id: string,
  vc: SignedCredential,
): Promise<AnchorVerificationResult> {
  return prisma.$transaction(async (tx) => {
    // Org-scoped: a foreign package is indistinguishable from a missing one.
    const v = await tx.verificationRequest.findFirst({
      where: { id, project: { organization_id: actor.org } },
    });
    if (!v) throw appError(404, 'NOT_FOUND', 'Verification not found');
    if (v.credential_id) throw appError(409, 'CONFLICT', 'Verification is already anchored');
    if (v.state !== 'approved') {
      throw appError(409, 'CONFLICT', `Cannot anchor a verification in state "${v.state}"`);
    }
    // The VC must certify THIS approved package: same lock hash, same subject.
    if (!v.hash_value || vc.package_hash !== v.hash_value) {
      throw appError(422, 'UNPROCESSABLE', 'package_hash does not match the approved package hash');
    }
    if (vc.subject.verification_id !== v.id) {
      throw appError(422, 'UNPROCESSABLE', 'subject.verification_id does not match this verification');
    }
    // Pin the subject to the verification's own project — symmetric with the
    // project pinning on mint (the token later copies subject.project_id).
    if (vc.subject.project_id !== v.project_id) {
      throw appError(422, 'UNPROCESSABLE', "subject.project_id does not match the verification's project");
    }
    requireValidSignature(vc);

    const credential = await insertCredential(tx, vc, v.project_id);
    // Guarded stamp (id AND credential_id null) so two concurrent anchors can
    // never both win — the loser sees count 0 and rolls back its credential.
    const stamped = await tx.verificationRequest.updateMany({
      where: { id: v.id, credential_id: null },
      data: {
        credential_id: vc.id,
        anchored_at: new Date(vc.issued_at),
        hcs_topic_id: vc.hcs.topic_id,
        hcs_sequence_number: vc.hcs.sequence_number,
      },
    });
    if (stamped.count !== 1) throw appError(409, 'CONFLICT', 'Verification is already anchored');

    // Same audit shape as the SPA store's anchorVerification.
    await writeAudit(tx, {
      userId: actor.userId,
      role: actor.role,
      ip: actor.ip,
      action: 'VERIFICATION_ANCHORED',
      entityType: 'verification',
      entityId: v.id,
      payload: {
        credential_id: vc.id,
        topic_id: vc.hcs.topic_id,
        sequence_number: vc.hcs.sequence_number,
      },
      previousValue: { anchored: false },
      newValue: {
        credential_id: vc.id,
        hcs_topic_id: vc.hcs.topic_id,
        hcs_sequence_number: vc.hcs.sequence_number,
      },
    });
    const verification = await tx.verificationRequest.findUniqueOrThrow({ where: { id: v.id } });
    return { verification, credential };
  });
}

// ---------------- anchorPddCredential ----------------
export interface AnchorPddResult {
  pdd: Pdd;
  credential: Credential;
}

export async function anchorPddCredential(
  prisma: PrismaClient,
  actor: AuditActor,
  id: string,
  vc: SignedCredential,
): Promise<AnchorPddResult> {
  return prisma.$transaction(async (tx) => {
    const pdd = await tx.pdd.findFirst({
      where: { id, project: { organization_id: actor.org } },
    });
    if (!pdd) throw appError(404, 'NOT_FOUND', 'PDD not found');
    if (pdd.credential_id) throw appError(409, 'CONFLICT', 'PDD credential is already anchored');
    if (pdd.state !== 'registered') {
      throw appError(409, 'CONFLICT', `Cannot anchor a credential for a PDD in state "${pdd.state}"`);
    }
    // The VC must certify THIS frozen PDD: same content hash, same subject.
    if (!pdd.content_hash || vc.package_hash !== pdd.content_hash) {
      throw appError(422, 'UNPROCESSABLE', 'package_hash does not match the registered PDD content hash');
    }
    if (vc.subject.pdd_id !== pdd.id) {
      throw appError(422, 'UNPROCESSABLE', 'subject.pdd_id does not match this PDD');
    }
    // Pin the subject to the PDD's own project — symmetric with the
    // verification-anchor and mint project checks.
    if (vc.subject.project_id !== pdd.project_id) {
      throw appError(422, 'UNPROCESSABLE', "subject.project_id does not match the PDD's project");
    }
    requireValidSignature(vc);

    const credential = await insertCredential(tx, vc, pdd.project_id);
    const stamped = await tx.pdd.updateMany({
      where: { id: pdd.id, credential_id: null },
      data: { credential_id: vc.id },
    });
    if (stamped.count !== 1) throw appError(409, 'CONFLICT', 'PDD credential is already anchored');

    // Server-side audit extension: the SPA folds these fields into its
    // PROJECT_REGISTERED entry (register + sign happen in one browser action);
    // the server registers first (Task 7) and anchors the browser-signed VC
    // here, so the credential half gets its own entry with the same fields.
    await writeAudit(tx, {
      userId: actor.userId,
      role: actor.role,
      ip: actor.ip,
      action: 'PDD_CREDENTIAL_ANCHORED',
      entityType: 'pdd',
      entityId: pdd.id,
      payload: {
        credential_id: vc.id,
        topic_id: vc.hcs.topic_id,
        sequence_number: vc.hcs.sequence_number,
      },
      previousValue: { credential_id: null },
      newValue: { credential_id: vc.id },
    });
    const updated = await tx.pdd.findUniqueOrThrow({ where: { id: pdd.id } });
    return { pdd: updated, credential };
  });
}

// ---------------- mintToken ----------------
export interface MintTokenInput {
  id: string;
  token_id: string;
  serial_number: number;
  project_id: string;
  credential_id: string;
  amount_tco2e: number;
  monitoring_period_start: string;
  monitoring_period_end: string;
  minted_at: string;
  minted_by_role: UserRole;
  hcs: { topic_id: string; sequence_number: number; explorer_url: string };
}

export async function mintToken(
  prisma: PrismaClient,
  actor: AuditActor,
  credentialId: string,
  input: MintTokenInput,
): Promise<GuardianToken> {
  return prisma.$transaction(async (tx) => {
    // Org-scoped through the denormalized project linkage: a foreign
    // credential is indistinguishable from a missing one.
    const credential = await tx.credential.findFirst({
      where: { id: credentialId, project: { organization_id: actor.org } },
    });
    if (!credential) throw appError(404, 'NOT_FOUND', 'Credential not found');
    if (input.credential_id !== credential.id) {
      throw appError(422, 'UNPROCESSABLE', 'credential_id in the body does not match the credential being minted');
    }
    // The browser derives token.project_id from credential.subject.project_id;
    // the server pins it to the credential's own project linkage.
    if (input.project_id !== credential.project_id) {
      throw appError(422, 'UNPROCESSABLE', "project_id does not match the credential's project");
    }

    // One token per credential: the schema's unique credential_id is the
    // arbiter, so even two perfectly parallel mints cannot both insert.
    let token: GuardianToken;
    try {
      token = await tx.guardianToken.create({
        data: {
          id: input.id,
          token_id: input.token_id,
          serial_number: input.serial_number,
          project_id: input.project_id,
          credential_id: credential.id,
          amount_tco2e: input.amount_tco2e,
          monitoring_period_start: input.monitoring_period_start,
          monitoring_period_end: input.monitoring_period_end,
          minted_at: new Date(input.minted_at),
          minted_by_role: input.minted_by_role,
          hcs: input.hcs as unknown as Prisma.InputJsonValue,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw appError(409, 'CONFLICT', 'A token has already been minted for this credential');
      }
      throw err;
    }

    // Same audit shape as the SPA store's mintToken.
    await writeAudit(tx, {
      userId: actor.userId,
      role: actor.role,
      ip: actor.ip,
      action: 'TOKEN_MINTED',
      entityType: 'token',
      entityId: token.id,
      payload: {
        token_id: token.token_id,
        serial_number: token.serial_number,
        amount_tco2e: token.amount_tco2e,
        credential_id: credential.id,
      },
      newValue: { serial_number: token.serial_number, amount_tco2e: token.amount_tco2e },
    });
    return token;
  });
}

// ---------------- reads ----------------
export async function listCredentials(prisma: PrismaClient, organizationId: string): Promise<Credential[]> {
  return prisma.credential.findMany({
    where: { project: { organization_id: organizationId } },
    orderBy: [{ created_at: 'desc' }, { id: 'desc' }], // newest first — SPA store order
  });
}

export async function listTokens(prisma: PrismaClient, organizationId: string): Promise<GuardianToken[]> {
  return prisma.guardianToken.findMany({
    // Org-scope through credential → project rather than the token's own
    // denormalized project_id: the credential linkage is the server-pinned
    // source of truth (an FK-backed join), while token.project_id is a
    // client-supplied copy merely cross-checked at mint time.
    where: { credential: { project: { organization_id: organizationId } } },
    orderBy: [{ minted_at: 'desc' }, { id: 'desc' }], // newest first — SPA store order
  });
}
