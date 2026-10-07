import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  Project, MonitoringRecord, EmissionFactor, CalculationResult,
  AuditLog, User, UserRole, Organization, UUID, AuditAction, EntityType,
  EvidenceFile, EvidenceCategory, VerificationRequest, VerificationComment,
  VerifiableCredential, GuardianConfig, GuardianToken,
  Methodology, ProjectDesignDocument, RecIssueRequest, RecIssueDraftPatch,
  RecRoiSettings, RecRoiSettingsInput, RecRoiProjectSetting, RecRoiProjectSettingInput,
} from '../types';
import {
  seedOrg, seedUser, seedFactors, seedProjects, seedRecords, seedAudit,
  seedEvidence, seedVerifications, seedComments, seedCredentials,
  seedMethodologies, seedPdds, seedRecIssues,
} from '../data/seed';
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from '../data/accounts';
import { validatePdd, pddContentHash, splitDisclosure, sensitiveFieldKeys } from '../lib/pdd';
import { parseMethodologyJson } from '../lib/methodology-schema';
import { newAudit, type AuditExtra } from './audit';
import { shortHash, randomSaltHex } from '../lib/hash';
import { buildApprovalSubject, buildPddSubject, issueCredential, mintGuardianToken, projectTopicId, toIpfsCid, DEFAULT_GUARDIAN_CONFIG } from '../lib/guardian';
import { issuerIdentity } from '../lib/identity';
import { MRV_APPROVAL_SCHEMA_V1, PDD_REGISTRATION_SCHEMA_V1 } from '../lib/guardian-schema';
import {
  serverMode, authApi, ApiError, SessionExpiredError, onSessionExpired,
  projectsApi, factorsApi, monitoringApi, methodologiesApi,
  pddsApi, verificationsApi, evidenceApi, credentialsApi, tokensApi, recIssuesApi, recRoiApi,
  type ServerUser,
} from '../lib/server-api';
import { EMPTY_REC_ROI_SETTINGS } from '../lib/rec-roi';

interface AppState {
  currentUser: User;
  setRole: (role: UserRole) => void;
  // Dual-mode auth: demo accounts (localStorage) by default; real backend
  // when VITE_API_BASE_URL is set. Both paths resolve the same {ok,error} shape.
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => void;
  registeredAccounts: Array<User & { password: string }>;
  register: (input: { name: string; email: string; role: UserRole; password: string }) => Promise<{ ok: boolean; error?: string }>;
  // Server mode: bulk-GET hydration after login and after a reload. Slices
  // are replaced wholesale (server is the source of truth); failed slice
  // names land in hydration_errors — partial hydration is allowed.
  hydrateFromServer: () => Promise<void>;
  /** Lightweight periodic re-sync of the collaboration-volatile slices only. */
  refreshFromServer: () => Promise<void>;
  hydration_errors: string[];
  /**
   * True once this page load has run hydrateFromServer. Never persisted: after
   * a reload the stored slices are the last visit's copy, so AppShell loads
   * from the server again before showing them.
   */
  server_loaded: boolean;
  organization: Organization;
  projects: Project[];
  records: MonitoringRecord[];
  factors: EmissionFactor[];
  calculations: CalculationResult[];
  audit: AuditLog[];
  evidence: EvidenceFile[];
  verifications: VerificationRequest[];
  comments: VerificationComment[];
  credentials: VerifiableCredential[];
  tokens: GuardianToken[];
  guardianConfig: GuardianConfig;
  methodologies: Methodology[];
  pdds: ProjectDesignDocument[];
  recIssues: RecIssueRequest[];
  // REC ROI assumptions (org-level) + optional per-project settings. Results
  // are never stored — lib/rec-roi.ts recomputes them from current records.
  recRoiSettings: RecRoiSettings;
  recRoiProjectSettings: RecRoiProjectSetting[];
  /** Demo-mode writes (server mode goes through api.ts → recRoiApi). */
  saveRecRoiSettings: (input: RecRoiSettingsInput) => void;
  saveRecRoiProjectSetting: (project_id: UUID, input: RecRoiProjectSettingInput) => void;

  // Methodology-as-data: import a validated JSON document into the library.
  // Server mode returns a promise (see dual()) — callers await the result.
  importMethodology: (json: string) => { ok: boolean; error?: string; methodology?: Methodology };

  // Registration (Gate 1)
  selectMethodology: (project_id: UUID, methodology_id: UUID) => ProjectDesignDocument;
  savePddDraft: (pdd_id: UUID, section_data: Record<string, unknown>, evidence_ids: UUID[]) => void;
  submitPdd: (pdd_id: UUID) => void;
  startValidation: (pdd_id: UUID) => void;
  requestPddRevision: (pdd_id: UUID, summary: string) => void;
  registerProject: (pdd_id: UUID) => boolean;
  /** Server mode: overlay the server-registered PDD + its anchored credential onto the local store. */
  applyServerRegistration: (pdd: ProjectDesignDocument, credential: VerifiableCredential) => void;
  /** Server mode: overlay any server-returned PDD (Gate-1 transitions) + derive the project lifecycle. */
  applyServerPdd: (pdd: ProjectDesignDocument) => void;
  /** Server mode: insert a server-created review comment. */
  ingestComment: (comment: VerificationComment) => void;
  /** Server mode: overlay the server-anchored verification + credential. */
  applyServerVerificationAnchor: (verification: VerificationRequest, credential: VerifiableCredential) => void;
  /** Server mode: overlay any server-returned verification (review transitions). */
  applyServerVerification: (verification: VerificationRequest) => void;
  /** Server mode: overlay a server-minted token (real HTS coordinates). */
  applyServerMint: (token: GuardianToken) => void;
  rejectPdd: (pdd_id: UUID, reason: string) => void;
  addPddComment: (pdd_id: UUID, body: string, section_key?: string) => void;
  pddByProject: (project_id: UUID) => ProjectDesignDocument | undefined;
  validationQueue: () => ProjectDesignDocument[];

  audit_write: (action: AuditAction, entity_type: EntityType, entity_id: UUID | null, payload?: Record<string, unknown>, extra?: AuditExtra) => void;

  createProject: (p: Omit<Project, 'id' | 'created_at' | 'updated_at' | 'organization_id' | 'lifecycle_stage'>) => Project;
  updateProject: (id: UUID, patch: Partial<Project>) => Project | undefined;

  addMonitoringRecords: (project_id: UUID, rows: Array<{ record_date: string; generation_kwh: number }>) => number;

  addEmissionFactor: (input: Omit<EmissionFactor, 'id' | 'version' | 'is_current' | 'created_at'>) => EmissionFactor;

  recordCalculation: (project_id: UUID, emission_factor_id: UUID, totals: { generation_kwh: number; reduction_kgco2e: number }) => void;

