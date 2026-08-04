import type {
  UserRole, Project, EmissionFactor, MonitoringRecord, Methodology, PddState,
  ProjectDesignDocument, VerificationRequest, VerificationState, EvidenceFile,
  VerifiableCredential, GuardianToken, VerificationComment,
} from '../types';
import type { DisclosureSplit } from './pdd';

/**
 * Typed fetch client for the Phase 1a backend (plan Task 1,
 * docs/superpowers/plans/2026-07-24-phase1b-spa-cutover.md).
 *
 * Server mode is opt-in via VITE_API_BASE_URL; without it the SPA stays in
 * demo mode and this module is never exercised at runtime. Env vars are read
 * lazily inside functions (not at module load) so vi.stubEnv works in tests.
 */

// ---------------------------------------------------------------------------
// Mode + session storage
// ---------------------------------------------------------------------------

/** True when the SPA should talk to the backend instead of localStorage. */
export function serverMode(): boolean {
  return Boolean(import.meta.env.VITE_API_BASE_URL);
}

/** `<base>/api/v1` — all routes live under the version prefix. */
function apiBase(): string {
  const base = String(import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '');
  return `${base}/api/v1`;
}

// CUSTODY: tokens live in localStorage, so any XSS can read them — same
// custody standard as identity.ts key material. Production posture: move the
// refresh token to an httpOnly cookie, or accept the risk behind a strict CSP.
export const SESSION_KEY = 'carbon-ready-session-v1';

export interface SessionTokens {
  access_token: string;
  refresh_token: string;
}

export function getSession(): SessionTokens | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SessionTokens>;
    if (typeof parsed.access_token !== 'string' || typeof parsed.refresh_token !== 'string') return null;
    return { access_token: parsed.access_token, refresh_token: parsed.refresh_token };
  } catch {
    return null;
  }
}

export function setSession(tokens: SessionTokens): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(tokens));
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY);
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** Non-2xx response — carries the server envelope `{error:{code,message}}`. */
export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** The refresh flow failed — the stored session is gone; user must sign in. */
export class SessionExpiredError extends Error {
  constructor() {
    super('Session expired — please sign in again.');
    this.name = 'SessionExpiredError';
  }
}

// ---------------------------------------------------------------------------
// Session-expiry seam
// ---------------------------------------------------------------------------

// Single registration: the store registers ONE callback at module init
// (src/store/index.ts) that flips the app to unauthenticated whenever the
// refresh flow is dead — no matter which call site hit it. A later
// registration replaces the earlier one.
let sessionExpiredCallback: (() => void) | null = null;

export function onSessionExpired(cb: () => void): void {
  sessionExpiredCallback = cb;
}

/** Terminal session failure: clear storage, notify the app, return the error to throw. */
function sessionExpired(): SessionExpiredError {
  clearSession();
  sessionExpiredCallback?.();
  return new SessionExpiredError();
}

// ---------------------------------------------------------------------------
// apiFetch — JSON + Bearer + single-retry refresh
// ---------------------------------------------------------------------------

export interface ApiFetchOptions {
  method?: string;
  body?: unknown;
  /** Attach the Bearer access token and run the 401→refresh→retry flow. Default true. */
  auth?: boolean;
}

