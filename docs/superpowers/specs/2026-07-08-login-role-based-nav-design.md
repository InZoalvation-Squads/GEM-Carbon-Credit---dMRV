# Login + Role-based Navigation — Design Spec

**Date:** 2026-07-08
**Goal:** Add a mock login page and hide sidebar menus each role shouldn't see, so a demo
maps cleanly onto the Guardian VM0047 actor triad.

## Components

### 1. Auth state (store)

- `isAuthenticated: boolean` (persisted).
- `login(email, password): { ok: boolean; error?: string }` — matches email against demo
  accounts, checks the shared demo password, sets `currentUser` + `isAuthenticated`.
- `logout()` — clears `isAuthenticated`.
- **Demo accounts** (shared password `demo1234`):

  | email | role | Guardian actor |
  |---|---|---|
  | proponent@gem.demo | project_owner | Project Proponent |
  | vvb@gem.demo | verifier | VVB |
  | registry@gem.demo | admin | Standard Registry |
  | esg@gem.demo | esg_manager | (internal) |

### 2. Login page (`/login`)

Email + password form, Sign in button, inline error. Four quick-fill chips (one per demo
account) prefill credentials for fast demos. Brand styling (gradient, GEM logo). Lives
outside `AppShell`.

### 3. Route guard

`App.tsx` redirects to `/login` when not authenticated; `/login` is a standalone route.
Logout action added to the TopBar user menu.

### 4. Role-based navigation

Each sidebar item gains `roles: UserRole[]`. Sidebar filters items by the current role;
groups with no visible items are hidden. Switching role in the TopBar updates nav live.

| Menu | Visible to |
|---|---|
| Dashboard, Projects, Methodologies | all |
| Register Project, Upload, Calculations | project_owner, esg_manager |
| Emission Factors | esg_manager, admin |
| Validation Queue | verifier, admin |
| Verifications | project_owner, verifier |
| Guardian | verifier, admin |
| Audit Log | admin, esg_manager |

## Testing (TDD)

- store: login success; wrong password; unknown email; logout.
- Sidebar: VVB sees Validation/Verifications/Guardian, not Upload/Register; Registry sees
  Guardian/Validation, not Register.
- App guard: unauthenticated renders the Login page.

## Out of scope (YAGNI)

- No real backend / password hashing / sessions. No per-route authorization beyond nav
  hiding (routes remain reachable by URL — nav hiding is the demo-level guard).