  // Sprint 2 — Evidence
  uploadEvidence: (project_id: UUID, input: { file_name: string; kind: EvidenceFile['kind']; file_size: number; category: EvidenceCategory; description?: string; content_hash?: string }) => EvidenceFile;
  /** Insert a server-created evidence row (already persisted remotely) into the local store. */
  ingestEvidence: (file: EvidenceFile) => void;
  /** `file` carries the real bytes — required in server mode, ignored in demo mode. */
  replaceEvidence: (evidence_id: UUID, input: { file?: File; file_name?: string; file_size: number; content_hash?: string }) => EvidenceFile | undefined;
  archiveEvidence: (evidence_id: UUID) => void;

  // Sprint 2 — Verification workflow
  createVerification: (input: {
    project_id: UUID; monitoring_period_start: string; monitoring_period_end: string;
    reduction_kgco2e: number; factors_snapshot: string; evidence_ids: UUID[];
  }) => VerificationRequest;
  submitVerification: (id: UUID) => void;
  startReview: (id: UUID) => void;
  requestRevision: (id: UUID, summary: string) => void;
  approveVerification: (id: UUID, note?: string) => void;
  rejectVerification: (id: UUID, reason: string) => void;
  addComment: (verification_id: UUID, body: string, evidence?: { id: UUID; name: string }) => void;

  // Sprint 3 — Hedera Guardian anchoring (simulated)
  anchorVerification: (id: UUID) => void;
  // Guardian VCU minting — Standard Registry mints a token per anchored credential.
  mintToken: (credential_id: string) => GuardianToken | null;

  // SF-04 — REC issuance (I-REC(E) Issue Requests). Parallel to the
  // verification workflow above; never entangled with it.
  createRecIssue: (input: {
    project_id: UUID; period_start: string; period_end: string;
    request_type: 'Normal' | 'Self consumption'; applied_mwh?: number;
    receiving_org_name?: string; receiving_account_id?: string;
    facility_id?: string; requested_labels?: string; evidence_ids?: UUID[];
  }) => RecIssueRequest;
  /**
   * Draft-only patch (demo-mode counterpart of PUT /rec-issues/:id).
   * Recomputes total_production_mwh when the period changes. Quiet (no
   * audit) — the trail begins at submit. Returns undefined if the row is
   * missing or not a draft. Looser than the server PUT, which additionally
   * rejects periods with total production <= 0 and invalid dates — demo
   * drafts stay permissive, consistent with createRecIssue above.
   */
  updateRecIssue: (id: UUID, patch: RecIssueDraftPatch) => RecIssueRequest | undefined;
  /** No-ops (returns false) unless the row exists and is a draft. */
  submitRecIssue: (id: UUID) => boolean;
  approveRecIssue: (id: UUID) => void;
  rejectRecIssue: (id: UUID, reason: string) => void;
  deleteRecIssue: (id: UUID) => void;
  /** Server mode: overlay any server-returned REC issue request (create/update/transitions). */
  applyServerRecIssue: (recIssue: RecIssueRequest) => void;

  resetToSeed: () => void;
}

