# PDD Guardian Anchoring — Design Spec

**Date:** 2026-07-20
**Goal:** Mirror Guardian's real storage model for the PDD: the full document stays
off-chain (our store), and registration publishes a **PDD Registration credential** plus a
**simulated IPFS CID** with an HCS reference — so the demo tells the true story
"Hedera keeps hash + pointer, not the document".

Background: in a live Guardian deployment the PDD is captured as a signed Verifiable
Credential, the VC/VP JSON is uploaded to IPFS, and an HCS message on the project topic
records the CID + hash. HCS messages are ~1 KB, so full documents never go on-chain.

## Components

### 1. Guardian seam (`src/lib/guardian.ts`)

- `toIpfsCid(contentHash: string): string` — deterministic stand-in CID derived from the
  content hash: strips the `sha256-`/`…` decoration and returns
  `bafkrei${hex}` padded with `0` to 20 chars after the prefix (CIDv1-looking, stable for
  the same hash).
- `buildPddSubject(pdd: ProjectDesignDocument, evidence: EvidenceFile[], ipfsCid: string): Record<string, unknown>`
  — credential subject for a registered PDD:
  `{ pdd_id, project_id, methodology: methodology_snapshot, content_hash, ipfs_cid, evidence: [{id, content_hash}] (sorted by id, only linked ids), registered_at: validated_at }`.

### 2. Schema (`src/lib/guardian-schema.ts`)

- `PDD_REGISTRATION_SCHEMA_V1: CredentialSchema` — id `pdd-registration-v1`, name
  `PDD Project Registration`, properties matching the subject keys above.

### 3. Types (`src/types/index.ts`)

`ProjectDesignDocument` gains two required nullable fields (same style as `content_hash`):
- `ipfs_cid: string | null` — simulated IPFS CID, frozen at register.
- `credential_id: string | null` — the PDD Registration VC id.

Seed PDDs (if any in `src/data/seed.ts`) get `ipfs_cid: null, credential_id: null`.

### 4. Store — `registerProject()` (`src/store/index.ts`)

After computing `content_hash` (existing logic unchanged):
1. `ipfs_cid = toIpfsCid(content_hash)`.
2. `sequenceNumber = credentials.length + 1` (same counter as `anchorVerification`).
3. `vc = issueCredential(buildPddSubject(...), content_hash, sequenceNumber, guardianConfig, PDD_REGISTRATION_SCHEMA_V1, validated_at)`.
4. PDD is stored with `ipfs_cid` + `credential_id`; the VC is prepended to `credentials`.
5. Audit payload gains `credential_id`, `ipfs_cid`, `topic_id`, `sequence_number`.

### 5. UI — Registration detail

Where the registered PDD is shown (Registration page detail for state `registered`), add a
compact "Guardian anchor" block: IPFS CID (mono), credential id, and the HCS explorer link
(`hashscan.io` URL from the VC) — read-only, no new interactions.

## Testing (TDD)

- `guardian.test.ts`: `toIpfsCid` is deterministic, `bafkrei`-prefixed, differs for
  different hashes; `buildPddSubject` includes only linked evidence, sorted by id.
- store: `registerProject` issues a `pdd-registration-v1` credential, freezes matching
  `ipfs_cid`/`credential_id` on the PDD, and the credential subject carries the PDD's
  `content_hash`; a failed register (validation missing) issues nothing.

## Out of scope (YAGNI)

Per-project HCS topics, trust-chain UI linking token → PDD, selective disclosure
(public/private fields), real IPFS/network calls.
