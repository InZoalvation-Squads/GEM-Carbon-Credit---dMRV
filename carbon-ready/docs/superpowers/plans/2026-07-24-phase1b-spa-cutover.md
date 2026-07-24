# Phase 1b — SPA Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The SPA talks to the Phase 1a backend when `VITE_API_BASE_URL` is set (server mode), while demo mode (no env → localStorage, exactly today's behavior) keeps working unchanged.

**Architecture — store-as-cache, write-through actions:** zustand remains the single source components read (selectors/UI untouched). A new typed fetch client (`src/lib/server-api.ts`) owns tokens + refresh. In server mode: login triggers `hydrateFromServer()` (bulk GETs fill the store), and each store mutation calls the server first, then applies the server's response to the local store. In demo mode every action behaves exactly as today (guard at the top: `if (!serverMode()) { …existing code… return; }`). Components change minimally (async handlers already tolerate promises).

**References:** Route table in `server/README.md` (50 routes, exact shapes). Spec: `docs/superpowers/specs/2026-07-22-phase1-backend-design.md` §Scope split. Server serializers define response field names (snake_case, same as SPA types — they were mirrored deliberately).

**Conventions:** work in `carbon-ready/`; never touch `server/` except reading. The user's dirty files (src/components/Sidebar.tsx, TopBar.tsx, topbar/sidebar ui tests, docs/reports/*) must never be modified or committed. Stage by explicit path. Commit trailer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`. All existing 147 tests must stay green (demo mode default in vitest — no VITE_API_BASE_URL in test env). Server-mode logic gets unit tests with a mocked `fetch` (vi.stubGlobal), not a live server.

---

### Task 1: Server API client + auth cutover

**Files:** Create `src/lib/server-api.ts`, `src/lib/server-api.test.ts`. Modify `src/store/index.ts` (login/register/logout + serverMode guards), `src/pages/Login.tsx` + `src/pages/Register.tsx` (async submit), `.env.example` (document VITE_API_BASE_URL already present).

- [ ] `server-api.ts`: `serverMode()` (Boolean of `import.meta.env.VITE_API_BASE_URL`); token pair persisted under `carbon-ready-session-v1` (localStorage); `apiFetch(path, {method, body, auth=true})` — JSON, Bearer access token, on 401 once: POST /auth/refresh with stored refresh token, retry; refresh failure → clear session + throw `SessionExpiredError`; error envelope `{error:{code,message}}` surfaced as `ApiError(code, message, status)`. Typed helpers per endpoint group are added task-by-task; this task ships `authApi` (register/login/refresh/logout/me).
- [ ] Store: `login`/`register` become async in server mode (return the same `{ok,error?}` shape — callers already handle it; make the actions `async` and demo mode returns resolved values); on success store `currentUser` from server response, then `await hydrateFromServer()` (this task: fetch nothing yet — stub that Task 2 fills; keep the call site). `logout` revokes server-side then clears session. Register page: role select must exclude admin in server mode (server 400s it anyway — mirror the restriction in the form).
- [ ] Tests: mocked-fetch unit tests for apiFetch (success, envelope error, 401→refresh→retry, refresh failure clears session); login flow store test with stubbed serverMode + fetch; ALL existing tests stay green (demo default).
- [ ] Commit `feat(spa): server api client + auth cutover behind VITE_API_BASE_URL`.

### Task 2: Read hydration + core data write-through

**Files:** Modify `src/lib/server-api.ts` (+`projectsApi, factorsApi, monitoringApi, methodologiesApi` GETs), `src/store/index.ts`.

- [ ] `hydrateFromServer()`: parallel GETs — projects, factors, methodologies (list + per-id export for full documents), monitoring per project (or a loop), pdds, verifications, evidence per project, credentials, tokens — filling the corresponding store slices verbatim (server shapes match SPA types; methodology documents from /export get their `id` re-attached from the list row). Failures surface a toast-able error; partial hydration is acceptable but reported.
- [ ] Write-through: `createProject`, `updateProject`, `addEmissionFactor`, `addMonitoringRecords` — server call first, apply returned entity to store. Audit slice: in server mode `audit_write` becomes a no-op (server writes the chain; AuditLog page hydrates via GET /audit in Task 4).
- [ ] Tests: hydrate happy path with mocked fetch (store slices populated); write-through applies server response (id from server, not local uid); demo mode untouched (existing tests).
- [ ] Commit `feat(spa): store hydration + core data write-through`.

### Task 3: Evidence + methodology import/export via server

- [ ] Evidence upload in server mode: multipart POST with the real File (client still computes sha256 via `hashFileBytes` and sends as `client_hash` — the server re-verifies; 422 mismatch surfaces as toast), replace/archive write-through; file download link uses `GET /evidence/:id/file` with auth header (fetch → blob URL).
- [ ] Methodologies page: import posts the JSON document to the server (admin), export downloads via the server endpoint in server mode; demo behavior unchanged otherwise.
- [ ] Tests: mocked-fetch for the three evidence mutations incl. 422 tamper path; import error message pass-through.
- [ ] Commit `feat(spa): evidence + methodology cutover`.

### Task 4: Workflow write-through (PDD + verifications) + audit page

- [ ] PDD actions (selectMethodology, savePddDraft [debounced PUT], submitPdd, startValidation, requestPddRevision, registerProject, rejectPdd, addPddComment) and verification actions (create/submit/startReview/requestRevision/approve/reject/addComment) call their endpoints and apply responses. `registerProject` in server mode uses the server's `{pdd, disclosure}` response (no local salt generation).
- [ ] AuditLog page in server mode reads `GET /api/v1/audit` (paginated) and shows chain status from `GET /api/v1/audit/verify`; demo mode keeps local computation.
- [ ] Tests: mocked-fetch per transition incl. 409 illegal-transition surfacing; register 422 missing-fields surfacing.
- [ ] Commit `feat(spa): workflow cutover + server audit page`.

### Task 5: Credential anchoring + mint via server

- [ ] Server mode `anchorVerification`: browser builds subject + signs VC exactly as today (issuer identity stays browser-held), then `POST /verifications/:id/anchor`; server response stamps the store. Same for the PDD credential (`POST /pdds/:id/credential` after register — SPA folds it into the register flow: register server call, then sign+POST credential; on credential failure PDD stays registered without credential + toast, retryable). `mintToken`: build token object as today then `POST /credentials/:id/mint`.
- [ ] Tests: mocked-fetch anchor happy + 422 signature-rejected surfacing; mint 409 double-mint surfacing.
- [ ] Commit `feat(spa): credential anchoring + mint via server`.

### Task 6: Live E2E smoke + docs

- [ ] With the real server running locally (`cd server && npm run dev`, real DB): `VITE_API_BASE_URL=http://localhost:4000 npm run dev`, walk register→login→project→PDD→register→monitoring→verification→approve→anchor→mint→audit verify in the browser via curl-level checks or a scripted playthrough against the API where UI automation is impractical; record results.
- [ ] Update `carbon-ready/docs/dMRV-Working-Doc.md` §12 (mock-seams section) to reflect server mode; note demo mode remains default.
- [ ] Full: SPA `npm test` + `tsc -b` + build; server `npm test`. Commit `docs(spa): phase 1b notes` + final review of the whole 1b range.
