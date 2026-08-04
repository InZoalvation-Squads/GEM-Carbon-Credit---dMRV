# Phase 1a Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up `server/` (Fastify 5 + Prisma + Postgres) implementing every SPA store action as an authenticated REST endpoint with a server-side audit chain — SPA untouched this sprint.

**Architecture:** Module-per-domain under `server/src/modules/<name>/` (routes.ts + service.ts + tests). Prisma schema mirrors `carbon-ready/src/types/index.ts`. JWT auth with argon2 + rotated refresh tokens. Evidence bytes stream to disk with server-side SHA-256.

**Tech Stack:** Node 24, Fastify 5, TypeScript (strict), Prisma, Postgres 18 (`100.119.217.61:5432` — connection VERIFIED working, empty DB, CREATE ok), argon2, @fastify/jwt, @fastify/multipart, @fastify/rate-limit, @fastify/cors, zod, vitest.

**Spec:** `carbon-ready/docs/superpowers/specs/2026-07-22-phase1-backend-design.md` — read it first; it fixes layout, auth rules, error envelope, and what stays client-side (VC signing/mint stay in the browser; server stores signed objects).

**Conventions for every task:**
- Work dir `server/` (create at repo root). Never touch `carbon-ready/` except where a task says to copy a lib file OUT of it.
- Never commit the user's dirty files (carbon-ready/src/components/Sidebar.tsx, TopBar.tsx, topbar/sidebar ui tests, src/data/accounts.ts, docs/reports/*). Stage by explicit path only. Commit trailer: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- `server/.env` (gitignored) holds DATABASE_URL built from the carbon-ready/.env DB_* values; `server/.env.example` is committed.
- Tests: vitest, route-level via `app.inject()`. Test DB: `carbon_credit_dMRV_test` (create via admin connection in test setup; user has CREATEDB-equivalent rights in-db — if `CREATE DATABASE` fails, fall back to schema `test_<runid>` inside the main DB and set `?schema=` in the test DATABASE_URL).
- Error envelope everywhere: `{ error: { code: string, message: string } }`.
- All IDs app-generated strings via `uid(prefix)` (same scheme as SPA store: `${prefix}-${Date.now().toString(36)}-${random36}`).

---

### Task 1: Scaffold + config + health

**Files:** Create `server/package.json`, `server/tsconfig.json`, `server/vitest.config.ts`, `server/.env.example`, `server/.gitignore` (node_modules, dist, .env, storage/), `server/src/config.ts`, `server/src/app.ts`, `server/src/index.ts`, `server/src/app.test.ts`.

