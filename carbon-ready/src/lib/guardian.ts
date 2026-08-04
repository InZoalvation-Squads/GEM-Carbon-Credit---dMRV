import type { CredentialSchema, EvidenceFile, GuardianConfig, GuardianToken, ProjectDesignDocument, UserRole, VerifiableCredential, VerificationRequest } from '../types';
import { shortHash } from './hash';
import type { LocalIdentity } from './identity';
import type { DisclosureSplit } from './pdd';
import { signCredential } from './vc';

// The VCU token collection on Hedera. In a live deployment this is the token id
// created when the policy is imported; here it is a fixed stand-in.
export const GUARDIAN_TOKEN_ID = '0.0.480200';

// Stand-in for a Hedera Guardian deployment. Each function here is the exact seam
// a real implementation would replace (Guardian REST + @hashgraph/sdk). No network.
export const DEFAULT_GUARDIAN_CONFIG: GuardianConfig = {
  issuer_did: 'did:hedera:testnet:CarbonReadyIssuer;hedera:testnet:tid=0.0.480001',
  topic_id: '0.0.480100',
  network: 'testnet',
};

export function buildApprovalSubject(v: VerificationRequest, evidence: EvidenceFile[]): Record<string, unknown> {
  const linked = evidence
    .filter((e) => v.evidence_ids.includes(e.id))
    .map((e) => ({ id: e.id, content_hash: e.content_hash }))
    .sort((a, b) => a.id.localeCompare(b.id));
  return {
    verification_id: v.id,
    project_id: v.project_id,
    monitoring_period_start: v.monitoring_period_start,
    monitoring_period_end: v.monitoring_period_end,
    // toFixed(4) kills IEEE-754 division tails (3567.9/1000 → 3.5679000000000003):
    // the signed canonical text must survive the DB's ~15-significant-digit
    // jsonb round-trip byte-for-byte, or the Ed25519 proof breaks on read-back.
    reduction_tco2e: Number((v.reduction_kgco2e / 1000).toFixed(4)),
    factors_snapshot: v.factors_snapshot,
    evidence: linked,
    approval_role: 'verifier',
    approved_at: v.locked_at,
    package_hash: v.hash_value,
  };
}

// Guardian creates one HCS topic per project under the policy topic. Simulated as a
// deterministic id in the 0.0.481000–0.0.481999 range so re-derivation is stable.
/**
 * Consensus coordinates to DISPLAY for a credential: the server-written real
 * Hedera anchor when present, else the in-payload simulated hcs (local mode
 * and legacy credentials).
 */
export function displayHcs(c: VerifiableCredential): { topic_id: string; sequence_number: number; explorer_url: string; real: boolean } {
  if (c.anchor) {
    // HashScan has no /message/{n} route — older stored anchors carried it.
    return { ...c.anchor, explorer_url: c.anchor.explorer_url.replace(/\/message\/\d+$/, ''), real: true };
  }
  return { topic_id: c.hcs.topic_id, sequence_number: c.hcs.sequence_number, explorer_url: c.hcs.explorer_url, real: false };
}

export function projectTopicId(projectId: string): string {
  let digest = 0;
  for (let i = 0; i < projectId.length; i++) digest = (Math.imul(digest, 31) + projectId.charCodeAt(i)) >>> 0;
  return `0.0.${481000 + (digest % 1000)}`;
}

// Deterministic stand-in for the IPFS CID Guardian records after uploading the
// signed PDD document. Derived from the content hash so re-registration of the
// same frozen payload yields the same CID.
export function toIpfsCid(contentHash: string): string {
  const hex = contentHash.replace('sha256-', '');
  return `bafkrei${hex.padEnd(20, '0').slice(0, 20)}`;
}

export function buildPddSubject(pdd: ProjectDesignDocument, evidence: EvidenceFile[], ipfsCid: string, disclosure: DisclosureSplit): Record<string, unknown> {
  const linked = evidence
    .filter((e) => pdd.evidence_ids.includes(e.id))
    .map((e) => ({ id: e.id, content_hash: e.content_hash }))
    .sort((a, b) => a.id.localeCompare(b.id));
  return {
    pdd_id: pdd.id,
    project_id: pdd.project_id,
    methodology: pdd.methodology_snapshot,
    content_hash: pdd.content_hash,
    ipfs_cid: ipfsCid,
    evidence: linked,
    registered_at: pdd.validated_at,
    disclosed: disclosure.disclosed,
    redacted: disclosure.redacted,
  };
}

export function issueCredential(
  subject: Record<string, unknown>,
  packageHash: string,
  sequenceNumber: number,
  config: GuardianConfig,
  schema: CredentialSchema,
  issuedAt: string,
  issuer: LocalIdentity,
): VerifiableCredential {
  const id = `urn:vc:${shortHash(`${packageHash}|${sequenceNumber}`).replace('sha256-', '').slice(0, 24)}`; // 24 hex chars keeps urn:vc ids short and collision-safe for display
  return signCredential({
    id,
    schema_id: schema.id,
    issuer_did: issuer.did,
    issued_at: issuedAt,
    subject,
    package_hash: packageHash,
    hcs: {
      topic_id: config.topic_id,
      sequence_number: sequenceNumber,
      consensus_timestamp: issuedAt,
      explorer_url: `https://hashscan.io/${config.network}/topic/${config.topic_id}/message/${sequenceNumber}`,
    },
    vc_type: ['VerifiableCredential', schema.type],
  }, issuer);
}

// Mints a VCU token for an already-issued credential. Guardian treats this as a
// distinct step performed by the Standard Registry after the VC exists.
export function mintGuardianToken(
  credential: VerifiableCredential,
  serialNumber: number,
  role: UserRole,
  config: GuardianConfig,
  mintedAt: string,
): GuardianToken {
  const subject = credential.subject;
  return {
    id: `token:${GUARDIAN_TOKEN_ID}:${serialNumber}`,
    token_id: GUARDIAN_TOKEN_ID,
    serial_number: serialNumber,
    project_id: String(subject.project_id),
    credential_id: credential.id,
    amount_tco2e: Number(subject.reduction_tco2e),
    monitoring_period_start: String(subject.monitoring_period_start),
    monitoring_period_end: String(subject.monitoring_period_end),
    minted_at: mintedAt,
    minted_by_role: role,
    hcs: {
      topic_id: config.topic_id,
      sequence_number: serialNumber,
      explorer_url: `https://hashscan.io/${config.network}/token/${GUARDIAN_TOKEN_ID}`,
    },
  };
}
