// On-chain half of the credential flow: after a browser-signed VC is
// persisted, the server writes a compact anchor message to the project's REAL
// HCS topic and stores the consensus coordinates on the credential row
// (credentials.anchor) — outside the signed payload, so the Ed25519 proof
// stays valid. Anchoring is best-effort at the route layer (testnet gRPC can
// be flaky); POST /credentials/:id/anchor retries a null anchor.
import type { PrismaClient } from '@prisma/client';
import {
  anchorToTopic,
  createProjectFungibleToken,
  createProjectTopic,
  hederaEnabled,
  mintVcuBatch,
  type AnchorMessage,
  type AnchorReceipt,
} from '../../lib/hedera.js';
import type { SignedCredential } from './service.js';

export function anchorKindFor(schemaId: string): AnchorMessage['kind'] {
  return schemaId === 'mrv-approval-v1' ? 'verification_approval' : 'pdd_registration';
}

/**
 * Real HCS topic for a project, created lazily on first anchor. Guarded
 * update so a concurrent create can never orphan a topic silently — the
 * loser adopts the winner's topic id.
 */
export async function ensureProjectTopic(prisma: PrismaClient, projectId: string): Promise<string | null> {
  if (!hederaEnabled()) return null;
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { hcs_topic_id: true },
  });
  if (!project) return null;
  if (project.hcs_topic_id) return project.hcs_topic_id;

  const topicId = await createProjectTopic(projectId);
  const claimed = await prisma.project.updateMany({
    where: { id: projectId, hcs_topic_id: null },
    data: { hcs_topic_id: topicId },
  });
  if (claimed.count === 1) return topicId;
  const winner = await prisma.project.findUnique({
    where: { id: projectId },
    select: { hcs_topic_id: true },
  });
  return winner?.hcs_topic_id ?? topicId;
}

/**
 * Verra-style pipeline listing: the moment a PDD is SUBMITTED the project
 * gets its public registry identity — a real HCS topic plus one
 * `project_listed` message. Runs only on the FIRST submission (a project
 * that already has a topic was listed before; resubmissions after revision
 * do not re-list). Returns null when disabled or already listed.
 */
export async function anchorProjectListing(
  prisma: PrismaClient,
  projectId: string,
  pddId: string,
): Promise<AnchorReceipt | null> {
  if (!hederaEnabled()) return null;
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { hcs_topic_id: true },
  });
  if (!project || project.hcs_topic_id) return null; // unknown or already listed
  const topicId = await ensureProjectTopic(prisma, projectId);
  if (!topicId) return null;
  return anchorToTopic(topicId, {
    v: 1,
    kind: 'project_listed',
    project_id: projectId,
    pdd_id: pddId,
  });
}

/**
 * Anchor a stored credential on Hedera. Idempotent: a credential that already
 * carries an anchor is returned as-is without another HCS submit. Returns
 * null when anchoring is disabled (no operator configured).
 */
export async function anchorCredentialOnChain(
  prisma: PrismaClient,
  credentialId: string,
): Promise<AnchorReceipt | null> {
  if (!hederaEnabled()) return null;
  const row = await prisma.credential.findUnique({ where: { id: credentialId } });
  if (!row) return null;
  if (row.anchor) return row.anchor as unknown as AnchorReceipt;

  const vc = row.payload as unknown as SignedCredential;
  const topicId = await ensureProjectTopic(prisma, row.project_id);
  if (!topicId) return null;

  const receipt = await anchorToTopic(topicId, {
    v: 1,
    kind: anchorKindFor(row.schema_id),
    credential_id: row.id,
    package_hash: vc.package_hash,
    project_id: row.project_id,
    ipfs_cid: typeof vc.subject?.ipfs_cid === 'string' ? vc.subject.ipfs_cid : undefined,
  });

  await prisma.credential.update({
    where: { id: row.id },
    data: { anchor: receipt as unknown as object },
  });
  // Rows that stamped simulated coordinates at insert time now get the real ones.
  await prisma.verificationRequest.updateMany({
    where: { credential_id: row.id },
    data: { hcs_topic_id: receipt.topic_id, hcs_sequence_number: receipt.sequence_number },
  });
  return receipt;
}

