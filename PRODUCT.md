# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

All four actor groups use the app; none is secondary.

- **GEM operations / project-proponent staff**: file T-VER PDDs and REC registrations, upload monitoring data, map IoT devices, and run carbon calculations. Long, form-heavy desk sessions.
- **VVB auditors (Validation & Verification Body)**: review validation and verification packages, evidence, comments, and the hash-chained audit trail. Reading-and-checking work where provenance must be legible.
- **Registry / TGO officers**: approve registrations, handle REC issuance (SF-02 / SF-04), and anchor approved results to Hedera Guardian.
- **Executives / ESG managers**: glance at portfolio dashboards and credit totals, sometimes on mobile.

## Product Purpose

Carbon Ready (GEM Carbon Credit dMRV) is a digital Monitoring, Reporting and Verification platform for solar-rooftop carbon credits in Thailand. It takes a project from methodology selection and PDD registration through monitoring data, calculation, verification, and REC issuance, down to an immutable anchor on Hedera. Success means a submission that a VVB and TGO can trust without re-checking it by hand.

## Positioning

"The Chain of Trust for Digital Carbon": every number traces back to measured data, every state change is hash-chained in the audit log, and approved results are anchored as verifiable credentials on Hedera HCS. It produces the official TGO T-VER / I-REC forms directly from that data.

## Operating Context

- Bilingual Thai / English UI with a language toggle; official documents are in Thai.
- Official outputs: T-VER-S-F001 PDD (standalone and aggregated, แบบควบรวม), SF-02 REC registration, and SF-04 issue requests. These follow TGO's government form layouts.
- Data sources: CSV uploads, an IoT Postgres ingest, and grid emission factors (TH/EGAT and others).
- Runs in demo mode (Zustand and localStorage) or against the Fastify/Prisma server (`server/`), with Hedera testnet anchoring.

## Capabilities and Constraints

- Routes and nav groups are fixed: Registration (Methodologies, Register Project), Overview (Dashboard, How it works), Measure & Report (Projects, Upload, IoT Mapping, Calculations), Verify & Anchor (Verifications, REC Issuance), plus Validation, Guardian, Audit Log, Emission Factors, Login, and Register.
- **Workflow and page structure must be preserved.** Keep the same routes, nav groups, and step order; a redesign changes look and layout within pages only.
- The bodies of the official TGO form templates (`src/templates/`) reproduce government documents and stay faithful to the reference; only the app chrome around them can change.
- The stack is React 18, Vite 8, Tailwind 3, Recharts, lucide-react, and Zustand. There are about 30 UI test files (`*.ui.test.tsx`) that query by text and role.

## Brand Commitments

- The GEM Carbon Credit logo (`public/gem-logo.svg`, `gem-logo-dark.svg`) and the TGO logo for official contexts.
- Brand colours from `BRAND.ai`: **petrol teal `#0e3e4e`** and **pastel lime `#d0ffa0`**. These are fixed anchors; everything else is open.
- Tagline: "The Chain of Trust for Digital Carbon".

## Evidence on Hand

- Real project data: Thai community-college solar rooftops (for example Nong Bua Lamphu, Ranong, Pattani, and Narathiwat), measured generation, and the TH grid emission factor.
- Login carousel photography in `public/login/`.
- No customer testimonials, pricing, or third-party benchmarks exist; do not fabricate them.
- Real data only: never invent plausible values in PDDs, seeds, or demo content. Blanks beat guesses.

## Product Principles

1. **Provenance is visible.** Every figure shows where it came from: measured, derived, factor version, hash, or anchor.
2. **The state of a submission is never ambiguous.** Draft, submitted, under review, revision, approved, or anchored is always obvious at a glance.
3. **Official output is exact.** Government forms are reproduced faithfully, not reinterpreted.
4. **Dense where people work, calm where they decide.** Forms and tables carry real density; approvals and anchors get space and weight.

## Accessibility & Inclusion

WCAG 2.2 AA. Thai script needs room: Anuphan/Thai line-height and no tiny tracked uppercase for Thai labels. The UI must be keyboard-operable throughout, because auditors work through long queues.
