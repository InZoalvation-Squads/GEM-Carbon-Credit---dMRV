# Carbon Ready — Sprint 1 MVP

Digital MRV platform for solar rooftop carbon credit tracking. Sprint 1 ships a clickable React app with stubbed API calls — backend planned for Sprint 2.

## Quick Start

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # vitest run
npm run build    # production bundle
```

## What's Inside

- **Dashboard** — KPIs (generation, reduction, active projects, latest upload), daily generation area chart, monthly reduction bar chart, recent activity feed.
- **Projects** — list, search/filter, create (modal), edit (drawer), detail page with records.
- **Upload** — drop a CSV of `Date,Generation_kWh`, row-by-row validation, confirm + save.
- **Calculations** — run carbon calc per project, see EF used, KPI totals, daily / monthly / total tabs, monthly trend chart.
- **Emission Factors** — country/source master data with versioning; adding a new factor for an existing pair supersedes the previous version.
- **Audit Log** — append-only timeline of every state change, filterable by action / entity / date.

## Architecture

```
React SPA  →  lib/api.ts (stub)  →  Zustand store  →  localStorage
                                       ↓
                                  audit_logs slice (auto-written)
```

The store shape mirrors the documented Postgres schema; `lib/api.ts` mirrors the documented REST contracts. Sprint 2 replaces `lib/api.ts` with real `fetch()` calls without touching pages or components.

## Tech

Vite 5, React 18, TypeScript 5, Tailwind 3, React Router 6, Recharts 2, Zustand 4, PapaParse 5, date-fns 3, Lucide React, Vitest 1.

## Sample Data

3 projects (Pune, Bangkok, Hanoi), ~360 monitoring records spanning Dec 2025 → May 2026, 4 emission factors (IN/CEA v1+v2, TH/EGAT, VN/EVN). To wipe and re-seed, open DevTools console and run `localStorage.removeItem('carbon-ready-store-v1')`, then refresh.

## Tests

```bash
npm test
```

Covers `lib/csv.ts` (12 cases) and `lib/calc.ts` (11 cases) — the two pure-function libraries that power validation and calculation.

## Spec & Plan

- Spec: `../docs/superpowers/specs/2026-05-27-carbon-ready-sprint-1-design.md`
- Plan: `../docs/superpowers/plans/2026-05-27-carbon-ready-sprint-1.md`