- [ ] Step 1: `mkdir server && cd server && npm init -y`; install: `fastify @fastify/jwt @fastify/multipart @fastify/cors @fastify/rate-limit @prisma/client argon2 zod dotenv` and dev: `typescript tsx vitest @types/node prisma`. Scripts: `"dev": "tsx watch src/index.ts"`, `"build": "tsc -p ."`, `"test": "vitest run"`, `"start": "node dist/index.js"`.
- [ ] Step 2: tsconfig strict, ES2022, moduleResolution bundler/node16 (match tsx), outDir dist.
- [ ] Step 3: `src/config.ts` — zod-validated env: DATABASE_URL, JWT_SECRET (min 32 chars), PORT (default 4000), CORS_ORIGIN (default http://localhost:5173), STORAGE_DIR (default ./storage), DEMO_SEED_PASSWORD (optional). `.env.example` documents each; also generate `server/.env` locally from carbon-ready/.env DB_* values: `DATABASE_URL=postgresql://<DB_USER>:<DB_PASSWORD>@<DB_HOST>:<DB_PORT>/<DB_NAME>?sslmode=disable` plus a freshly generated JWT_SECRET (`openssl rand -hex 32`). NEVER print or commit the real values.
- [ ] Step 4: `src/app.ts` exports `buildApp()` registering cors, rate-limit (auth routes: 20/min), sensible default error handler mapping zod → 400 envelope, `GET /health` → `{ ok: true }`. `src/index.ts` boots it on PORT.
- [ ] Step 5: failing test `src/app.test.ts` (health 200 + envelope shape on 404), then green: `npm test`.
- [ ] Step 6: Commit `feat(server): scaffold fastify backend with config + health`.

### Task 2: Prisma schema + migration + seed

**Files:** Create `server/prisma/schema.prisma`, `server/src/lib/db.ts` (PrismaClient singleton), `server/prisma/seed.ts`; copy `carbon-ready/src/lib/hash.ts` → `server/src/lib/hash.ts` (header: "Copied from carbon-ready/src/lib/hash.ts — source of truth until workspaces (Phase 1b)"; drop the DOM-only `hashFileBytes`).

- [ ] Step 1: schema.prisma — models (snake_case tables, string PKs, no autoincrement): Organization, User (email unique, password_hash, role enum UserRole{admin,project_owner,esg_manager,verifier}, refresh_token_hash String?), Project (lifecycle enum), MonitoringRecord (param_key/unit String?), EmissionFactor, EvidenceFile (content_hash, storage_path String?, parent_id self-relation, status enum), VerificationRequest (state enum, evidence_ids String[], factors_snapshot), VerificationComment, Methodology (code+version @@unique, document Json — the full v2 doc), Pdd (section_data Json, disclosure_salts Json?, state enum, evidence_ids String[]), Credential (id, schema_id, payload Json), GuardianToken (serial_number Int, credential_id unique), AuditLog (row_hash, prev_row_hash, payload Json, hcs fields nullable, created_at DateTime, indexed (created_at)).
- [ ] Step 2: `npx prisma migrate dev --name init` against the real DB (it is empty — verified). Commit the migration folder.
- [ ] Step 3: `prisma/seed.ts` ports `carbon-ready/src/data/seed.ts` minimal core: org, 4 demo users (argon2 of DEMO_SEED_PASSWORD, skip users entirely when env absent), TH/IN/VN emission factors, the 9 methodologies (import the JSON documents by running carbon-ready's `methodologyToJson` output — copy the 9 JSON files into `server/prisma/seed-data/methodologies/*.json` generated via a one-off node script from the SPA package).
- [ ] Step 4: `npx prisma db seed` works; a test asserts seed idempotency (run twice, counts stable).
- [ ] Step 5: Commit `feat(server): prisma schema, initial migration, seed`.

### Task 3: Auth module (TDD throughout)

**Files:** `server/src/plugins/auth.ts`, `server/src/modules/auth/{routes.ts,service.ts,auth.test.ts}`, `server/src/modules/users/{routes.ts,users.test.ts}`.

- [ ] Endpoints: `POST /api/v1/auth/register` {name,email,role,password(≥8)} → 201 {user, tokens} (email unique 409); `POST /api/v1/auth/login` → {user, access_token, refresh_token}; `POST /api/v1/auth/refresh` {refresh_token} → rotated pair (old hash invalidated; reuse → 401 and revoke); `POST /api/v1/auth/logout`; `GET /api/v1/users/me`.
- [ ] argon2id hashing; refresh tokens random 256-bit, stored argon2-hashed on the user row; JWT access 15m {sub, role, org}, refresh 7d.
- [ ] `plugins/auth.ts`: `app.authenticate` preHandler + `requireRole(...roles)` guard returning 403 envelope.
- [ ] Tests: register/login happy, wrong password 401, duplicate email 409, refresh rotation + reuse-detection, role guard 403, rate limit 429 on 21st login attempt.
- [ ] Commit `feat(server): jwt auth with argon2 + refresh rotation`.

### Task 4: Audit chain service + core data modules

**Files:** `server/src/lib/audit.ts`, `server/src/modules/{projects,factors,monitoring}/...`

- [ ] `lib/audit.ts`: `writeAudit(tx, {userId, role, ip, action, entityType, entityId, payload, previousValue, newValue})` — reads latest row (`ORDER BY created_at DESC, id DESC LIMIT 1` inside the same transaction), computes `row_hash = shortHash(prev_row_hash | canonical(core))` exactly like `carbon-ready/src/store/audit.ts` (port the canonical core-field list from it). All mutating services run in `prisma.$transaction` and call it.
- [ ] Projects: GET list (org-scoped), POST create (owner/admin/esg), PATCH update; lifecycle field only mutated by pdd endpoints. Audit PROJECT_CREATED/UPDATED.
- [ ] Factors: GET, POST (admin/esg) with version bump + is_current flip in one transaction (port store logic). Audit EMISSION_FACTOR_ADDED.
- [ ] Monitoring: POST `/projects/:id/monitoring` bulk rows {record_date, generation_kwh}[]; stamps param_key/unit from the project's REGISTERED pdd's methodology (same rule as SPA store — port it); GET by project+range. Audit CSV_UPLOADED.
- [ ] Tests per module (route-level, real test DB): auth required, role rules, stamping only for registered PDD, factor versioning math.
- [ ] Commit `feat(server): audit chain + projects/factors/monitoring modules`.

### Task 5: Evidence module (streamed hashing)

**Files:** `server/src/modules/evidence/{routes.ts,service.ts,evidence.test.ts}`, `server/src/lib/storage.ts`.

- [ ] `POST /api/v1/projects/:id/evidence` multipart (file + fields category, description?, client_hash?): stream to `${STORAGE_DIR}/tmp-…` while updating an incremental SHA-256 (node:crypto); on finish rename to `${STORAGE_DIR}/<sha256>` (dedupe by content); if client_hash present and ≠ computed → 422 + delete temp. 25MB limit → 413.
- [ ] `POST /api/v1/evidence/:id/replace` (multipart, version chain: parent_id, version_number+1, supersede old), `POST /api/v1/evidence/:id/archive`, `GET /api/v1/evidence/:id/file` (auth, streams, correct content-type by kind).
- [ ] Audit EVIDENCE_UPLOADED/REPLACED/ARCHIVED. Tests: happy path (hash matches bytes), tamper 422, oversize 413, dedupe (two uploads same bytes → one file on disk, two rows), replace chain, file roundtrip byte-identical.
- [ ] Commit `feat(server): evidence upload with streamed server-side sha256`.

### Task 6: Methodology module

**Files:** `server/src/modules/methodologies/...`; copy `carbon-ready/src/lib/methodology-schema.ts` → `server/src/lib/methodology-schema.ts` (same source-of-truth header; adjust type import to a local minimal `Methodology` type file copied note-for-note from carbon-ready types).

- [ ] `GET /api/v1/methodologies` (list), `GET /:id/export` (the JSON document), `POST /api/v1/methodologies/import` (admin only; body = raw JSON document; parseMethodologyJson; duplicate code+version 409; audit METHODOLOGY_IMPORTED). Errors use the capped-3-issues format (port from SPA store).
- [ ] Tests: import valid/dup/invalid/non-admin; export→import roundtrip.
- [ ] Commit `feat(server): methodology import/export endpoints`.

### Task 7: PDD + verification workflow modules

**Files:** `server/src/modules/pdds/...`, `server/src/modules/verifications/...`

- [ ] PDD endpoints mirroring store actions 1:1 (same state guards, same audit actions): select-methodology, draft (PUT, unaudited), submit, start-validation, request-revision, register, reject, comments. `register` re-runs `validatePdd` server-side (port `validatePdd` + `sensitiveFieldKeys` + `splitDisclosure` + `pddContentHash` into `server/src/lib/pdd.ts`, same source-of-truth header), generates salts server-side (node:crypto randomBytes), freezes content_hash/ipfs_cid (same `toIpfsCid` stand-in, ported), stores disclosure_salts, flips project lifecycle — but does NOT sign a VC (client does; see Task 8).
- [ ] Verifications: submit, start-review, request-revision (verifier), approve (verifier; computes hash_value exactly like store), reject, comments. Same audit actions as SPA.
- [ ] Tests: full state-machine walk for both gates incl. every illegal transition → 409, role guards, register validation failure 422.
- [ ] Commit `feat(server): pdd + verification workflow endpoints`.

### Task 8: Credentials & tokens (store-signed objects)

**Files:** `server/src/modules/credentials/...`

- [ ] `POST /api/v1/verifications/:id/anchor` body = the browser-signed VC (zod: id, schema_id, issuer_did, proof required, subject, hcs); server checks verification is approved+unanchored, verifies the Ed25519 proof server-side (port `vc.ts` verify + `identity.ts` publicKeyFromDidKey — noble works in node), rejects invalid signatures 422, persists credential + stamps verification. Audit VERIFICATION_ANCHORED.
- [ ] `POST /api/v1/credentials/:id/mint` (admin; one per credential 409) persists the token object from the body after shape-validation. Audit TOKEN_MINTED. `GET /api/v1/credentials`, `GET /api/v1/tokens`.
- [ ] Same for PDD registration VC: `POST /api/v1/pdds/:id/credential`.
- [ ] Tests: valid signed VC accepted (sign with noble in test), tampered rejected 422, double-anchor 409, non-admin mint 403.
- [ ] Commit `feat(server): credential anchoring with server-side signature verification`.

### Task 9: Wrap-up

- [ ] `GET /api/v1/audit` (paginated, admin+esg) + chain verification endpoint `GET /api/v1/audit/verify` → {ok, broken_at?}.
- [ ] `server/README.md`: run instructions, env table, route list (method/path/role table generated by hand, complete).
- [ ] Full `npm test` green, `npm run build` clean, boot `npm run dev` and curl /health + login smoke against the REAL database.
- [ ] Commit `docs(server): readme + audit endpoints`, then final review of `server/` as a whole.
