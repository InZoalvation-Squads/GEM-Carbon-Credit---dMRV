import type { UserRole } from '../types';

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
    if (!refreshed) {
      clearSession();
      throw new SessionExpiredError();
    }
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
    if (!refreshed || !session) {
      clearSession();
      throw new SessionExpiredError();
    }
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