function request(path: string, { method = 'GET', body, auth = true }: ApiFetchOptions): Promise<Response> {
  const headers: Record<string, string> = {};
  // FormData bodies set their own multipart content-type (with boundary).
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  if (body !== undefined && !isForm) headers['content-type'] = 'application/json';
  if (auth) {
    const session = getSession();
    if (session) headers.authorization = `Bearer ${session.access_token}`;
  }
  // Global fetch resolved at call time so vi.stubGlobal('fetch', …) works.
  return fetch(`${apiBase()}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
  });
}

async function toApiError(res: Response): Promise<ApiError> {
  try {
    const data: unknown = await res.json();
    if (data && typeof data === 'object' && 'error' in data) {
      const err = (data as { error: { code?: unknown; message?: unknown } }).error;
      if (err && typeof err === 'object' && typeof err.message === 'string') {
        return new ApiError(typeof err.code === 'string' ? err.code : 'UNKNOWN', err.message, res.status);
      }
    }
  } catch {
    // non-JSON body (proxy error page, empty body) — fall through
  }
  return new ApiError('UNKNOWN', `Request failed with status ${res.status}`, res.status);
}

// Deduplicate concurrent refreshes: the server rotates the pair on every use,
// so two parallel refresh calls would trip its reuse detection and revoke the
// whole session. All concurrent 401s share one in-flight rotation.
let refreshInFlight: Promise<boolean> | null = null;

async function refreshOnce(): Promise<boolean> {
  const session = getSession();
  if (!session) return false;
  try {
    const res = await request('/auth/refresh', {
      method: 'POST',
      body: { refresh_token: session.refresh_token },
      auth: false,
    });
    if (!res.ok) return false;
    const rotated = (await res.json()) as SessionTokens;
    setSession(rotated);
    return true;
  } catch {
    return false; // network failure during refresh → treat as expired
  }
}

function tryRefresh(): Promise<boolean> {
  refreshInFlight ??= refreshOnce().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

/**
 * JSON request against the API. On 401 (auth requests only) it refreshes the
 * token pair once and retries the original request a single time; a failed
 * refresh clears the session and throws SessionExpiredError. Other non-2xx
 * responses throw ApiError with the server's error envelope.
 */
export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const auth = options.auth ?? true;
  let res = await request(path, options);

  if (res.status === 401 && auth) {
    const refreshed = await tryRefresh();
    if (!refreshed) throw sessionExpired();
    res = await request(path, options); // single retry — never loops
  }

  if (!res.ok) throw await toApiError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// ---------------------------------------------------------------------------
// Auth endpoints
// ---------------------------------------------------------------------------

/** User shape as serialized by the server (users/service.ts serializeUser). */
export interface ServerUser {
  id: string;
  organization_id: string;
  email: string;
  name: string;
  role: UserRole;
  created_at: string;
}

export interface AuthPayload extends SessionTokens {
  user: ServerUser;
}

export interface RegisterInput {
  name: string;
  email: string;
  /** The server rejects 'admin' self-registration (400). */
  role: Exclude<UserRole, 'admin'>;
  password: string;
}

export const authApi = {
  /** POST /auth/register → persists the returned token pair. */
  async register(input: RegisterInput): Promise<AuthPayload> {
    const payload = await apiFetch<AuthPayload>('/auth/register', { method: 'POST', body: input, auth: false });
    setSession({ access_token: payload.access_token, refresh_token: payload.refresh_token });
    return payload;
  },

  /** POST /auth/login → persists the returned token pair. */
  async login(email: string, password: string): Promise<AuthPayload> {
    const payload = await apiFetch<AuthPayload>('/auth/login', { method: 'POST', body: { email, password }, auth: false });
    setSession({ access_token: payload.access_token, refresh_token: payload.refresh_token });
    return payload;
  },

  /** Explicit rotation of the stored pair; failure ends the session. */
  async refresh(): Promise<SessionTokens> {
    const refreshed = await tryRefresh();
    const session = getSession();
    if (!refreshed || !session) throw sessionExpired();
    return session;
  },

  /**
   * POST /auth/logout (best effort). The session is captured and cleared
   * synchronously BEFORE the revoke request, so a quick re-login can never be
   * clobbered by this call's completion racing in later.
   */
  async logout(): Promise<void> {
    const session = getSession();
    clearSession();
    if (!session) return;
    await fetch(`${apiBase()}/auth/logout`, {
      method: 'POST',
      headers: { authorization: `Bearer ${session.access_token}` },
    });
  },

  /** GET /users/me — current user profile (server wraps it as {user}). */
  async me(): Promise<ServerUser> {
    const { user } = await apiFetch<{ user: ServerUser }>('/users/me');
    return user;
  },
};

// ---------------------------------------------------------------------------
// Data endpoints (plan Task 2) — store write-through + hydrateFromServer.
//
// Response envelopes mirror server/src/modules/*/routes.ts EXACTLY: every
// list/entity response is wrapped ({ projects: [...] }, { project: {...} },
// { accepted } …) — the one exception is GET /methodologies/:id/export, which
// streams the bare JSON document. Serialized field names match the SPA types
// (mirrored deliberately); the server sends `null` where the SPA declares
// optional fields — both are falsy at every use site, so rows are stored
// verbatim.
// ---------------------------------------------------------------------------

/** Build `?k=v&…` from defined params only; '' when nothing is set. */
function query(params: Record<string, string | undefined>): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') qs.set(key, value);
  }
  const s = qs.toString();
  return s ? `?${s}` : '';
}

export type CreateProjectInput =
  Omit<Project, 'id' | 'organization_id' | 'lifecycle_stage' | 'created_at' | 'updated_at'>;
/** PATCH body — the server rejects unknown keys (lifecycle moves only via PDD endpoints). */
export type UpdateProjectPatch =
  Partial<Pick<Project, 'name' | 'location' | 'capacity_kwp' | 'commission_date' | 'status'>>;

export const projectsApi = {
  /** GET /projects → { projects } (org-scoped, newest first). */
  async list(): Promise<Project[]> {
    return (await apiFetch<{ projects: Project[] }>('/projects')).projects;
  },
  /** POST /projects → 201 { project }. */
  async create(input: CreateProjectInput): Promise<Project> {
    return (await apiFetch<{ project: Project }>('/projects', { method: 'POST', body: input })).project;
  },
  /** PATCH /projects/:id → { project }. */
  async update(id: string, patch: UpdateProjectPatch): Promise<Project> {
    return (await apiFetch<{ project: Project }>(`/projects/${id}`, { method: 'PATCH', body: patch })).project;
  },
};

export type AddFactorInput = Omit<EmissionFactor, 'id' | 'version' | 'is_current' | 'created_at'>;

export const factorsApi = {
  /** GET /factors → { factors } (all versions, newest first). */
  async list(): Promise<EmissionFactor[]> {
    return (await apiFetch<{ factors: EmissionFactor[] }>('/factors')).factors;
  },
  /** POST /factors → 201 { factor } (server bumps version + flips is_current). */
  async create(input: AddFactorInput): Promise<EmissionFactor> {
    return (await apiFetch<{ factor: EmissionFactor }>('/factors', { method: 'POST', body: input })).factor;
  },
};

export const monitoringApi = {
  /** GET /projects/:id/monitoring[?from=&to=] → { records } (date asc). */
  async list(projectId: string, range?: { from?: string; to?: string }): Promise<MonitoringRecord[]> {
    const path = `/projects/${projectId}/monitoring${query({ from: range?.from, to: range?.to })}`;
    return (await apiFetch<{ records: MonitoringRecord[] }>(path)).records;
  },
  /**
   * POST /projects/:id/monitoring → 201 { accepted }. The server stamps
   * param_key/unit itself and returns ONLY a count — callers who need the
   * stamped rows must re-fetch via list().
   */
  async addRows(
    projectId: string,
    rows: Array<{ record_date: string; generation_kwh: number }>,
  ): Promise<{ accepted: number }> {
    return apiFetch<{ accepted: number }>(`/projects/${projectId}/monitoring`, { method: 'POST', body: { rows } });
  },
};

/** Summary row from GET /methodologies — the full document only exists on /export. */
export interface MethodologySummary {
  id: string;
  code: string;
  name: string;
  standard: string;
  version: string;
  sectoral_scope: string;
  status: string;
}

export const methodologiesApi = {
  /** GET /methodologies → { methodologies } (summaries, code asc). */
  async list(): Promise<MethodologySummary[]> {
    return (await apiFetch<{ methodologies: MethodologySummary[] }>('/methodologies')).methodologies;
  },
  /**
   * GET /methodologies/:id/export → the bare schema-v2 document (NO envelope):
   * the stored methodology with `id` stripped and `schema_version` stamped.
   * The stamp is dropped here so the result is exactly a Methodology minus id.
   */
  async exportDoc(id: string): Promise<Omit<Methodology, 'id'>> {
    const doc = await apiFetch<Omit<Methodology, 'id'> & { schema_version?: unknown }>(`/methodologies/${id}/export`);
    const { schema_version: _v, ...methodology } = doc;
    return methodology;
  },
};

export const pddsApi = {
  /**
   * GET /pdds[?state=] → { pdds }. WITHOUT ?state= the server returns only
   * in-flight PDDs (the SPA's validationQueue: not draft/registered/rejected)
   * — full hydration must also fetch those three states explicitly.
   */
  async list(state?: PddState): Promise<ProjectDesignDocument[]> {
    return (await apiFetch<{ pdds: ProjectDesignDocument[] }>(`/pdds${query({ state })}`)).pdds;
  },
  /** GET /projects/:id/pdd → { pdd } (404 when the project has none yet). */
  async byProject(projectId: string): Promise<ProjectDesignDocument> {
    return (await apiFetch<{ pdd: ProjectDesignDocument }>(`/projects/${projectId}/pdd`)).pdd;
  },
  /** POST /projects/:id/pdd → the (created or existing) draft PDD. */
  async selectMethodology(projectId: string, methodologyId: string): Promise<ProjectDesignDocument> {
    return (await apiFetch<{ pdd: ProjectDesignDocument }>(`/projects/${projectId}/pdd`, {
      method: 'POST', body: { methodology_id: methodologyId },
    })).pdd;
  },
  /** PUT /pdds/:id/draft — autosave section data + linked evidence. */
  async saveDraft(pddId: string, sectionData: Record<string, unknown>, evidenceIds: string[]): Promise<ProjectDesignDocument> {
    return (await apiFetch<{ pdd: ProjectDesignDocument }>(`/pdds/${pddId}/draft`, {
      method: 'PUT', body: { section_data: sectionData, evidence_ids: evidenceIds },
    })).pdd;
  },
  /** POST /pdds/:id/submit — proponent sends the PDD into validation. */
  async submit(pddId: string): Promise<ProjectDesignDocument> {
    return (await apiFetch<{ pdd: ProjectDesignDocument }>(`/pdds/${pddId}/submit`, { method: 'POST' })).pdd;
  },
  /** POST /pdds/:id/start-validation — VVB takes the package. */
  async startValidation(pddId: string): Promise<ProjectDesignDocument> {
    return (await apiFetch<{ pdd: ProjectDesignDocument }>(`/pdds/${pddId}/start-validation`, { method: 'POST' })).pdd;
  },
  /** POST /pdds/:id/request-revision — back to the proponent with a summary. */
  async requestRevision(pddId: string, summary: string): Promise<ProjectDesignDocument> {
    return (await apiFetch<{ pdd: ProjectDesignDocument }>(`/pdds/${pddId}/request-revision`, {
      method: 'POST', body: { summary },
    })).pdd;
  },
  /** POST /pdds/:id/reject — terminal rejection with a reason. */
  async reject(pddId: string, reason: string): Promise<ProjectDesignDocument> {
    return (await apiFetch<{ pdd: ProjectDesignDocument }>(`/pdds/${pddId}/reject`, {
      method: 'POST', body: { reason },
    })).pdd;
  },
  /** POST /pdds/:id/comments — review-thread comment (both sides). */
  async addComment(pddId: string, body: string, sectionKey?: string): Promise<VerificationComment> {
    return (await apiFetch<{ comment: VerificationComment }>(`/pdds/${pddId}/comments`, {
      method: 'POST', body: { body, section_key: sectionKey },
    })).comment;
  },
  /**
   * POST /pdds/:id/register — server-side Gate-1 approval: re-validates,
   * freezes content_hash + ipfs_cid, mints disclosure salts (kept in server
   * custody) and returns the {disclosed, redacted} split for the browser to
   * sign into the PDD Registration VC.
   */
  async register(pddId: string): Promise<{ pdd: ProjectDesignDocument; disclosure: DisclosureSplit }> {
    return apiFetch(`/pdds/${pddId}/register`, { method: 'POST' });
  },
};

export const verificationsApi = {
  /** GET /verifications[?project_id=&state=] → { verifications }. */
  async list(filter?: { project_id?: string; state?: VerificationState }): Promise<VerificationRequest[]> {
    const path = `/verifications${query({ project_id: filter?.project_id, state: filter?.state })}`;
    return (await apiFetch<{ verifications: VerificationRequest[] }>(path)).verifications;
  },
  /** POST /verifications — create a draft package (proponent side). */
  async create(input: {
    project_id: string;
    monitoring_period_start: string;
    monitoring_period_end: string;
    reduction_kgco2e: number;
    factors_snapshot: string;
    evidence_ids: string[];
  }): Promise<VerificationRequest> {
    return (await apiFetch<{ verification: VerificationRequest }>('/verifications', {
      method: 'POST', body: input,
    })).verification;
  },
  /** POST /verifications/:id/submit — proponent sends the package for review. */
  async submit(id: string): Promise<VerificationRequest> {
    return (await apiFetch<{ verification: VerificationRequest }>(`/verifications/${id}/submit`, { method: 'POST' })).verification;
  },
  /** POST /verifications/:id/start-review — VVB takes the package. */
  async startReview(id: string): Promise<VerificationRequest> {
    return (await apiFetch<{ verification: VerificationRequest }>(`/verifications/${id}/start-review`, { method: 'POST' })).verification;
  },
  /** POST /verifications/:id/request-revision — back to the owner. */
  async requestRevision(id: string, summary: string): Promise<VerificationRequest> {
    return (await apiFetch<{ verification: VerificationRequest }>(`/verifications/${id}/request-revision`, {
      method: 'POST', body: { summary },
    })).verification;
  },
  /** POST /verifications/:id/approve — locks the package and seals hash_value. */
  async approve(id: string, note?: string): Promise<VerificationRequest> {
    return (await apiFetch<{ verification: VerificationRequest }>(`/verifications/${id}/approve`, {
      method: 'POST', body: note ? { note } : {},
    })).verification;
  },
  /** POST /verifications/:id/reject — terminal rejection. */
  async reject(id: string, reason: string): Promise<VerificationRequest> {
    return (await apiFetch<{ verification: VerificationRequest }>(`/verifications/${id}/reject`, {
      method: 'POST', body: { reason },
    })).verification;
  },
  /** POST /verifications/:id/comments — review-thread comment. */
  async addComment(id: string, body: string, evidenceId?: string): Promise<VerificationComment> {
    return (await apiFetch<{ comment: VerificationComment }>(`/verifications/${id}/comments`, {
      method: 'POST', body: { body, evidence_id: evidenceId },
    })).comment;
  },
};

export const evidenceApi = {
  /** GET /projects/:id/evidence → { evidence }. */
  async listByProject(projectId: string): Promise<EvidenceFile[]> {
    return (await apiFetch<{ evidence: EvidenceFile[] }>(`/projects/${projectId}/evidence`)).evidence;
  },
  /**
   * POST /projects/:id/evidence (multipart) → the created evidence row.
   * client_hash lets the server verify the bytes it stored match what the
   * browser hashed (422 on mismatch).
   */
  async upload(
    projectId: string,
    file: File,
    fields: { category: EvidenceFile['category']; description?: string; client_hash?: string },
  ): Promise<EvidenceFile> {
    const form = new FormData();
    form.append('category', fields.category);
    if (fields.description) form.append('description', fields.description);
    if (fields.client_hash) form.append('client_hash', fields.client_hash);
    form.append('file', file, file.name);
    const res = await apiFetch<{ evidence: EvidenceFile }>(`/projects/${projectId}/evidence`, {
      method: 'POST',
      body: form,
    });
    return res.evidence;
  },
  /**
   * GET /evidence/:id/file → raw bytes as a Blob (authed). Best-effort for
   * inline document figures: any failure (404, no stored blob, network)
   * resolves to null rather than throwing.
   */
  async fileBlob(id: string): Promise<Blob | null> {
    try {
      const res = await request(`/evidence/${id}/file`, {});
      return res.ok ? await res.blob() : null;
    } catch {
      return null;
    }
  },
};

export const credentialsApi = {
  /**
   * POST /pdds/:id/credential — store the browser-signed PDD Registration VC.
   * The server verifies the proof, persists the credential, then anchors it
   * on the REAL Hedera topic; the returned credential carries `anchor` with
   * live consensus coordinates (null if the testnet write is still pending).
   */
  async anchorPddCredential(
    pddId: string,
    vc: VerifiableCredential,
  ): Promise<{ pdd: ProjectDesignDocument; credential: VerifiableCredential }> {
    return apiFetch(`/pdds/${pddId}/credential`, { method: 'POST', body: vc });
  },
  /**
   * POST /verifications/:id/anchor — store the browser-signed MRV Approval VC;
   * the server persists, then anchors it on the real project topic.
   */
  async anchorVerification(
    verificationId: string,
    vc: VerifiableCredential,
  ): Promise<{ verification: VerificationRequest; credential: VerifiableCredential }> {
    return apiFetch(`/verifications/${verificationId}/anchor`, { method: 'POST', body: vc });
  },
  /**
   * POST /credentials/:id/mint — persist the browser-assembled token; the
   * server mints a REAL HTS serial (platform VCU token) and returns the row
   * with live token_id/serial_number + an HCS mint anchor.
   */
  async mint(credentialId: string, token: GuardianToken): Promise<GuardianToken> {
    return (await apiFetch<{ token: GuardianToken }>(
      `/credentials/${encodeURIComponent(credentialId)}/mint`,
      { method: 'POST', body: token },
    )).token;
  },
  /** POST /credentials/:id/anchor — retry a pending on-chain anchor. */
  async retryAnchor(credentialId: string): Promise<VerifiableCredential> {
    return (await apiFetch<{ credential: VerifiableCredential }>(
      `/credentials/${encodeURIComponent(credentialId)}/anchor`,
      { method: 'POST' },
    )).credential;
  },
  /** GET /credentials → { credentials } (org-scoped, newest first). */
  async list(): Promise<VerifiableCredential[]> {
    return (await apiFetch<{ credentials: VerifiableCredential[] }>('/credentials')).credentials;
  },
};

export const tokensApi = {
  /** GET /tokens → { tokens } (org-scoped, newest first). */
  async list(): Promise<GuardianToken[]> {
    return (await apiFetch<{ tokens: GuardianToken[] }>('/tokens')).tokens;
  },
};

// ---------------------------------------------------------------------------
// IoT ingest (mapping page)
// ---------------------------------------------------------------------------

export interface IotStatus {
  enabled: boolean;
  table?: string;
  unit?: string;
  value_kind?: string;
  lookback_hours?: number;
  timezone?: string;
  deduction_pct?: number;
}

export interface IotDevice {
  device_id: string;
  name: string | null;
  capacity_kwp: number | null;
  location: string | null;
  commission_date: string | null;
  /** 0 = plant exists in the source but has no readings yet */
  days: number;
  first_date: string | null;
  last_date: string | null;
  avg_value: number;
  /** effective mapping (DB row or legacy env pair); null = unmapped */
  project_id: string | null;
  /** mapped only: distinct record dates already in our monitoring store within the data range */
  synced_days: number | null;
}

export interface IotMapping {
  id: string;
  device_id: string;
  project_id: string;
  project_name: string;
  label: string | null;
  created_at: string;
}

export interface IotSyncStats {
  devices: number;
  readings: number;
  inserted: number;
  skipped_existing: number;
  skipped_partial_day: number;
}

export const iotApi = {
  /** GET /iot/status → config summary (never the DB credentials). */
  async status(): Promise<IotStatus> {
    return apiFetch<IotStatus>('/iot/status');
  },
  /** GET /iot/devices → external plants + stats + current mapping. */
  async devices(): Promise<IotDevice[]> {
    return (await apiFetch<{ devices: IotDevice[] }>('/iot/devices')).devices;
  },
  /** GET /iot/mappings → stored device→project rows. */
  async mappings(): Promise<IotMapping[]> {
    return (await apiFetch<{ mappings: IotMapping[] }>('/iot/mappings')).mappings;
  },
  /** POST /iot/mappings (upsert per device). */
  async map(deviceId: string, projectId: string, label?: string): Promise<void> {
    await apiFetch('/iot/mappings', {
      method: 'POST',
      body: { device_id: deviceId, project_id: projectId, label },
    });
  },
  /** DELETE /iot/mappings/:deviceId. */
  async unmap(deviceId: string): Promise<void> {
    await apiFetch(`/iot/mappings/${encodeURIComponent(deviceId)}`, { method: 'DELETE' });
  },
  /** POST /iot/create-project → 201 { project } (creates + maps in one call). */
  async createProject(input: {
    device_id: string;
    name: string;
    capacity_kwp: number;
    location: string;
    commission_date: string;
  }): Promise<Project> {
    return (await apiFetch<{ project: Project }>('/iot/create-project', { method: 'POST', body: input })).project;
  },
  /** POST /iot/sync — pull now; optional one-off backfill window in hours. */
  async sync(lookbackHours?: number): Promise<IotSyncStats> {
    return apiFetch<IotSyncStats>('/iot/sync', {
      method: 'POST',
      body: lookbackHours ? { lookback_hours: lookbackHours } : {},
    });
  },
};
