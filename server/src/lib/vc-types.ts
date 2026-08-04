// Copied note-for-note from carbon-ready/src/types/index.ts (VerifiableCredential,
// GuardianToken) — source of truth until workspaces (Phase 1b). The UUID and
// UserRole aliases below stand in for the SPA-wide types those definitions
// reference; UserRole matches the Prisma enum value-for-value.
type UUID = string;
type UserRole = 'admin' | 'project_owner' | 'esg_manager' | 'verifier';

export interface VerifiableCredential {
  id: string;                 // also stored as VerificationRequest.credential_id
  schema_id: string;
  issuer_did: string;
  issued_at: string;
  subject: Record<string, unknown>;
  package_hash: string;
  hcs: {
    topic_id: string;
    sequence_number: number;
    consensus_timestamp: string;
    explorer_url: string;
  };
  // W3C VC shape + Ed25519 proof. Optional: seed-era credentials predate signing.
  context?: string[];         // ['https://www.w3.org/ns/credentials/v2']
  vc_type?: string[];         // ['VerifiableCredential', schema.type]
  proof?: {
    type: 'Ed25519Signature2020';
    created: string;
    verificationMethod: string;   // issuer did:key
    proofValue: string;           // hex signature over sha256(canonical(vc sans proof))
  };
  // Real Hedera consensus coordinates, attached by the SERVER after signing
  // (outside the signed envelope, like `proof`). Absent until anchored.
  anchor?: {
    topic_id: string;
    sequence_number: number;
    consensus_timestamp: string;
    explorer_url: string;
  } | null;
}

// A minted VCU token. In Guardian this is a separate step after the VC is issued:
// the Standard Registry mints one token per anchored credential.
export interface GuardianToken {
  id: string;
  token_id: string;             // Hedera token id, e.g. '0.0.480200'
  serial_number: number;
  project_id: UUID;
  credential_id: string;        // the VerifiableCredential this token certifies
  amount_tco2e: number;
  monitoring_period_start: string;
  monitoring_period_end: string;
  minted_at: string;
  minted_by_role: UserRole;     // 'admin' = Standard Registry
  hcs: {
    topic_id: string;
    sequence_number: number;
    explorer_url: string;
  };
  /** Server-minted dual-standard detail: HTS serial range + ERC-1155 batch. Absent in local mode. */
  batch?: Record<string, unknown> | null;
}
