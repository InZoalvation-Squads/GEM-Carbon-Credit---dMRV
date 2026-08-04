# Per-project HCS Topics + Trust Chain to PDD — Design Spec

**Date:** 2026-07-20
**Goal:** Mirror Guardian's topic hierarchy (registry topic → policy topic → **project
topic**) and extend the Trust Chain view so a minted token traces back through the MRV
credential to the PDD credential (VC + IPFS CID + HCS reference).

## Components

### 1. Project topic derivation (`src/lib/guardian.ts`)

- `projectTopicId(project_id: string): string` — deterministic simulated Hedera topic id
  per project: numeric digest of `project_id` mapped into `0.0.481000–0.0.481999`
  (`0.0.${481000 + digest % 1000}`). Registry-level `GuardianConfig.topic_id`
  (`0.0.480100`) stays as-is for anything not project-scoped.
- Derived, not stored: no new state fields; every consumer calls the function.

### 2. Credentials land on the project topic (`src/store/index.ts`)

- `registerProject()` and `anchorVerification()` issue their VCs with
  `{ ...guardianConfig, topic_id: projectTopicId(project_id) }`.
- **Per-topic sequence numbers:** `sequenceNumber` becomes
  `credentials.filter((c) => c.hcs.topic_id === topic).length + 1` (was a global counter).
- `mintToken()` keeps the token-level HCS reference unchanged (token explorer URL is
  token-scoped, not topic-scoped, matching Guardian).

### 3. Trust Chain shows the PDD anchor (`src/pages/Guardian.tsx`)

`TrustChainTab` resolves `pddCredential = credentials.find(c => c.id === pdd.credential_id)`.
The "PDD registered" step detail becomes, when the PDD is anchored:
`{pdd.id} · {methodology_snapshot} · VC {credential_id} · HCS {topic} #{seq} · ipfs {cid}`
(unchanged `—`/plain detail when the PDD predates anchoring, e.g. seeded PDDs).

## Testing (TDD)

- `guardian.test.ts`: `projectTopicId` is deterministic, `0.0.481xxx`-shaped, distinct
  for different projects.
- `registration.test.ts`: registered PDD's VC lands on `projectTopicId(project_id)` (not
  the registry topic) with per-topic sequence `1`.
- `anchor.test.ts`: anchored verification's `hcs_topic_id` equals its project's topic.
- `guardian.ui.test.tsx`: trust chain shows the PDD VC reference for a token whose PDD
  was anchored (register a fresh PDD in-test), and still renders for legacy seeded PDDs.

## Out of scope (YAGNI)

Topic-creation lifecycle (topics "exist" implicitly), policy-level topics beyond the
existing registry topic, selective disclosure.
