# Guardian VCU Minting + Trust Chain — Design Spec

**Date:** 2026-07-08
**Goal:** Close two gaps between the app and the real Hedera Guardian VM0047 policy:
mint VCU tokens as a separate step after credential issuance, and add a Trust Chain view
that shows the full lifecycle of a token's evidence chain.

## Background

The app already issues a Verifiable Credential when a verification package is anchored
(`anchorVerification` → `issueCredential`). Guardian separates **issuing the VC** from
**minting the token (VCU)** — the Standard Registry mints tokens after the credential exists.
The app has no token entity and no Trust Chain view.

## Components

### 1. `GuardianToken` type (`src/types`)

```
GuardianToken {
  id, token_id, serial_number,
  project_id, credential_id,
  amount_tco2e, monitoring_period_start, monitoring_period_end,
  minted_at, minted_by_role,
  hcs: { topic_id, sequence_number, explorer_url }
}
```

Stored in the store as `tokens: GuardianToken[]`; seed is empty.

### 2. `mintGuardianToken()` (`src/lib/guardian.ts`)

Pure builder — takes a credential + serial + config → returns a `GuardianToken`.
`amount_tco2e` comes from `credential.subject.reduction_tco2e`. Mirrors `issueCredential`
as the Guardian seam.

### 3. `mintToken(credentialId)` store action

Guards:
- credential must exist and be anchored (it always is once issued),
- must not already be minted (one token per credential),
- current role must be `admin` (Standard Registry) — matches Guardian role separation.

Effect: appends the token, writes a `TOKEN_MINTED` audit row. Returns the token or null.

### 4. Guardian page — two new tabs (4 total)

- **Credential Registry** (existing): add a Mint action per credential, shown only to the
  Standard Registry role. Once minted, show the serial and a "Minted" state instead.
- **Token History** (new): table of minted tokens — serial, project, amount tCO₂e,
  minted_at, HashScan link.
- **Trust Chain** (new): pick a token → render a chronological timeline of cards:
  `PDD registered → PDD validated → Monitoring verified → VC issued (anchored) → Token minted`.
  Assembled from pdds + verifications + credentials + tokens joined on project_id / credential_id.

## Testing (TDD)

- `mintToken`: mints after anchor; rejects double-mint; rejects non-Registry role; writes audit.
- Guardian UI: Mint button visible only to Standard Registry; Token History lists minted tokens;
  Trust Chain shows every stage for a minted token.

## Out of scope (YAGNI)

- No token transfer / retire / burn.
- No live Hedera connection (keep the existing mock testnet seam).
