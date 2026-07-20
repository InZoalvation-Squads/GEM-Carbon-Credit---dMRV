# Register User Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/register` page so a new user can create an account (choosing their own role) and be auto-logged-in, within the existing mock-auth store.

**Architecture:** A new persisted `registeredAccounts` array + `register()` action in the zustand store; `login()` learns to match registered accounts too. A standalone `Register` page (same brand styling as `Login`) is added beside `/login` in `App.tsx`, with cross-links between the two pages.

**Tech Stack:** React 18 + TypeScript, react-router-dom, zustand (persist), Tailwind, vitest + @testing-library/react.

**Spec:** `carbon-ready/docs/superpowers/specs/2026-07-20-register-user-design.md`

All commands run from `carbon-ready/`.

---

### Task 1: Store — `register()` action + login with registered accounts

**Files:**
- Modify: `carbon-ready/src/store/index.ts` (AppState interface ~line 22-28, implementation ~line 96-107)
- Test: `carbon-ready/src/store/auth.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `carbon-ready/src/store/auth.test.ts`:

```ts
describe('auth — register', () => {
  beforeEach(() => {
    localStorage.clear();
    useStore.setState({ registeredAccounts: [], isAuthenticated: false });
  });

  it('registers a new account and auto-logs in with the chosen role', () => {
    const res = useStore.getState().register({ name: 'Nok T.', email: 'nok@gem.demo', role: 'verifier', password: 'secret123' });
    expect(res.ok).toBe(true);
    expect(useStore.getState().isAuthenticated).toBe(true);
    expect(useStore.getState().currentUser.email).toBe('nok@gem.demo');
    expect(useStore.getState().currentUser.role).toBe('verifier');
  });

  it('rejects an email already used by a demo account (case-insensitive)', () => {
    const res = useStore.getState().register({ name: 'X', email: 'VVB@gem.demo', role: 'project_owner', password: 'secret123' });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/already exists/i);
    expect(useStore.getState().isAuthenticated).toBe(false);
  });

  it('rejects an email that was already registered', () => {
    useStore.getState().register({ name: 'Nok T.', email: 'nok@gem.demo', role: 'verifier', password: 'secret123' });
    const res = useStore.getState().register({ name: 'Other', email: 'nok@gem.demo', role: 'admin', password: 'other456' });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/already exists/i);
  });

  it('logs in with a registered account using its own password', () => {
    useStore.getState().register({ name: 'Nok T.', email: 'nok@gem.demo', role: 'esg_manager', password: 'secret123' });
    useStore.getState().logout();
    const res = useStore.getState().login('nok@gem.demo', 'secret123');
    expect(res.ok).toBe(true);
    expect(useStore.getState().currentUser.role).toBe('esg_manager');
  });

  it('rejects a wrong password for a registered account', () => {
    useStore.getState().register({ name: 'Nok T.', email: 'nok@gem.demo', role: 'verifier', password: 'secret123' });
    useStore.getState().logout();
    const res = useStore.getState().login('nok@gem.demo', 'demo1234');
    expect(res.ok).toBe(false);
    expect(useStore.getState().isAuthenticated).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/store/auth.test.ts`
Expected: the 5 new tests FAIL (`register is not a function`); the 5 existing login tests still PASS.

- [ ] **Step 3: Implement in the store**

In `carbon-ready/src/store/index.ts`, extend the `AppState` interface (after `logout: () => void;`):

```ts
  registeredAccounts: Array<User & { password: string }>;
  register: (input: { name: string; email: string; role: UserRole; password: string }) => { ok: boolean; error?: string };
```

Replace the existing `login` implementation and add `register` + `registeredAccounts` beside it:

```ts
      registeredAccounts: [],
      register: ({ name, email, role, password }) => {
        const normalized = email.trim().toLowerCase();
        const taken = DEMO_ACCOUNTS.some((a) => a.email.toLowerCase() === normalized)
          || get().registeredAccounts.some((a) => a.email.toLowerCase() === normalized);
        if (taken) return { ok: false, error: 'An account with that email already exists.' };
        const user: User = { id: uid('usr'), email: normalized, name: name.trim(), role, created_at: new Date().toISOString() };
        set((s) => ({ registeredAccounts: [...s.registeredAccounts, { ...user, password }], currentUser: user, isAuthenticated: true }));
        return { ok: true };
      },
      login: (email, password) => {
        const normalized = email.trim().toLowerCase();
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
      },
```

`registeredAccounts` is part of the persisted state, so it survives refresh with no persist-config change.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/store/auth.test.ts`
Expected: all 10 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/store/index.ts src/store/auth.test.ts
git commit -m "feat(auth): register action with persisted accounts"
```

---

### Task 2: Register page

**Files:**
- Create: `carbon-ready/src/pages/Register.tsx`
- Test: `carbon-ready/src/pages/register.ui.test.tsx`

- [ ] **Step 1: Write the failing UI tests**

Create `carbon-ready/src/pages/register.ui.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { Register } from './Register';
import { useStore } from '../store';

beforeEach(() => {
  localStorage.clear();
  useStore.setState({ registeredAccounts: [], isAuthenticated: false });
});

function renderRegister() {
  return render(
    <MemoryRouter initialEntries={['/register']}>
      <Routes>
        <Route path="/register" element={<Register />} />
        <Route path="/dashboard" element={<div>DASHBOARD</div>} />
      </Routes>
    </MemoryRouter>
  );
}

function fill(overrides: Partial<Record<'name' | 'email' | 'password' | 'confirm', string>> = {}) {
  fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: overrides.name ?? 'Nok T.' } });
  fireEvent.change(screen.getByLabelText(/^email$/i), { target: { value: overrides.email ?? 'nok@gem.demo' } });
  fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: overrides.password ?? 'secret123' } });
  fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: overrides.confirm ?? 'secret123' } });
}

