# Guardian API Migration — Design

**Date:** 2026-07-22
**Status:** Approved (brainstormed with user; scope = spec now, staged implementation later)
**Related:** `2026-07-22-methodology-as-data-design.md`, `2026-07-20-pdd-guardian-anchor-design.md`

## Goal

Replace every simulated Guardian/Hedera seam in Carbon Ready with a real
Hedera Guardian deployment, so that credentials, tokens, and the trust chain
are independently verifiable on Hedera — while keeping the existing UX intact.

## Current state (what is simulated, and where)

| Concern | Today (mock) | File / seam |
|---|---|---|
| Content hashing | 12-hex FNV labeled `sha256-…` | `src/lib/hash.ts` `shortHash()` |
| Issuer identity | One hardcoded DID string, no keys | `src/lib/guardian.ts` `DEFAULT_GUARDIAN_CONFIG` |
| VC issuance | VC-shaped object, no `@context`, no proof | `src/lib/guardian.ts` `issueCredential()` |
| HCS topic | Fake `0.0.481xxx` derived from string hash | `src/lib/guardian.ts` `projectTopicId()` |
| IPFS | CID fabricated from hash, nothing uploaded | `src/lib/guardian.ts` `toIpfsCid()` |
| Token mint | Local object, fixed collection `0.0.480200` | `src/lib/guardian.ts` `mintGuardianToken()` |
| Selective disclosure | Salt-free hash of sensitive values | `src/lib/pdd.ts` `splitDisclosure()` |
| Evidence hash | Hash of `file_name + file_size`, never bytes | `src/store/index.ts` `uploadEvidence` |
| Persistence | zustand → localStorage | `src/store/index.ts` |
| API | Facade over store with fake latency | `src/lib/api.ts` |
| Audit anchor | `hcs_topic_id`/`hcs_sequence_number` always null | `src/store/audit.ts` |
| Auth | Demo accounts, plaintext passwords | `src/data/accounts.ts` |

## Target architecture

```
React SPA (carbon-ready)
   │  fetch()  (lib/api.ts becomes a real HTTP client)
   ▼
Carbon Ready Backend (new; Node/Nest or similar)
   │  Guardian REST API (policy engine, DID/VC/VP, schemas)
   ▼
Hedera Guardian instance (Docker; MongoDB, Vault, IPFS node)
   │  @hashgraph/sdk
   ▼
Hedera network (HCS topics, HTS tokens) + Mirror Node (read/verify)
```

Guardian owns: policy workflow, schema publication, DID/VC/VP issuance,
HCS anchoring, HTS minting, IPFS pinning. The backend owns: session auth,
role mapping to Guardian users, file storage, audit log, and any UX-side
aggregation Guardian's API does not provide. The SPA keeps its current UI
and swaps `lib/api.ts` + `lib/guardian.ts` internals.

## Migration phases

### Phase 0 — Crypto hardening inside the SPA (this sprint, no infra)

Make everything that CAN be real without a network real, so later phases
change transport, not data shapes:

1. Real SHA-256 (`@noble/hashes`, sync drop-in for `shortHash`).
2. Salted selective disclosure (random 128-bit salt per sensitive field;
   salt kept private, publish `sha256(salt ‖ '|' ‖ canonical(value))`).
3. Evidence content hash from actual file bytes.
4. W3C-shaped VCs: `@context`, `type`, `credentialSubject`, and a real
   `proof` (Ed25519 via `@noble/curves`), verifiable offline; per-account
   `did:key` identities. Hedera coordinates stay simulated and labeled.

### Phase 1 — Backend + real persistence

- Stand up backend + DB; move store state server-side; `lib/api.ts` → fetch.
- Real auth (hashed passwords/OAuth), server-side RBAC, real audit IP.
- File storage (S3-compatible) keyed by the Phase-0 content hashes.

### Phase 2 — Guardian instance + policy import

- Deploy Guardian (Docker compose: guardian services, MongoDB, Vault, IPFS).
- Create Standard Registry, import or author policies (see methodology spec).
- Map Carbon Ready roles → Guardian users (Standard Registry / Project
  Proponent / VVB) via Guardian's user API.

### Phase 3 — Real issuance path

- PDD submit/approve and MRV approve flow through Guardian policy blocks
  instead of local state transitions; Guardian issues signed VCs on real
  per-project HCS topics; `projectTopicId()`/`issueCredential()` deleted in
  favor of Guardian responses persisted by the backend.
- IPFS CIDs come from Guardian's pinning of the published documents.

### Phase 4 — Tokens + externally verifiable trust chain

- HTS token per policy; mint per verified tCO2e batch (not 1 serial per VC).
- Trust chain tab reads HCS messages via Mirror Node REST so any third party
  can replay the chain without trusting our database.
- Audit log periodically anchored to a dedicated HCS topic (fills the
  currently-null `hcs_topic_id`/`hcs_sequence_number`).
- Retirement/transfer operations recorded on HTS.

## Configuration (.env contract)

The repo now carries `.env.example` (committed) and `.env` (gitignored,
user-filled). Keys, grouped by phase in which they become required:

| Key | Phase | Meaning |
|---|---|---|
| `GUARDIAN_API_URL` | 2 | Base URL of the Guardian instance, e.g. `http://localhost:3000` |
| `GUARDIAN_SR_USERNAME` / `GUARDIAN_SR_PASSWORD` | 2 | Standard Registry login used by the backend |
| `GUARDIAN_POLICY_ID` | 3 | Imported policy id credential flows run against |
| `HEDERA_NETWORK` | 2 | `testnet` \| `mainnet` |
| `HEDERA_OPERATOR_ID` / `HEDERA_OPERATOR_KEY` | 2 | Operator account funding Guardian's transactions (server-side only, never `VITE_`) |
| `MIRROR_NODE_URL` | 4 | Mirror node REST base for trust-chain reads |
| `IPFS_API_URL` or `WEB3_STORAGE_TOKEN` | 3 | Where Guardian pins documents |
| `DATABASE_URL` | 1 | Backend DB |
| `FILE_STORAGE_*` | 1 | S3-compatible bucket for evidence bytes |
| `VITE_API_BASE_URL` | 1 | The only key the SPA itself reads |

Secrets must never use the `VITE_` prefix — Vite inlines those into the
client bundle. The SPA talks only to our backend; Guardian and Hedera
credentials live server-side.

## Decisions still open (needed before Phase 1/2)

- Hosting for backend + Guardian (local Docker for dev is assumed; prod TBD).
- Testnet first; mainnet cutover criteria TBD.
- Whether T-VER methodologies are authored as Guardian policies in-house or
  contracted (Verra ones largely exist in the Guardian community library).

## Error handling & testing

- Every Guardian/Hedera call goes through a typed client with retry +
  idempotency keys (Guardian operations are async; poll task status).
- Contract tests against a dockerized Guardian in CI for the backend client.
- The SPA keeps its vitest suites; mock seams move from `lib/guardian.ts`
  into the HTTP layer, so UI tests keep running without infra.