function uid(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

/**
 * SF-04 MWh window: sum a project's generation_kwh over [start, end] and
 * convert to MWh. Same rounding as the server's mwhForPeriod and
 * RecIssueModal's preview — keep the three in sync.
 */
function recMwhForPeriod(records: MonitoringRecord[], projectId: UUID, start: string, end: string): number {
  const kwh = records
    .filter((m) => m.project_id === projectId && m.record_date >= start && m.record_date <= end)
    .reduce((sum, m) => sum + m.generation_kwh, 0);
  return Math.round((kwh / 1000) * 1e6) / 1e6;
}

const CALLER_IP = '203.0.113.10'; // stand-in for request IP until real auth middleware (Sprint 3+)

/** Server user → SPA User (drops organization_id; org handling stays store-side). */
function serverUserToUser(u: ServerUser): User {
  return { id: u.id, email: u.email, name: u.name, role: u.role, created_at: u.created_at };
}

/** Server-mode auth failures → user-facing message for the login/register forms. */
function authErrorMessage(err: unknown): string {
  if (err instanceof ApiError || err instanceof SessionExpiredError) return err.message;
  return 'Cannot reach the server. Check your connection and try again.';
}

/**
 * DUAL-MODE WRITE PATTERN (plan Task 2 — the template for Tasks 3-5).
 *
 * Each write-through action defines ONE `apply` function holding the store
 * mutation (the `set()` body + audit hooks), then forks:
 *   demo:   build the entity locally (the pre-server code, byte-equivalent)
 *           and apply it synchronously;
 *   server: call the API first and feed the SERVER entity through the same
 *           apply — server-assigned ids/versions/timestamps/stamps win.
 *
 * The declared action type keeps the demo (synchronous) shape: every product
 * call site goes through src/lib/api.ts, whose async wrappers `await` the
 * result — a no-op for the plain demo value, an unwrap for the server
 * promise — while demo-mode tests keep consuming the synchronous return.
 * This cast is the single place that promise/value duality lives; do not
 * consume a write action's return synchronously in server mode.
 */
function dual<T>(demo: () => T, server: () => Promise<T>): T {
  return (serverMode() ? server() : demo()) as T;
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      currentUser: seedUser,
      setRole: (role) => set((s) => ({ currentUser: { ...s.currentUser, role } })),
      isAuthenticated: false,
      login: async (email, password) => {
        const normalized = email.trim().toLowerCase();
        if (!serverMode()) {
          const demo = DEMO_ACCOUNTS.find((a) => a.email.toLowerCase() === normalized);
          if (demo) {
            if (password !== DEMO_PASSWORD) return { ok: false, error: 'Incorrect password.' };
            set({ currentUser: demo, isAuthenticated: true });
            return { ok: true };
          }
          const registered = get().registeredAccounts.find((a) => a.email.toLowerCase() === normalized);
          if (!registered) return { ok: false, error: 'No account found for that email.' };
          if (password !== registered.password) return { ok: false, error: 'Incorrect password.' };
          const { password: _pw, ...user } = registered;
          set({ currentUser: user, isAuthenticated: true });
          return { ok: true };
        }
        try {
          const { user } = await authApi.login(normalized, password);
          set({ currentUser: serverUserToUser(user), isAuthenticated: true });
          await get().hydrateFromServer();
          return { ok: true };
        } catch (err) {
          return { ok: false, error: authErrorMessage(err) };
        }
      },
      logout: () => {
        // Server mode: revoke the refresh token best-effort (session cleared inside).
        if (serverMode()) authApi.logout().catch(() => {});
        set({ isAuthenticated: false, server_loaded: false });
      },
      registeredAccounts: [],
      register: async ({ name, email, role, password }) => {
        const normalized = email.trim().toLowerCase();
        if (!serverMode()) {
          const taken = DEMO_ACCOUNTS.some((a) => a.email.toLowerCase() === normalized)
            || get().registeredAccounts.some((a) => a.email.toLowerCase() === normalized);
          if (taken) return { ok: false, error: 'An account with that email already exists.' };
          const user: User = { id: uid('usr'), email: normalized, name: name.trim(), role, created_at: new Date().toISOString() };
          set((s) => ({ registeredAccounts: [...s.registeredAccounts, { ...user, password }], currentUser: user, isAuthenticated: true }));
          return { ok: true };
        }
        // The server 400s admin self-registration; the form hides it in server mode.
        if (role === 'admin') return { ok: false, error: 'Admin accounts cannot be self-registered.' };
        try {
          const { user } = await authApi.register({ name: name.trim(), email: normalized, role, password });
          set({ currentUser: serverUserToUser(user), isAuthenticated: true });
          await get().hydrateFromServer();
          return { ok: true };
        } catch (err) {
          return { ok: false, error: authErrorMessage(err) };
        }
      },
      // Server mode: bulk-GET everything the SPA reads from the store. Each
      // hydrated slice is replaced WHOLESALE — the server is the source of
      // truth. Comments stay local (no bulk endpoint; threads hydrate with
      // their PDD/verification detail responses in later tasks).
      hydrateFromServer: async () => {
        const failed: string[] = [];

        // Projects come first — monitoring and evidence are per-project
        // sub-resources, so their fetches need the project ids.
        let projects: Project[] | null = null;
        try {
          projects = await projectsApi.list();
          set({ projects });
        } catch {
          failed.push('projects');
        }

        const slices: Array<[string, Promise<void>]> = [
          ['factors', factorsApi.list().then((factors) => set({ factors }))],
          [
            'methodologies',
            (async () => {
              // List rows are summaries; /export returns the full document
              // with its id stripped — re-attach the id from the list row.
              const rows = await methodologiesApi.list();
              const methodologies = await Promise.all(
                rows.map(async (row): Promise<Methodology> => ({
                  ...(await methodologiesApi.exportDoc(row.id)),
                  id: row.id,
                })),
              );
              set({ methodologies });
            })(),
          ],
          [
            'pdds',
            (async () => {
              // GET /pdds without ?state= is the validation queue (in-flight
              // only) — draft/registered/rejected are fetched explicitly so
              // the slice is complete.
              const [inflight, drafts, registered, rejected] = await Promise.all([
                pddsApi.list(), pddsApi.list('draft'), pddsApi.list('registered'), pddsApi.list('rejected'),
              ]);
              set({ pdds: [...inflight, ...drafts, ...registered, ...rejected] });
            })(),
          ],
          ['verifications', verificationsApi.list().then((verifications) => set({ verifications }))],
          ['credentials', credentialsApi.list().then((credentials) => set({ credentials }))],
          ['tokens', tokensApi.list().then((tokens) => set({ tokens }))],
          ['recIssues', recIssuesApi.list().then((recIssues) => set({ recIssues }))],
        ];
        // REC ROI endpoints 403 for the verifier role — skip them there, and drop
        // any commercial values persisted from an earlier non-verifier session.
        if (get().currentUser.role !== 'verifier') {
          slices.push(
            ['recRoiSettings', recRoiApi.getSettings().then((recRoiSettings) => set({ recRoiSettings }))],
            ['recRoiProjectSettings', recRoiApi.listProjectSettings().then((recRoiProjectSettings) => set({ recRoiProjectSettings }))],
          );
        } else {
          set({ recRoiSettings: EMPTY_REC_ROI_SETTINGS, recRoiProjectSettings: [] });
        }
        if (projects) {
          const ids = projects.map((p) => p.id);
          slices.push(
            ['records', Promise.all(ids.map((id) => monitoringApi.list(id)))
              .then((lists) => set({ records: lists.flat() }))],
            ['evidence', Promise.all(ids.map((id) => evidenceApi.listByProject(id)))
              .then((lists) => set({ evidence: lists.flat() }))],
          );
        } else {
          // Without the project list the per-project slices cannot be fetched.
          failed.push('records', 'evidence');
        }

        const settled = await Promise.allSettled(slices.map(([, task]) => task));
        settled.forEach((result, i) => {
          if (result.status === 'rejected') failed.push(slices[i][0]);
        });
        // Partial hydration is allowed: successful slices are already applied;
        // failed slice names are kept for later UI wiring (toast/banner).
        set({ hydration_errors: failed, server_loaded: true });
      },
      refreshFromServer: async () => {
        // Volatile slices only — reference data (methodologies, factors) and
        // per-project heavy fetches (records, evidence) stay on the login
        // hydration; this runs every few seconds so it must stay cheap.
        const tasks: Array<Promise<void>> = [
          projectsApi.list().then((projects) => set({ projects })),
          (async () => {
            const [inflight, drafts, registered, rejected] = await Promise.all([
              pddsApi.list(), pddsApi.list('draft'), pddsApi.list('registered'), pddsApi.list('rejected'),
            ]);
            set({ pdds: [...inflight, ...drafts, ...registered, ...rejected] });
          })(),
          verificationsApi.list().then((verifications) => set({ verifications })),
          credentialsApi.list().then((credentials) => set({ credentials })),
          tokensApi.list().then((tokens) => set({ tokens })),
          recIssuesApi.list().then((recIssues) => set({ recIssues })),
        ];
        await Promise.allSettled(tasks); // best-effort — a flaky poll never throws
      },
      hydration_errors: [],
      server_loaded: false,
      organization: seedOrg,
      // App boots with only the imported real solar fleet. Emission factors and the
      // methodology library are kept as reference data; everything else is empty.
      projects: seedProjects,
      records: seedRecords,
      factors: seedFactors,
      calculations: [],
      audit: seedAudit,
      evidence: seedEvidence,
      verifications: seedVerifications,
      comments: seedComments,
      credentials: seedCredentials,
      tokens: [],
      guardianConfig: DEFAULT_GUARDIAN_CONFIG,
      methodologies: seedMethodologies,
      pdds: seedPdds,
      recIssues: seedRecIssues,
      recRoiSettings: EMPTY_REC_ROI_SETTINGS,
      recRoiProjectSettings: [],

      audit_write: (action, entity_type, entity_id, payload = {}, extra = {}) => {
        // Server mode: no-op — the server writes the hash-chained audit row
        // inside the same transaction as each mutation (it owns the chain; a
        // client-side row would fork it). The AuditLog page reads GET /audit
        // in plan Task 4.
        if (serverMode()) return;
        set((s) => ({
          audit: [
            newAudit(
              s.currentUser.id, action, entity_type, entity_id, payload,
              { user_role: s.currentUser.role, ip_address: CALLER_IP, ...extra },
              s.audit[0]?.row_hash ?? null
            ),
            ...s.audit,
          ],
        }));
      },

      createProject: (input) => {
        const apply = (p: Project): Project => {
          set((s) => ({ projects: [p, ...s.projects] }));
          get().audit_write('PROJECT_CREATED', 'project', p.id, { name: p.name }, { new_value: { name: p.name } });
          return p;
        };
        return dual(
          () => {
            const now = new Date().toISOString();
            return apply({ id: uid('prj'), organization_id: get().organization.id, lifecycle_stage: 'unregistered', created_at: now, updated_at: now, ...input });
          },
          () => projectsApi.create(input).then(apply),
        );
      },

      updateProject: (id, patch) => {
        const apply = (updated: Project): Project => {
          let before: Project | undefined;
          set((s) => ({
            projects: s.projects.map((p) => {
              if (p.id !== id) return p;
              before = p;
              return updated;
            }),
          }));
          if (before) get().audit_write('PROJECT_UPDATED', 'project', id, { changes: patch }, { previous_value: { ...before }, new_value: { ...updated } });
          return updated;
        };
        return dual<Project | undefined>(
          () => {
            const current = get().projects.find((p) => p.id === id);
            if (!current) return undefined;
            return apply({ ...current, ...patch, updated_at: new Date().toISOString() });
          },
          // The server 404s an unknown id (ApiError) instead of resolving undefined.
          () => projectsApi.update(id, patch).then(apply),
        );
      },

      addMonitoringRecords: (project_id, rows) =>
        dual(
          () => {
            const uploaded_at = new Date().toISOString();
            // Stamp each record with the project's methodology driver param + unit
            // (resolved via its PDD) — but only once the PDD is registered: a draft
            // PDD's methodology can still change, and a stale param_key would silently
            // exclude records from calc totals. Unregistered projects stay unstamped (legacy shape).
            const pdd = get().pddByProject(project_id);
            const m = pdd?.state === 'registered' ? get().methodologies.find((x) => x.id === pdd.methodology_id) : undefined;
            const stamp = m ? { param_key: m.calculation.input_param, unit: m.calculation.input_unit } : {};
            const recs: MonitoringRecord[] = rows.map((r) => ({
              id: uid('mon'), project_id, source: 'csv_upload', uploaded_at, ...stamp, ...r,
            }));
            set((s) => ({ records: [...s.records, ...recs] }));
            return recs.length;
          },
          // Server path: the POST stamps param_key/unit server-side but returns
          // only { accepted } — re-fetch so the SERVER rows (server ids +
          // stamps) replace this project's slice, never locally-built ones.
          async () => {
            const { accepted } = await monitoringApi.addRows(project_id, rows);
            const records = await monitoringApi.list(project_id);
            set((s) => ({ records: [...s.records.filter((r) => r.project_id !== project_id), ...records] }));
            return accepted;
          },
        ),

      addEmissionFactor: (input) => {
        const apply = (ef: EmissionFactor): EmissionFactor => {
          set((s) => ({
            factors: [
              ef,
              ...s.factors.map((f) =>
                f.country === ef.country && f.source === ef.source ? { ...f, is_current: false } : f
              ),
            ],
          }));
          get().audit_write('EMISSION_FACTOR_ADDED', 'factor', ef.id, { country: ef.country, source: ef.source, version: ef.version }, { new_value: { factor_kgco2e_per_kwh: ef.factor_kgco2e_per_kwh, version: ef.version } });
          return ef;
        };
        return dual(
          () => {
            const existing = get().factors.filter((f) => f.country === input.country && f.source === input.source);
            const nextVersion = existing.reduce((m, f) => Math.max(m, f.version), 0) + 1;
            return apply({
              id: uid('ef'), version: nextVersion, is_current: true,
              created_at: new Date().toISOString(), ...input,
            });
          },
          // Server assigns id/version/is_current; local older versions of the
          // same country+source are flipped is_current:false by the same apply.
          () => factorsApi.create(input).then(apply),
        );
      },

      recordCalculation: (project_id, emission_factor_id, totals) => {
        get().audit_write('CALCULATION_EXECUTED', 'calculation', project_id, { emission_factor_id, ...totals });
      },

      // ---------------- Sprint 2: Evidence ----------------
      uploadEvidence: (project_id, input) => {
        const ev: EvidenceFile = {
          id: uid('ev'), project_id, parent_id: null,
          category: input.category, file_name: input.file_name, kind: input.kind,
          file_size: input.file_size, version_number: 1, status: 'active',
          description: input.description,
          // Prefer a real SHA-256 of the file bytes (computed in the UI); fall
          // back to a metadata hash when no byte digest was supplied.
          content_hash: input.content_hash ?? shortHash(input.file_name + input.file_size),
          uploaded_by: get().currentUser.id, uploaded_by_name: get().currentUser.name,
          uploaded_at: new Date().toISOString(),
        };
        set((s) => ({ evidence: [ev, ...s.evidence] }));
        get().audit_write('EVIDENCE_UPLOADED', 'evidence', ev.id, { file_name: ev.file_name, category: ev.category }, { new_value: { version_number: 1, file_size: ev.file_size } });
        return ev;
      },
      ingestEvidence: (file) => {
        set((s) => ({ evidence: [file, ...s.evidence.filter((e) => e.id !== file.id)] }));
      },

      replaceEvidence: (evidence_id, input) => {
        const prev = get().evidence.find((e) => e.id === evidence_id && e.status === 'active');
        if (!prev) return undefined;
        const apply = (next: EvidenceFile) => {
          set((s) => ({
            evidence: [next, ...s.evidence
              .filter((e) => e.id !== next.id)
              .map((e) => (e.id === prev.id ? { ...e, status: 'superseded' as const } : e))],
          }));
          get().audit_write('EVIDENCE_REPLACED', 'evidence', next.id, { file_name: next.file_name },
            { previous_value: { version_number: prev.version_number, content_hash: prev.content_hash }, new_value: { version_number: next.version_number, content_hash: next.content_hash } });
          return next;
        };
        return dual<EvidenceFile | undefined>(
          () => apply({
            ...prev, id: uid('ev'), parent_id: prev.id,
            file_name: input.file_name ?? prev.file_name, file_size: input.file_size,
            version_number: prev.version_number + 1, status: 'active',
            content_hash: input.content_hash ?? shortHash((input.file_name ?? prev.file_name) + input.file_size + Date.now()),
            uploaded_by: get().currentUser.id, uploaded_by_name: get().currentUser.name,
            uploaded_at: new Date().toISOString(),
          }),
          async () => {
            // The server stores the bytes — a metadata-only version would exist nowhere but this tab.
            if (!input.file) throw new Error('Replacing evidence needs the new file.');
            return apply(await evidenceApi.replace(evidence_id, input.file, { client_hash: input.content_hash }));
          },
        );
      },

      archiveEvidence: (evidence_id) =>
        dual(
          () => {
            set((s) => ({ evidence: s.evidence.map((e) => (e.id === evidence_id ? { ...e, status: 'archived' as const } : e)) }));
            get().audit_write('EVIDENCE_ARCHIVED', 'evidence', evidence_id, {}, { new_value: { status: 'archived' } });
          },
          async () => {
            const row = await evidenceApi.archive(evidence_id);
            set((s) => ({ evidence: s.evidence.map((e) => (e.id === row.id ? row : e)) }));
          },
        ),

      // ---------------- Sprint 2: Verification ----------------
      createVerification: (input) => {
        const u = get().currentUser;
        const v: VerificationRequest = {
          id: uid('VR'), project_id: input.project_id, created_by: u.id, owner_name: u.name,
          assigned_verifier_name: 'Daniel Okoye', state: 'draft',
          monitoring_period_start: input.monitoring_period_start,
          monitoring_period_end: input.monitoring_period_end,
          reduction_kgco2e: input.reduction_kgco2e, factors_snapshot: input.factors_snapshot,
          evidence_ids: input.evidence_ids,
          required_categories: ['meter_reading', 'utility_bill'],
          submitted_at: null, locked_at: null, sla_target_days: 14,
          hash_value: null, credential_id: null, anchored_at: null,
          hcs_topic_id: null, hcs_sequence_number: null,
        };
        set((s) => ({ verifications: [v, ...s.verifications] }));
        return v;
      },

      submitVerification: (id) => {
        set((s) => ({ verifications: s.verifications.map((v) => (v.id === id ? { ...v, state: 'submitted', submitted_at: v.submitted_at ?? new Date().toISOString() } : v)) }));
        get().audit_write('VERIFICATION_SUBMITTED', 'verification', id, {}, { previous_value: { state: 'draft' }, new_value: { state: 'submitted' } });
      },

      startReview: (id) => {
        set((s) => ({ verifications: s.verifications.map((v) => (v.id === id ? { ...v, state: 'under_review' } : v)) }));
        get().audit_write('REVIEW_STARTED', 'verification', id, {}, { previous_value: { state: 'submitted' }, new_value: { state: 'under_review' } });
      },

      requestRevision: (id, summary) => {
        set((s) => ({ verifications: s.verifications.map((v) => (v.id === id ? { ...v, state: 'revision_required' } : v)) }));
        get().audit_write('REVISION_REQUESTED', 'verification', id, { summary }, { previous_value: { state: 'under_review' }, new_value: { state: 'revision_required', summary } });
      },

      approveVerification: (id, note) => {
        const v = get().verifications.find((x) => x.id === id);
        if (!v) return;
        const locked_at = new Date().toISOString();
        const hash_value = shortHash(`${v.id}|${v.project_id}|${v.reduction_kgco2e}|${v.evidence_ids.join(',')}|${locked_at}`);
        set((s) => ({ verifications: s.verifications.map((x) => (x.id === id ? { ...x, state: 'approved', locked_at, hash_value } : x)) }));
        get().audit_write('VERIFICATION_APPROVED', 'verification', id,
          { reduction_tco2e: v.reduction_kgco2e / 1000, note: note ?? null },
          { previous_value: { state: v.state }, new_value: { state: 'approved', hash_value, locked_at } });
      },

      rejectVerification: (id, reason) => {
        const v = get().verifications.find((x) => x.id === id);
        set((s) => ({ verifications: s.verifications.map((x) => (x.id === id ? { ...x, state: 'rejected', rejection_reason: reason } : x)) }));
        get().audit_write('VERIFICATION_REJECTED', 'verification', id, { reason }, { previous_value: { state: v?.state ?? null }, new_value: { state: 'rejected', reason } });
      },

      addComment: (verification_id, body, evidence) => {
        const u = get().currentUser;
        const c: VerificationComment = {
          id: uid('cmt'), verification_id, evidence_id: evidence?.id ?? null, evidence_name: evidence?.name,
          author_id: u.id, author_name: u.name, author_role: u.role, body, created_at: new Date().toISOString(),
        };
        set((s) => ({ comments: [...s.comments, c] }));
        get().audit_write('COMMENT_ADDED', 'verification', verification_id, evidence ? { evidence: evidence.name } : {}, { new_value: { body } });
      },

      // ---------------- Sprint 3: Guardian anchoring (simulated) ----------------
      anchorVerification: (id) => {
        const v = get().verifications.find((x) => x.id === id);
        if (!v || v.state !== 'approved' || v.credential_id || !v.hash_value) return;
        const issuedAt = new Date().toISOString();
        const topic_id = projectTopicId(v.project_id);
        const sequenceNumber = get().credentials.filter((c) => c.hcs.topic_id === topic_id).length + 1;
        const subject = buildApprovalSubject(v, get().evidence);
        const issuer = issuerIdentity(get().organization.id);
        const vc = issueCredential(subject, v.hash_value, sequenceNumber, { ...get().guardianConfig, topic_id }, MRV_APPROVAL_SCHEMA_V1, issuedAt, issuer);
        set((s) => ({
          credentials: [vc, ...s.credentials],
          verifications: s.verifications.map((x) =>
            x.id === id
              ? { ...x, credential_id: vc.id, anchored_at: issuedAt, hcs_topic_id: vc.hcs.topic_id, hcs_sequence_number: vc.hcs.sequence_number }
              : x),
        }));
        get().audit_write('VERIFICATION_ANCHORED', 'verification', id,
          { credential_id: vc.id, topic_id: vc.hcs.topic_id, sequence_number: vc.hcs.sequence_number },
          { previous_value: { anchored: false }, new_value: { credential_id: vc.id, hcs_topic_id: vc.hcs.topic_id, hcs_sequence_number: vc.hcs.sequence_number } });
      },

      mintToken: (credential_id) => {
        const state = get();
        // Only the Standard Registry mints, and only once per anchored credential.
        if (state.currentUser.role !== 'admin') return null;
        const credential = state.credentials.find((c) => c.id === credential_id);
        if (!credential) return null;
        if (state.tokens.some((t) => t.credential_id === credential_id)) return null;

        const mintedAt = new Date().toISOString();
        const serialNumber = state.tokens.length + 1;
        const token = mintGuardianToken(credential, serialNumber, state.currentUser.role, state.guardianConfig, mintedAt);
        set((s) => ({ tokens: [token, ...s.tokens] }));
        get().audit_write('TOKEN_MINTED', 'token', token.id,
          { token_id: token.token_id, serial_number: token.serial_number, amount_tco2e: token.amount_tco2e, credential_id },
          { new_value: { serial_number: token.serial_number, amount_tco2e: token.amount_tco2e } });
        return token;
      },

      // ---------------- SF-04: REC issuance (I-REC(E) Issue Requests) ----------------
      // Parallel to the Sprint 2 verification workflow above; never entangled with it.
      createRecIssue: (input) => {
        const s = get();
        const total = recMwhForPeriod(s.records, input.project_id, input.period_start, input.period_end);
        const pdd = s.pdds.find((p) => p.project_id === input.project_id && p.state === 'registered'
          && s.methodologies.find((m) => m.id === p.methodology_id)?.standard === 'REC');
        const sd = (pdd?.section_data ?? {}) as Record<string, unknown>;
        const str = (k: string) => (typeof sd[k] === 'string' ? (sd[k] as string) : '');
        const u = s.currentUser;
        const entity: RecIssueRequest = {
          id: uid('RIR'), project_id: input.project_id, created_by: u.id, owner_name: u.name,
          assigned_reviewer_name: 'EGAT (Local Issuer)', state: 'draft',
          request_type: input.request_type,
          period_start: input.period_start, period_end: input.period_end,
          total_production_mwh: total, applied_mwh: input.applied_mwh ?? null,
          facility_snapshot: {
            evident_org_id: str('evident_org_id'), organisation_name: str('organisation_name'),
            facility_name: str('facility_name'), fuel_code: str('fuel_code'),
            fuel_description: str('fuel_description'), technology_code: str('technology_code'),
            technology_description: str('technology_description'),
          },
          receiving_org_name: input.receiving_org_name ?? '',
          receiving_account_id: input.receiving_account_id ?? '',
          facility_id: input.facility_id ?? '',
          requested_labels: input.requested_labels ?? '',
          evidence_ids: input.evidence_ids ?? [], submitted_at: null, issued_at: null, rejection_reason: null,
        };
        set((st) => ({ recIssues: [entity, ...st.recIssues] }));
        get().audit_write('REC_ISSUE_CREATED', 'rec_issue', entity.id,
          { total_production_mwh: total }, { new_value: { state: 'draft', total_production_mwh: total } });
        return entity;
      },

      updateRecIssue: (id, patch) => {
        const s = get();
        const row = s.recIssues.find((r) => r.id === id);
        if (!row || row.state !== 'draft') return undefined;
        // Drop explicitly-undefined keys so `{ period_start: undefined }`
        // can neither blank a field nor skip the MWh recompute below.
        const clean = Object.fromEntries(
          Object.entries(patch).filter(([, v]) => v !== undefined),
        ) as RecIssueDraftPatch;
        const next: RecIssueRequest = { ...row, ...clean };
        if (clean.period_start !== undefined || clean.period_end !== undefined) {
          next.total_production_mwh = recMwhForPeriod(s.records, next.project_id, next.period_start, next.period_end);
        }
        set((st) => ({ recIssues: st.recIssues.map((r) => (r.id === id ? next : r)) }));
        // Quiet (no audit) — mirrors the server: the trail begins at submit,
        // not at every draft edit.
        return next;
      },

      submitRecIssue: (id) => {
        // Only a draft may be submitted — mirrors the server's
        // illegalTransition guard so an issued/rejected row can never be
        // flipped back to submitted from the demo UI.
        const row = get().recIssues.find((r) => r.id === id);
        if (!row || row.state !== 'draft') return false;
        set((s) => ({
          recIssues: s.recIssues.map((r) => (r.id === id
            ? { ...r, state: 'submitted', submitted_at: r.submitted_at ?? new Date().toISOString() }
            : r)),
        }));
        get().audit_write('REC_ISSUE_SUBMITTED', 'rec_issue', id, {},
          { previous_value: { state: 'draft' }, new_value: { state: 'submitted' } });
        return true;
      },

      approveRecIssue: (id) => {
        const r = get().recIssues.find((x) => x.id === id);
        const issued_at = new Date().toISOString();
        set((s) => ({ recIssues: s.recIssues.map((x) => (x.id === id ? { ...x, state: 'issued', issued_at } : x)) }));
        get().audit_write('REC_ISSUE_ISSUED', 'rec_issue', id,
          { mwh: r?.applied_mwh ?? r?.total_production_mwh ?? null },
          { previous_value: { state: r?.state ?? null }, new_value: { state: 'issued', issued_at } });
      },

      rejectRecIssue: (id, reason) => {
        const r = get().recIssues.find((x) => x.id === id);
        set((s) => ({ recIssues: s.recIssues.map((x) => (x.id === id ? { ...x, state: 'rejected', rejection_reason: reason } : x)) }));
        get().audit_write('REC_ISSUE_REJECTED', 'rec_issue', id, { reason },
          { previous_value: { state: r?.state ?? null }, new_value: { state: 'rejected', reason } });
      },

      deleteRecIssue: (id) => {
        set((s) => ({ recIssues: s.recIssues.filter((r) => r.id !== id) }));
        get().audit_write('REC_ISSUE_DELETED', 'rec_issue', id, {}, { previous_value: { state: 'draft' } });
      },

      applyServerRecIssue: (recIssue) => {
        set((s) => ({
          recIssues: s.recIssues.some((r) => r.id === recIssue.id)
            ? s.recIssues.map((r) => (r.id === recIssue.id ? { ...r, ...recIssue } : r))
            : [recIssue, ...s.recIssues],
        }));
      },

      saveRecRoiSettings: (input) => {
        const previous = get().recRoiSettings;
        const next: RecRoiSettings = { ...input, updated_by: get().currentUser.name, updated_at: new Date().toISOString() };
        set({ recRoiSettings: next });
        get().audit_write('REC_ROI_SETTINGS_UPDATED', 'rec_roi', get().organization.id,
          { horizon_years: input.horizon_years },
          { previous_value: previous.updated_at === null ? null : { ...previous }, new_value: { ...next } });
      },

      saveRecRoiProjectSetting: (project_id, input) => {
        const previous = get().recRoiProjectSettings.find((r) => r.project_id === project_id) ?? null;
        const next: RecRoiProjectSetting = {
          project_id, ...input, updated_by: get().currentUser.name, updated_at: new Date().toISOString(),
        };
        set((s) => ({
          recRoiProjectSettings: previous
            ? s.recRoiProjectSettings.map((r) => (r.project_id === project_id ? next : r))
            : [...s.recRoiProjectSettings, next],
        }));
        get().audit_write('REC_ROI_PROJECT_UPDATED', 'rec_roi', project_id,
          { issuance_type: input.issuance_type },
          { previous_value: previous ? { ...previous } : null, new_value: { ...next } });
      },

      // ---------------- Methodology-as-data: JSON import ----------------
      importMethodology: (json) => {
        // Only the Standard Registry curates the methodology library.
        if (get().currentUser.role !== 'admin') {
          return { ok: false, error: 'Only the Standard Registry can import methodologies.' };
        }
        type ImportResult = { ok: boolean; error?: string; methodology?: Methodology };
        return dual<ImportResult>(
          () => {
            const parsed = parseMethodologyJson(json);
            if (!parsed.ok) {
              // Cap the message at the first few issues — a malformed document can carry dozens.
              const shown = parsed.errors.slice(0, 3);
              const extra = parsed.errors.length - shown.length;
              return { ok: false, error: shown.join('; ') + (extra > 0 ? ` … and ${extra} more issue(s)` : '') };
            }
            const doc = parsed.methodology;
            if (get().methodologies.some((x) => x.code === doc.code && x.version === doc.version)) {
              return { ok: false, error: `Methodology ${doc.code} ${doc.version} is already in the library.` };
            }
            const m: Methodology = { id: uid('mth'), ...doc };
            set((s) => ({ methodologies: [...s.methodologies, m] }));
            get().audit_write('METHODOLOGY_IMPORTED', 'methodology', m.id,
              { code: m.code, version: m.version },
              { new_value: { code: m.code, version: m.version } });
            return { ok: true, methodology: m };
          },
          // Server mode: the server validates (same parser, same error format),
          // rejects duplicates and audits; the stored document is read back so
          // the library holds exactly what the server keeps.
          async () => {
            let id: string;
            try {
              ({ id } = await methodologiesApi.import(json));
            } catch (err) {
              return { ok: false, error: err instanceof Error ? err.message : String(err) };
            }
            // Imported — from here on the answer is ok, or a retry would 409.
            // If the read-back fails, the server stored exactly what the shared
            // parser makes of this file, so parse it here under the server id.
            const doc = await methodologiesApi.exportDoc(id).catch(() => {
              const parsed = parseMethodologyJson(json);
              return parsed.ok ? parsed.methodology : null;
            });
            if (!doc) return { ok: false, error: 'Imported on the server, but it could not be loaded here — reload the page to see it.' };
            const m: Methodology = { ...doc, id };
            set((s) => ({ methodologies: [...s.methodologies.filter((x) => x.id !== id), m] }));
            return { ok: true, methodology: m };
          },
        );
      },

      // ---------------- Registration: Gate 1 (PDD validation) ----------------
      pddByProject: (project_id) => get().pdds.find((p) => p.project_id === project_id),

      // In-flight PDDs needing validator attention (includes revision_required).
      validationQueue: () =>
        get().pdds.filter((p) => p.state !== 'draft' && p.state !== 'registered' && p.state !== 'rejected'),

      selectMethodology: (project_id, methodology_id) => {
        const existing = get().pdds.find((p) => p.project_id === project_id);
        if (existing) {
          const editable = existing.state === 'draft' || existing.state === 'revision_required';
          if (editable && existing.methodology_id !== methodology_id) {
            set((s) => ({ pdds: s.pdds.map((p) => (p.id === existing.id ? { ...p, methodology_id } : p)) }));
            get().audit_write('METHODOLOGY_SELECTED', 'pdd', existing.id, { project_id, methodology_id },
              { previous_value: { methodology_id: existing.methodology_id }, new_value: { methodology_id } });
          }
          return get().pdds.find((p) => p.id === existing.id)!;
        }
        const pdd: ProjectDesignDocument = {
          id: uid('PDD'), project_id, methodology_id,
          methodology_snapshot: '', state: 'draft', section_data: {}, evidence_ids: [],
          assigned_validator_name: 'Daniel Okoye', // seeded reviewer; reassignment out of scope
          submitted_at: null, validated_at: null, content_hash: null,
          ipfs_cid: null, credential_id: null,
        };
        set((s) => ({
          pdds: [pdd, ...s.pdds],
          projects: s.projects.map((p) => (p.id === project_id ? { ...p, lifecycle_stage: 'pdd_draft' as const } : p)),
        }));
        get().audit_write('METHODOLOGY_SELECTED', 'pdd', pdd.id, { project_id, methodology_id },
          { new_value: { state: 'draft' } });
        return pdd;
      },

      // Draft autosave is intentionally NOT audited — high-frequency editing, not a
      // regulatory state change. The audit trail begins at submitPdd.
      savePddDraft: (pdd_id, section_data, evidence_ids) => {
        set((s) => ({ pdds: s.pdds.map((p) => (p.id === pdd_id ? { ...p, section_data, evidence_ids } : p)) }));
      },

      submitPdd: (pdd_id) => {
        const pdd = get().pdds.find((p) => p.id === pdd_id);
        if (!pdd) return;
        const m = get().methodologies.find((x) => x.id === pdd.methodology_id);
        const snapshot = m ? `${m.code} ${m.version}` : pdd.methodology_snapshot;
        set((s) => ({
          pdds: s.pdds.map((p) => (p.id === pdd_id
            ? { ...p, state: 'submitted', methodology_snapshot: snapshot, submitted_at: p.submitted_at ?? new Date().toISOString() }
            : p)),
          projects: s.projects.map((p) => (p.id === pdd.project_id ? { ...p, lifecycle_stage: 'under_validation' as const } : p)),
        }));
        get().audit_write('PDD_SUBMITTED', 'pdd', pdd_id, { methodology: snapshot },
          { previous_value: { state: pdd.state }, new_value: { state: 'submitted' } });
      },

      startValidation: (pdd_id) => {
        const pdd = get().pdds.find((p) => p.id === pdd_id);
        set((s) => ({ pdds: s.pdds.map((p) => (p.id === pdd_id ? { ...p, state: 'under_validation' } : p)) }));
        get().audit_write('VALIDATION_STARTED', 'pdd', pdd_id, {},
          { previous_value: { state: pdd?.state ?? 'submitted' }, new_value: { state: 'under_validation' } });
      },

      requestPddRevision: (pdd_id, summary) => {
        const pdd = get().pdds.find((p) => p.id === pdd_id);
        set((s) => ({
          pdds: s.pdds.map((p) => (p.id === pdd_id ? { ...p, state: 'revision_required', rejection_reason: summary } : p)),
          projects: pdd ? s.projects.map((p) => (p.id === pdd.project_id ? { ...p, lifecycle_stage: 'pdd_draft' as const } : p)) : s.projects,
        }));
        get().audit_write('PDD_REVISION_REQUESTED', 'pdd', pdd_id, { summary },
          { previous_value: { state: pdd?.state ?? 'under_validation' }, new_value: { state: 'revision_required', summary } });
      },

      registerProject: (pdd_id) => {
        const pdd = get().pdds.find((p) => p.id === pdd_id);
        if (!pdd) return false;
        const m = get().methodologies.find((x) => x.id === pdd.methodology_id);
        if (!m) return false;
        if (pdd.state !== 'under_validation') return false;
        const check = validatePdd(m, pdd.section_data);
        if (!check.ok) return false;
        const snapshot = pdd.methodology_snapshot || `${m.code} ${m.version}`;
        const content_hash = pddContentHash({ methodology_snapshot: snapshot, section_data: pdd.section_data, evidence_ids: pdd.evidence_ids });
        const validated_at = new Date().toISOString();
        // Guardian publish step: full PDD stays off-chain; the VC carries hash + CID.
        const ipfs_cid = toIpfsCid(content_hash);
        const frozen = { ...pdd, methodology_snapshot: snapshot, validated_at, content_hash };
        const topic_id = projectTopicId(pdd.project_id);
        const sequenceNumber = get().credentials.filter((c) => c.hcs.topic_id === topic_id).length + 1;
        // One private salt per sensitive published field, so value hashes are non-guessable.
        // Salts stay on the owner's PDD record; value + salt verify offline against the VC.
        const salts: Record<string, string> = {};
        for (const key of sensitiveFieldKeys(m, pdd.section_data)) salts[key] = randomSaltHex();
        const issuer = issuerIdentity(get().organization.id);
        const vc = issueCredential(
          buildPddSubject(frozen, get().evidence, ipfs_cid, splitDisclosure(m, pdd.section_data, salts)),
          content_hash, sequenceNumber, { ...get().guardianConfig, topic_id }, PDD_REGISTRATION_SCHEMA_V1, validated_at, issuer,
        );
        set((s) => ({
          pdds: s.pdds.map((p) => (p.id === pdd_id ? { ...p, state: 'registered', methodology_snapshot: snapshot, validated_at, content_hash, ipfs_cid, credential_id: vc.id, disclosure_salts: salts } : p)),
          projects: s.projects.map((p) => (p.id === pdd.project_id ? { ...p, lifecycle_stage: 'registered' as const } : p)),
          credentials: [vc, ...s.credentials],
        }));
        get().audit_write('PROJECT_REGISTERED', 'pdd', pdd_id,
          { methodology: snapshot, credential_id: vc.id, ipfs_cid, topic_id: vc.hcs.topic_id, sequence_number: vc.hcs.sequence_number },
          { previous_value: { state: pdd.state }, new_value: { state: 'registered', content_hash, ipfs_cid, credential_id: vc.id } });
        return true;
      },

      applyServerRegistration: (pdd, credential) => {
        set((s) => ({
          pdds: s.pdds.map((p) => (p.id === pdd.id ? { ...p, ...pdd } : p)),
          projects: s.projects.map((p) => (p.id === pdd.project_id ? { ...p, lifecycle_stage: 'registered' as const } : p)),
          credentials: [credential, ...s.credentials.filter((c) => c.id !== credential.id)],
        }));
        const hcs = credential.anchor ?? credential.hcs;
        get().audit_write('PROJECT_REGISTERED', 'pdd', pdd.id,
          { methodology: pdd.methodology_snapshot, credential_id: credential.id, ipfs_cid: pdd.ipfs_cid, topic_id: hcs.topic_id, sequence_number: hcs.sequence_number },
          { new_value: { state: 'registered', content_hash: pdd.content_hash, ipfs_cid: pdd.ipfs_cid, credential_id: credential.id } });
      },

      applyServerPdd: (pdd) => {
        const stage =
          pdd.state === 'registered' ? 'registered' :
          pdd.state === 'rejected' ? 'rejected' :
          pdd.state === 'draft' || pdd.state === 'revision_required' ? 'pdd_draft' :
          'under_validation';
        set((s) => ({
          pdds: s.pdds.some((p) => p.id === pdd.id)
            ? s.pdds.map((p) => (p.id === pdd.id ? { ...p, ...pdd } : p))
            : [pdd, ...s.pdds],
          projects: s.projects.map((p) => (p.id === pdd.project_id ? { ...p, lifecycle_stage: stage as Project['lifecycle_stage'] } : p)),
        }));
      },

      ingestComment: (comment) => {
        set((s) => ({ comments: [...s.comments.filter((c) => c.id !== comment.id), comment] }));
      },

      applyServerVerification: (verification) => {
        set((s) => ({
          verifications: s.verifications.some((v) => v.id === verification.id)
            ? s.verifications.map((v) => (v.id === verification.id ? { ...v, ...verification } : v))
            : [verification, ...s.verifications],
        }));
      },

      applyServerVerificationAnchor: (verification, credential) => {
        set((s) => ({
          verifications: s.verifications.map((v) => (v.id === verification.id ? { ...v, ...verification } : v)),
          credentials: [credential, ...s.credentials.filter((c) => c.id !== credential.id)],
        }));
        const hcs = credential.anchor ?? credential.hcs;
        get().audit_write('VERIFICATION_ANCHORED', 'verification', verification.id,
          { credential_id: credential.id, topic_id: hcs.topic_id, sequence_number: hcs.sequence_number },
          { previous_value: { anchored: false }, new_value: { credential_id: credential.id, hcs_topic_id: hcs.topic_id, hcs_sequence_number: hcs.sequence_number } });
      },

      applyServerMint: (token) => {
        set((s) => ({ tokens: [token, ...s.tokens.filter((t) => t.id !== token.id)] }));
        get().audit_write('TOKEN_MINTED', 'token', token.id,
          { token_id: token.token_id, serial_number: token.serial_number, amount_tco2e: token.amount_tco2e, credential_id: token.credential_id },
          { new_value: { serial_number: token.serial_number, amount_tco2e: token.amount_tco2e } });
      },

      rejectPdd: (pdd_id, reason) => {
        const pdd = get().pdds.find((p) => p.id === pdd_id);
        set((s) => ({
          pdds: s.pdds.map((p) => (p.id === pdd_id ? { ...p, state: 'rejected', rejection_reason: reason } : p)),
          projects: pdd ? s.projects.map((p) => (p.id === pdd.project_id ? { ...p, lifecycle_stage: 'rejected' as const } : p)) : s.projects,
        }));
        get().audit_write('PDD_REJECTED', 'pdd', pdd_id, { reason },
          { previous_value: { state: pdd?.state ?? null }, new_value: { state: 'rejected', reason } });
      },

      addPddComment: (pdd_id, body, section_key) => {
        const u = get().currentUser;
        const c: VerificationComment = {
          id: uid('cmt'), verification_id: pdd_id, evidence_id: null, section_key,
          author_id: u.id, author_name: u.name, author_role: u.role, body, created_at: new Date().toISOString(),
        };
        set((s) => ({ comments: [...s.comments, c] }));
        get().audit_write('COMMENT_ADDED', 'pdd', pdd_id, section_key ? { section: section_key } : {}, { new_value: { body } });
      },

      resetToSeed: () => set({
        projects: seedProjects, records: seedRecords, factors: seedFactors, calculations: [], audit: seedAudit,
        evidence: seedEvidence, verifications: seedVerifications, comments: seedComments,
        credentials: seedCredentials, tokens: [], guardianConfig: DEFAULT_GUARDIAN_CONFIG,
        methodologies: seedMethodologies, pdds: seedPdds, recIssues: seedRecIssues,
        recRoiSettings: EMPTY_REC_ROI_SETTINGS, recRoiProjectSettings: [],
      }),
    }),
    {
      name: 'carbon-ready-store-v18',
      // server_loaded describes this page load only — see AppState.
      partialize: ({ server_loaded: _loaded, ...persisted }) => persisted,
    }
  )
);

// Session-expiry seam: ONE registration at module init. Any server call whose
// token refresh is dead throws SessionExpiredError, and this callback flips
// the app to the login screen regardless of which call site hit it. Demo mode
// never issues server requests, so it stays inert there.
onSessionExpired(() => useStore.setState({ isAuthenticated: false, server_loaded: false }));
