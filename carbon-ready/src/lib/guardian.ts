import type { CredentialSchema, EvidenceFile, GuardianConfig, VerifiableCredential, VerificationRequest } from '../types';
import { shortHash } from './hash';

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
