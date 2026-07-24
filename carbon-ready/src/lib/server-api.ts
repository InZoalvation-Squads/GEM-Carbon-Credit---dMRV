import type {
  UserRole, Project, EmissionFactor, MonitoringRecord, Methodology, PddState,
  ProjectDesignDocument, VerificationRequest, VerificationState, EvidenceFile,
  VerifiableCredential, GuardianToken,
} from '../types';

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
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (auth) {
    const session = getSession();
    if (session) headers.authorization = `Bearer ${session.access_token}`;
  }
  // Global fetch resolved at call time so vi.stubGlobal('fetch', …) works.
  return fetch(`${apiBase()}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
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
};

export const verificationsApi = {
  /** GET /verifications[?project_id=&state=] → { verifications }. */
  async list(filter?: { project_id?: string; state?: VerificationState }): Promise<VerificationRequest[]> {
    const path = `/verifications${query({ project_id: filter?.project_id, state: filter?.state })}`;
    return (await apiFetch<{ verifications: VerificationRequest[] }>(path)).verifications;
  },
};

export const evidenceApi = {
  /** GET /projects/:id/evidence → { evidence }. */
  async listByProject(projectId: string): Promise<EvidenceFile[]> {
    return (await apiFetch<{ evidence: EvidenceFile[] }>(`/projects/${projectId}/evidence`)).evidence;
  },
};

export const credentialsApi = {
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
