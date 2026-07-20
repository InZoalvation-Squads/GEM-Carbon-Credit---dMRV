import type { CredentialSchema, EvidenceFile, GuardianConfig, GuardianToken, ProjectDesignDocument, UserRole, VerifiableCredential, VerificationRequest } from '../types';
import { shortHash } from './hash';

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
    reduction_tco2e: v.reduction_kgco2e / 1000,
    factors_snapshot: v.factors_snapshot,
    evidence: linked,
    approval_role: 'verifier',
    approved_at: v.locked_at,
    package_hash: v.hash_value,
  };
}

// Guardian creates one HCS topic per project under the policy topic. Simulated as a
// deterministic id in the 0.0.481000–0.0.481999 range so re-derivation is stable.
export function projectTopicId(projectId: string): string {
  let digest = 0;
  for (let i = 0; i < projectId.length; i++) digest = (Math.imul(digest, 31) + projectId.charCodeAt(i)) >>> 0;
  return `0.0.${481000 + (digest % 1000)}`;
}

// Deterministic stand-in for the IPFS CID Guardian records after uploading the
// signed PDD document. Derived from the content hash so re-registration of the
// same frozen payload yields the same CID.
export function toIpfsCid(contentHash: string): string {
  const hex = contentHash.replace('sha256-', '').replace('…', '');
  return `bafkrei${hex.padEnd(20, '0').slice(0, 20)}`;
}

export function buildPddSubject(pdd: ProjectDesignDocument, evidence: EvidenceFile[], ipfsCid: string): Record<string, unknown> {
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
  };
}

export function issueCredential(
  subject: Record<string, unknown>,
  packageHash: string,
  sequenceNumber: number,
  config: GuardianConfig,
  schema: CredentialSchema,
  issuedAt: string,
): VerifiableCredential {
  const id = `urn:vc:${shortHash(`${packageHash}|${sequenceNumber}`).replace('sha256-', '').replace('…', '')}`;
  return {
    id,
    schema_id: schema.id,
    issuer_did: config.issuer_did,
    issued_at: issuedAt,
    subject,
    package_hash: packageHash,
    hcs: {
      topic_id: config.topic_id,
      sequence_number: sequenceNumber,
      consensus_timestamp: issuedAt,
      explorer_url: `https://hashscan.io/${config.network}/topic/${config.topic_id}/message/${sequenceNumber}`,
    },
  };
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