/**
 * Anchor a token mint as its own HCS message on the project topic and replace
 * the token's simulated hcs coordinates with the real ones. Called right
 * after mintToken; not idempotent by itself (the route mints exactly once).
 */
export async function anchorMintOnChain(prisma: PrismaClient, tokenId: string): Promise<AnchorReceipt | null> {
  if (!hederaEnabled()) return null;
  const token = await prisma.guardianToken.findUnique({ where: { id: tokenId } });
  if (!token) return null;
  const credential = await prisma.credential.findUnique({ where: { id: token.credential_id } });
  if (!credential) return null;
  const vc = credential.payload as unknown as SignedCredential;
  const topicId = await ensureProjectTopic(prisma, credential.project_id);
  if (!topicId) return null;

  const receipt = await anchorToTopic(topicId, {
    v: 1,
    kind: 'token_mint',
    credential_id: credential.id,
    package_hash: vc.package_hash,
    project_id: credential.project_id,
  });
  await prisma.guardianToken.update({
    where: { id: token.id },
    data: {
      hcs: {
        topic_id: receipt.topic_id,
        sequence_number: receipt.sequence_number,
        explorer_url: receipt.explorer_url,
      },
    },
  });
  return receipt;
}

/**
 * The project's own HTS credit token (token NAME = project name), created
 * lazily on first mint. Guarded update so concurrent first-mints converge
 * on one token per project.
 */
export async function ensureProjectToken(prisma: PrismaClient, projectId: string): Promise<string | null> {
  if (!hederaEnabled()) return null;
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { name: true, hts_token_id: true },
  });
  if (!project) return null;
  if (project.hts_token_id) return project.hts_token_id;

  const tokenId = await createProjectFungibleToken(projectId, project.name);
  const claimed = await prisma.project.updateMany({
    where: { id: projectId, hts_token_id: null },
    data: { hts_token_id: tokenId },
  });
  if (claimed.count === 1) return tokenId;
  const winner = await prisma.project.findUnique({
    where: { id: projectId },
    select: { hts_token_id: true },
  });
  return winner?.hts_token_id ?? tokenId;
}

/**
 * Credit issuance replacing the browser's simulated token: an HTS fungible
 * batch on the PROJECT'S OWN token (name = project name). The receipt yields
 * the Verra-style contiguous serial range; batch number = running count of
 * this project's issuances. Row is stamped with token_id, serial_number
 * (= batch number) and the `batch` serial-range detail.
 */
export async function mintRealToken(
  prisma: PrismaClient,
  tokenRowId: string,
): Promise<{ token_id: string; serial_number: number } | null> {
  if (!hederaEnabled()) return null;
  const row = await prisma.guardianToken.findUnique({ where: { id: tokenRowId } });
  if (!row) return null;
  const tokenId = await ensureProjectToken(prisma, row.project_id);
  if (!tokenId) return null;

  const units = Math.round(row.amount_tco2e * 100);
  const range = await mintVcuBatch(tokenId, units);
  // Batch number = this project's issuance count (the row being minted included).
  const batchId = await prisma.guardianToken.count({ where: { project_id: row.project_id } });

  await prisma.guardianToken.update({
    where: { id: row.id },
    data: {
      token_id: tokenId,
      serial_number: batchId,
      batch: range as never,
    },
  });
  return { token_id: tokenId, serial_number: batchId };
}

/** Route-layer wrapper: anchoring must never fail the business operation. */
export async function anchorBestEffort<T>(
  fn: () => Promise<T>,
  log: { warn: (obj: unknown, msg: string) => void },
): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    log.warn({ err: String(err) }, 'hedera anchor failed — stored without anchor, retry via POST /credentials/:id/anchor');
    return null;
  }
}