describe('Register page', () => {
  it('renders name, email, role, password and confirm fields', () => {
    renderRegister();
    expect(screen.getByLabelText(/full name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^email$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^role$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /sign in/i })).toBeInTheDocument();
  });

  it('shows an error when passwords do not match and does not log in', () => {
    renderRegister();
    fill({ confirm: 'different1' });
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));
    expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument();
    expect(useStore.getState().isAuthenticated).toBe(false);
  });

  it('shows an error for a short password', () => {
    renderRegister();
    fill({ password: 'short', confirm: 'short' });
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));
    expect(screen.getByText(/at least 8 characters/i)).toBeInTheDocument();
  });

  it('registers with the chosen role and navigates to the dashboard', () => {
    renderRegister();
    fill();
    fireEvent.change(screen.getByLabelText(/^role$/i), { target: { value: 'verifier' } });
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));
    expect(screen.getByText('DASHBOARD')).toBeInTheDocument();
    expect(useStore.getState().isAuthenticated).toBe(true);
    expect(useStore.getState().currentUser.role).toBe('verifier');
  });

  it('surfaces the duplicate-email error from the store', () => {
    renderRegister();
    fill({ email: 'vvb@gem.demo' });
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));
    expect(screen.getByText(/already exists/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/pages/register.ui.test.tsx`
Expected: FAIL — `Register.tsx` does not exist (module resolution error).

- [ ] **Step 3: Create the page**

Create `carbon-ready/src/pages/Register.tsx`:

```tsx
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { UserPlus } from 'lucide-react';
import { useStore } from '../store';
import { Input } from '../components/Input';
import { Select } from '../components/Select';
import { Button } from '../components/Button';
import { ROLE_LABEL } from '../lib/labels';
import type { UserRole } from '../types';

const ROLES: UserRole[] = ['project_owner', 'verifier', 'admin', 'esg_manager'];

export function Register() {
  const navigate = useNavigate();
  const register = useStore((s) => s.register);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>('project_owner');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');

  function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!name.trim() || !email.trim() || !password || !confirm) { setError('Please fill in all fields.'); return; }
    if (!email.includes('@')) { setError('Please enter a valid email address.'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    const res = register({ name, email, role, password });
    if (res.ok) navigate('/dashboard');
    else setError(res.error ?? 'Registration failed.');
  }

  return (
    <div className="grid min-h-full place-items-center bg-grid-faint [background-size:32px_32px] p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <img src="/gem-logo.svg" alt="GEM Carbon Credit" className="h-10 w-auto" />
          <h1 className="mt-4 text-xl font-semibold text-ink-900">Create your account</h1>
          <p className="mt-1 text-sm text-ink-500">dMRV on Hedera Guardian</p>
        </div>

        <form onSubmit={submit} className="rounded-2xl border border-ink-200 bg-white p-6 shadow-sm">
          <div className="space-y-4">
            <Input label="Full name" name="name" autoComplete="name" value={name}
              onChange={(e) => { setName(e.target.value); setError(''); }} placeholder="Your name" />
            <Input label="Email" name="email" type="email" autoComplete="username" value={email}
              onChange={(e) => { setEmail(e.target.value); setError(''); }} placeholder="you@gem.demo" />
            <Select label="Role" name="role" value={role}
              onChange={(e) => { setRole(e.target.value as UserRole); setError(''); }}>
              {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </Select>
            <Input label="Password" name="password" type="password" autoComplete="new-password" value={password}
              onChange={(e) => { setPassword(e.target.value); setError(''); }} placeholder="At least 8 characters" />
            <Input label="Confirm password" name="confirm" type="password" autoComplete="new-password" value={confirm}
              onChange={(e) => { setConfirm(e.target.value); setError(''); }} placeholder="••••••••" />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" className="w-full justify-center"><UserPlus size={16} /> Create account</Button>
          </div>
        </form>

        <p className="mt-4 text-center text-sm text-ink-500">
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-brand-600 hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/pages/register.ui.test.tsx`
Expected: all 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Register.tsx src/pages/register.ui.test.tsx
git commit -m "feat(auth): register page with role selection"
```

---

### Task 3: Wire the route and cross-link from Login

**Files:**
- Modify: `carbon-ready/src/App.tsx` (imports ~line 4, routes ~line 31)
- Modify: `carbon-ready/src/pages/Login.tsx` (imports ~line 2, below the form card ~line 48)

- [ ] **Step 1: Add the `/register` route**

In `carbon-ready/src/App.tsx` add the import:

```tsx
import { Register } from './pages/Register';
```

and beside the login route:

```tsx
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
```

- [ ] **Step 2: Add the Create-account link to Login**

In `carbon-ready/src/pages/Login.tsx`, change the react-router import to include `Link`:

```tsx
import { Link, useNavigate } from 'react-router-dom';
```

and insert directly after the closing `</form>` tag:

```tsx
        <p className="mt-4 text-center text-sm text-ink-500">
          Don&apos;t have an account?{' '}
          <Link to="/register" className="font-medium text-brand-600 hover:underline">Create account</Link>
        </p>
```

- [ ] **Step 3: Run the full test suite and typecheck**

Run: `npm test && npx tsc --noEmit`
Expected: all suites PASS, no type errors.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx src/pages/Login.tsx
git commit -m "feat(auth): wire /register route and login cross-link"
```
