# Carbon Ready — Solar Rooftop dMRV

Digital MRV (Monitoring · Reporting · Verification) platform for solar rooftop carbon credits. A clickable React app with a stubbed API layer (Zustand + localStorage); a real backend swaps in at `lib/api.ts` without touching the UI.

- **Sprint 1 (MVP)** — projects, CSV monitoring, emission factors, carbon calculation, dashboard, audit foundation.
- **Sprint 2** — Evidence Management, Verification Workflow, and an Advanced (hash-chained) Audit Trail.
- **Sprint 3** — simulated Hedera Guardian anchoring: a credential schema, mock VC issuance, and a manual "Anchor" action that fills `credential_id`/`anchored_at`/HCS fields on approved packages, plus a `/guardian` page (Schema + Registry). No real Hedera infra.

## Quick Start

```bash
npm install
npm run dev      # http://localhost:5173 (falls back to 5174 if busy)
npm test         # vitest run — 32 tests
npm run build    # tsc -b + vite build
npx tsc -b       # type-check only (no separate npm script)
```

## What's Inside

**Sprint 1**
- **Dashboard** — KPIs (generation, reduction, active projects, latest upload), daily generation area chart, monthly reduction bar chart, activity feed.
- **Projects** — list, search/filter, create (modal), edit (drawer), detail page.
- **Upload** — drop a CSV of `Date,Generation_kWh`, row-by-row validation, confirm + save.
- **Calculations** — run carbon calc per project, see EF used, KPI totals, daily / monthly / total tabs.
- **Emission Factors** — country/source master data with versioning; a new factor for an existing pair supersedes the previous version.

**Sprint 2**
- **Evidence Management** — per-project document library (Evidence tab on the project detail page). Upload PDF/JPG/PNG/XLSX (drag-drop, auto-category, 50 MB cap), version chain (replace), archive, search & filter, detail drawer with preview + version history.
- **Verification Workflow** — global review queue (`/verifications`) with KPI strip and SLA timers; review page (`/verifications/:id`) with required-category coverage, threaded comments, and a state machine: `draft → submitted → under_review → revision_required ⇄ under_review → approved | rejected`. Approving locks the package and writes a `hash_value`.
- **Audit Log** — every state change is appended and **hash-chained** (`row_hash` links to the previous row). The page recomputes the chain in-browser and shows a "verified / broken" banner, plus field-level before→after diffs.

**Sprint 3 (simulated Guardian anchoring)**
- **Guardian** (`/guardian`) — a **Schema** tab rendering the W3C-VC-style `MRV Carbon Reduction Approval` credential schema, and a **Credential Registry** tab listing every anchored verification result (credential id, project, reduction, HCS topic/sequence, mock HashScan link).
- **Anchor action** — on an approved package's review page, **Anchor to Hedera Guardian** issues a mock Verifiable Credential, records mock HCS coordinates (topic / sequence / consensus timestamp), fills `credential_id`/`anchored_at`/`hcs_*`, and appends a `VERIFICATION_ANCHORED` row to the hash-chained audit log. Everything is labelled *simulated* — no real Hedera infra, SDK, or credentials. `lib/guardian.ts` is the seam a real Guardian REST + `@hashgraph/sdk` integration would replace.

## Architecture

```
Pages / Components  →  lib/api.ts (async stub)  →  Zustand store  →  localStorage
        ▲                                              │
        └──── reactive reads via useStore ─────────────┤
                                                       ▼
                          audit slice — auto-written by audit_write(), hash-chained
```

Every state-changing store action calls `audit_write(...)`, so the audit log captures all events centrally. The store shape mirrors the documented Postgres schema; `lib/api.ts` mirrors the REST contracts — Sprint 3 replaces it with real `fetch()` calls without touching pages or components.

## Tech

Vite 5, React 18, TypeScript 5 (strict), Tailwind 3, React Router 6, Recharts 2, Zustand 4 (persist), PapaParse 5, date-fns 3, Lucide React, Vitest 1.

## Sample Data

3 projects (Pune, Bangkok, Hanoi), ~360 monitoring records (Dec 2025 → May 2026), 4 emission factors (IN/CEA v1+v2, TH/EGAT, VN/EVN). Sprint 2 adds 9 evidence files (incl. a version chain + an archived item) and 4 verification packages — `VR-1000` approved/locked, `VR-1001` under review, `VR-1002` submitted, `VR-1003` revision required — plus a fully chained audit log. Sprint 3 pre-anchors `VR-1000` with a seed credential (`urn:vc:vr1000seed`) so the Guardian registry isn't empty on first load.

To wipe and re-seed, open DevTools console and run:
```js
localStorage.removeItem('carbon-ready-store-v3'); location.reload();
```
> The persist key moved `…-v1` → `…-v2` (Sprint 2) → `…-v3` (Sprint 3) so each sprint's new seed loads.

**Try it:** Projects → **Pune Rooftop Phase 1** → **Evidence** tab → Upload (use "add sample files"). Then **Verifications** → open `VR-1001` → comment / request revision / approve → **Anchor to Hedera Guardian**. Check **Guardian** for the credential registry and **Audit Log** for the live hash-chain banner (incl. the `VERIFICATION_ANCHORED` row).

## Tests

```bash
npm test
```

Covers `lib/csv.ts` (13 cases) and `lib/calc.ts` (12 cases) — the pure-function libraries powering validation and calculation — plus Sprint 3's mock Guardian client (`lib/guardian.ts`, 2), the `anchorVerification` store action + chain integrity (`store/anchor.test.ts`, 2), and Guardian/anchor UI render + interaction (`pages/guardian.ui.test.tsx`, 3). 32 pass.

## Docs

- **Working document (Sprint 1 + 2 + 3, bilingual):** `docs/dMRV-Working-Doc.md`
- Sprint 1 spec: `../docs/superpowers/specs/2026-05-27-carbon-ready-sprint-1-design.md`
- Sprint 1 plan: `../docs/superpowers/plans/2026-05-27-carbon-ready-sprint-1.md`
- Sprint 3 spec: `../docs/superpowers/specs/2026-05-28-carbon-ready-sprint-3-design.md`
- Sprint 3 plan: `../docs/superpowers/plans/2026-05-28-carbon-ready-sprint-3.md`
- Sprint 2 planning pack (PRD, user stories, DB, API, UX, security, backlog, AC, Hedera): `/Users/oppabig/dmrv-sprint2/docs/`
