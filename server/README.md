# Carbon Ready — Backend (Phase 1a)

Fastify 5 + Prisma + Postgres API for the Carbon Ready dMRV platform. Every
mutating action of the SPA store exists here as an authenticated REST endpoint,
recorded in a tamper-evident server-side audit hash chain.

## Running

Requirements: Node 24+, a reachable Postgres (18) database.

```bash
cd server
npm install

# 1. Environment — copy the template and fill in real values (never commit .env)
cp .env.example .env
#    - DATABASE_URL: postgresql://user:pass@host:5432/carbon_credit_dMRV?sslmode=disable
#    - JWT_SECRET:   openssl rand -hex 32
#    - DEMO_SEED_PASSWORD: optional; when set, the seed creates 4 demo users with it

# 2. Database schema
npx prisma migrate deploy      # apply committed migrations
npx prisma db seed             # org, TH/IN/VN factors, 9 methodologies, demo users (idempotent)

# 3. Run
npm run dev                    # tsx watch, http://localhost:$PORT (default 4000)
npm test                       # vitest; creates+migrates <db>_test (or a schema fallback)
npm run typecheck              # tsc --noEmit for src and tests
npm run build && npm start     # compile to dist/ and run
```

## Environment variables

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `DATABASE_URL` | yes | — | Postgres connection string used by Prisma (DB name is case-sensitive). |
| `JWT_SECRET` | yes | — | JWT signing secret, min 32 chars (`openssl rand -hex 32`). |
| `PORT` | no | `4000` | HTTP port the API listens on. |
| `CORS_ORIGIN` | no | `http://localhost:5173` | Allowed CORS origin (the SPA dev server). |
| `STORAGE_DIR` | no | `./storage` | Directory for uploaded evidence bytes (gitignored). |
| `DEMO_SEED_PASSWORD` | no | unset | When set, `prisma db seed` creates the 4 demo users with this password; unset skips them. |

## API

All routes are under `/api/v1` (except `/health`). Non-2xx responses always use
the envelope `{ "error": { "code": string, "message": string } }`. Authenticated
routes take `Authorization: Bearer <access_token>` (15-minute JWT; rotate with
the 7-day refresh token). Roles: `admin`, `project_owner`, `esg_manager`,
`verifier` — "any" below means any authenticated user. Auth routes are
rate-limited to 20/min per IP.

