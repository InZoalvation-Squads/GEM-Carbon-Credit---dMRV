# Register User — Design Spec

**Date:** 2026-07-20
**Goal:** Let a new user create an account (choosing their own role) so demos aren't limited
to the four fixed demo accounts. Stays within the existing mock-auth model (no backend).

## Components

### 1. Auth state (store)

- `registeredAccounts: Array<User & { password: string }>` — starts `[]`, persisted with
  the rest of the store (survives refresh).
- `register(input: { name; email; role; password }): { ok: boolean; error?: string }`
  - Normalizes email (trim + lowercase). Rejects duplicates against both `DEMO_ACCOUNTS`
    and `registeredAccounts` with error `An account with that email already exists.`
  - Creates a `User` via `uid('usr')` with `created_at = now`, appends to
    `registeredAccounts`, then sets `currentUser` + `isAuthenticated` (auto-login).
- `login(email, password)` updated: match against `DEMO_ACCOUNTS` (shared `DEMO_PASSWORD`)
  **and** `registeredAccounts` (per-account password). Error messages unchanged.

### 2. Register page (`/register`)

Standalone route outside `AppShell`, same brand styling as Login (GEM logo, white card,
faint grid background). Fields:

| Field | Rules |
|---|---|
| Full name | required |
| Email | required, must contain `@` |
| Role | select of the 4 roles, labelled via `ROLE_LABEL`; default `project_owner` |
| Password | required, ≥ 8 characters |
| Confirm password | must match Password |

Single inline error line (same pattern as Login). On success → `navigate('/dashboard')`.

### 3. Cross-links & routing

- Login gains "Don't have an account? **Create account**" → `/register`.
- Register has "Already have an account? **Sign in**" → `/login`.
- `App.tsx` adds `/register` as a standalone route beside `/login`.

## Testing (TDD)

- store (`auth.test.ts`): register success + auto-login; duplicate demo email; duplicate
  registered email; login with a registered account; wrong password for a registered
  account.
- UI (`register.ui.test.tsx`): renders all fields; shows error on password mismatch;
  successful submit navigates to dashboard.

## Out of scope (YAGNI)

No password hashing, email verification, admin user management, or role approval — the
system remains a demo-level mock auth, consistent with the login spec.
