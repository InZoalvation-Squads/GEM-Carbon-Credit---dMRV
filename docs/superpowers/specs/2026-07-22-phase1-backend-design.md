# Phase 1 Backend — Design

**Date:** 2026-07-22
**Status:** Approved (stack: Fastify + Prisma, chosen by user)
**Related:** `2026-07-22-guardian-api-migration-design.md` (this implements its Phase 1)

## Goal

A real backend (`server/` at repo root) owning auth, persistence, files, and
the audit chain — so localStorage stops being the system of record and the
Guardian connection (Phase 2) has a server to live in.

## Stack

Node 24, Fastify 5, TypeScript, Prisma ORM → Postgres (`100.119.217.61:5432`,
db `carbon_credit_dMRV`, credentials from `carbon-ready/.env`), argon2 password
hashing, JWT via `@fastify/jwt` (15-min access + 7-day refresh, refresh
rotation), zod for request validation, vitest for tests, multipart uploads via
`@fastify/multipart`, evidence bytes on local disk (`server/storage/`,
S3-compatible later). CORS restricted to the SPA origin.

## Scope split

- **Phase 1a (this sprint): the backend itself**, feature-complete against the
  SPA's store actions, fully tested. SPA keeps running on localStorage.
- **Phase 1b (next): SPA cutover module-by-module** — `lib/api.ts` becomes real
  fetch when `VITE_API_BASE_URL` is set; auth first, then projects/monitoring/
  evidence, then workflows. Documented here, not built in 1a.

## Layout

```
server/
  prisma/schema.prisma
  src/
    config.ts          # env loading (reads server/.env; keys per migration spec)
    app.ts             # fastify instance, plugins, route registration
    index.ts           # listen
    plugins/auth.ts    # jwt verify + role guard decorators
    lib/               # hash.ts, methodology-schema.ts (copied from SPA — see note)
    modules/<name>/    # routes.ts + service.ts + <name>.test.ts per module
      auth, users, projects, factors, monitoring, evidence,
      methodologies, pdds, verifications, audit
  storage/             # evidence bytes (gitignored)
```

**Shared-code note:** `hash.ts` (SHA-256/canonical) and `methodology-schema.ts`
(zod v2 document schema) are copied from `carbon-ready/src/lib` with a header
comment naming the source of truth. Converting the repo to npm workspaces to
truly share them is deliberately deferred — it would touch the SPA's tooling
mid-sprint for little gain. Revisit at Phase 1b.

## Data model (Prisma)

Tables mirror `carbon-ready/src/types/index.ts` 1:1 in snake_case:
organizations, users (password_hash, role enum), projects (lifecycle enum),
monitoring_records (param_key/unit nullable), emission_factors,
evidence_files (content_hash, storage_path, version chain via parent_id),
verification_requests, verification_comments, methodologies (document jsonb +
code/version unique), pdds (section_data jsonb, disclosure_salts jsonb),
credentials (jsonb payload incl. proof), guardian_tokens, audit_log
(row_hash/prev_row_hash chain, append-only — no UPDATE/DELETE grants in app
role's usage; enforced in service layer).

IDs stay app-generated strings (same `prefix-…` scheme the SPA uses) so
existing seed/demo identifiers survive the cutover.

## API shape

REST under `/api/v1`, JSON, zod-validated bodies, JWT bearer except
`/auth/login`, `/auth/register`, `/health`. Endpoints mirror store actions
one-to-one (e.g. `POST /verifications/:id/approve` = `approveVerification`)
so Phase 1b cutover is mechanical. Role guards replicate today's rules
(mint/import = admin, review transitions = verifier, etc.). Every mutating
endpoint writes the audit chain server-side with the caller's real IP.

Guardian-simulated operations (anchor → VC signing, mint) stay CLIENT-side in
1a: the browser holds the did:key private keys. The backend stores the signed
credential/token objects it receives (`POST /credentials`, `POST /tokens`,
validated + role-guarded). Server-side issuance arrives with Phase 2 when
Guardian does the signing.

## Auth

register/login/refresh/logout; argon2id; refresh tokens stored hashed in DB
(revocable, rotated on use); JWT claims: sub, role, org. The 4 demo accounts
become seeded users (password from env `DEMO_SEED_PASSWORD`, default off in
prod). Rate limit on auth routes (@fastify/rate-limit).

## Evidence upload

`POST /evidence` multipart → stream to disk under a content-addressed name,
compute SHA-256 server-side while streaming; if the client sent its own hash
and it mismatches, 422 (tamper/corruption signal, mirrors the SPA's
byte-hash work from Phase 0). 25 MB limit. `GET /evidence/:id/file` streams
back with auth.

## Error handling & testing

Uniform error envelope `{error: {code, message}}`; zod issues → 400 with the
capped-3 style messages used in the SPA. vitest: unit tests per service +
route tests via `fastify.inject()` against a dedicated test database
(`carbon_credit_dMRV_test` — created by the test setup; if the DB user lacks
CREATEDB, tests run in a rolled-back transaction per case). Seed script
mirrors `carbon-ready/src/data/seed.ts` so both worlds stay comparable.

## Out of scope (1a)

SPA cutover (1b), Guardian client (Phase 2), S3 storage, email/notifications,
multi-org tenancy beyond the single seeded organization.