| Method | Path | Roles | Purpose |
| --- | --- | --- | --- |
| GET | `/health` | public | Liveness check → `{ ok: true }`. |
| POST | `/api/v1/auth/register` | public | Create an account (`project_owner`/`esg_manager`/`verifier`; admins cannot self-register) → user + token pair. |
| POST | `/api/v1/auth/login` | public | Email + password → user, access token, refresh token. |
| POST | `/api/v1/auth/refresh` | public | Rotate the refresh token pair; reuse of an old token revokes the session. |
| POST | `/api/v1/auth/logout` | any | Invalidate the caller's refresh token → 204. |
| GET | `/api/v1/users/me` | any | Current user profile. |
| GET | `/api/v1/projects` | any | List projects (org-scoped). |
| POST | `/api/v1/projects` | project_owner, admin, esg_manager | Create a project. |
| PATCH | `/api/v1/projects/:id` | project_owner, admin, esg_manager | Update project fields (lifecycle changes only via PDD endpoints). |
| GET | `/api/v1/factors` | any | List emission factors (all versions, newest first). |
| POST | `/api/v1/factors` | admin, esg_manager | Add a factor; bumps version per country+source, flips `is_current`. |
| POST | `/api/v1/projects/:id/monitoring` | project_owner, admin, esg_manager | Bulk-upload monitoring rows; stamps param_key/unit from the registered PDD's methodology. |
| GET | `/api/v1/projects/:id/monitoring` | any | List monitoring records, optional `?from=&to=` date range. |
| POST | `/api/v1/projects/:id/evidence` | project_owner, admin, esg_manager | Multipart upload; server streams a SHA-256 and stores by content hash (25 MB cap, `client_hash` mismatch → 422). |
| POST | `/api/v1/evidence/:id/replace` | project_owner, admin, esg_manager | Upload a new version (parent link, version+1, supersedes the old file). |
| POST | `/api/v1/evidence/:id/archive` | project_owner, admin, esg_manager | Archive an evidence file. |
| GET | `/api/v1/projects/:id/evidence` | any | List a project's evidence rows. |
| GET | `/api/v1/evidence/:id/file` | any | Stream the stored bytes with the right content type. |
| GET | `/api/v1/methodologies` | any | List methodologies. |
| GET | `/api/v1/methodologies/:id/export` | any | Export the full methodology JSON document (v2). |
| POST | `/api/v1/methodologies/import` | admin | Import a methodology JSON document (duplicate code+version → 409). |
| POST | `/api/v1/projects/:id/pdd` | project_owner, admin, esg_manager | Create the project's PDD by selecting a methodology. |
| PUT | `/api/v1/pdds/:id/draft` | project_owner, admin, esg_manager | Save section data while drafting (unaudited). |
| POST | `/api/v1/pdds/:id/submit` | project_owner, admin, esg_manager | Submit the PDD for validation. |
| POST | `/api/v1/pdds/:id/start-validation` | verifier, admin | Begin validation review. |
| POST | `/api/v1/pdds/:id/request-revision` | verifier, admin | Send the PDD back with a reason. |
| POST | `/api/v1/pdds/:id/register` | verifier, admin | Re-validate server-side, freeze content hash + CID, generate disclosure salts, register the project. |
| POST | `/api/v1/pdds/:id/reject` | verifier, admin | Reject the PDD with a reason. |
| POST | `/api/v1/pdds/:id/comments` | any | Comment on a PDD. |
| GET | `/api/v1/pdds` | any | List PDDs (org-scoped). |
| GET | `/api/v1/pdds/:id` | any | Fetch one PDD. |
| GET | `/api/v1/projects/:id/pdd` | any | Fetch a project's PDD. |
| GET | `/api/v1/pdds/:id/disclosure` | project_owner, esg_manager, admin | Disclosure salts of a registered PDD (the only endpoint that exposes them; proponent side only). |
| POST | `/api/v1/verifications` | project_owner, admin, esg_manager | Create a draft verification package for a monitoring period. |
| POST | `/api/v1/verifications/:id/submit` | project_owner, admin, esg_manager | Submit the package for review. |
| POST | `/api/v1/verifications/:id/start-review` | verifier, admin | Begin the review. |
| POST | `/api/v1/verifications/:id/request-revision` | verifier, admin | Send the package back with a reason. |
| POST | `/api/v1/verifications/:id/approve` | verifier, admin | Approve; computes the package `hash_value` exactly like the SPA store. |
| POST | `/api/v1/verifications/:id/reject` | verifier, admin | Reject with a reason. |
| POST | `/api/v1/verifications/:id/comments` | any | Comment (optionally pinned to an evidence file). |
| GET | `/api/v1/verifications` | any | List verifications, optional `?project_id=&state=`. |
| GET | `/api/v1/verifications/:id` | any | Fetch one verification (with comments). |
| POST | `/api/v1/verifications/:id/anchor` | admin, verifier | Persist the browser-signed MRV credential after server-side Ed25519 proof verification. |
| POST | `/api/v1/pdds/:id/credential` | admin, verifier | Persist the browser-signed PDD registration credential (same signature check). |
| POST | `/api/v1/credentials/:id/mint` | admin | Persist the minted token object (one per credential). |
| GET | `/api/v1/credentials` | any | List stored credentials. |
| GET | `/api/v1/tokens` | any | List minted tokens. |
| GET | `/api/v1/audit` | admin, esg_manager | Audit chain, newest first (`?limit=` 1–200 default 50, cursor `?before_seq=`, filters `?action=&entity_type=`). |
| GET | `/api/v1/audit/verify` | admin, esg_manager | Walk the whole chain recomputing every hash → `{ ok, checked, broken_at_seq? }`. |

## Architecture notes

- **SPA mirror.** Phase 1a re-implements the SPA's Zustand store actions
  1:1 as endpoints — same state machines, same audit action names, same
  validation rules — so the SPA can swap its store for API calls in Phase 1b
  without behavioral drift. The Prisma schema mirrors
  `carbon-ready/src/types/index.ts`.
- **Audit hash chain.** Every mutation writes an `audit_log` row inside the
  same transaction, with `row_hash = sha256((prev_row_hash ?? '∅') + '|' +
  canonical(core fields))` — identical to the SPA's recipe. A `BigInt seq`
  autoincrement column is the chain's authoritative order (created_at has only
  ms precision) and a pg advisory xact lock serializes appends so the chain
  can never fork. `GET /api/v1/audit/verify` re-walks the whole chain: an
  edited row fails hash recomputation, a deleted row breaks its successor's
  back-link.
- **Salt custody.** PDD registration splits section data into disclosed fields
  and salted hashes of sensitive ones (`splitDisclosure`). The server generates
  and stores the salts (`Pdd.disclosure_salts`); they are never spread into
  responses and only `GET /api/v1/pdds/:id/disclosure` (proponent-side roles,
  registered PDDs only) returns them, e.g. to prove a redacted value offline.
- **Browser signs, server verifies.** Verifiable credentials are signed in the
  browser (the private key never leaves it) and POSTed to the anchor endpoints;
  the server independently verifies the Ed25519 proof against the DID before
  persisting. Token minting likewise persists a client-produced object after
  shape validation.
- **Copied libs + drift guard.** `src/lib/{hash,pdd,vc,identity,
  methodology-schema,…}.ts` are copied from `carbon-ready/src` (source of
  truth until a shared workspace in Phase 1b). `src/lib/copy-drift.test.ts`
  fails when a copy drifts from its SPA source — re-copy, never edit the
  server version independently.

## Layout

```
server/
  prisma/            schema, migrations, seed + seed-data
  src/
    app.ts           buildApp(): plugins, error envelope, route registration
    config.ts        zod-validated environment
    lib/             audit chain, hashing, storage, VC/DID, copied SPA libs
    modules/<name>/  routes.ts + service.ts + <name>.test.ts per domain
    test/            test-DB bootstrap and shared fixtures
```
