import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { UserPlus } from 'lucide-react';
import { useStore } from '../store';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Button } from '../components/ui/Button';
import { ROLE_LABEL } from '../lib/labels';
import { serverMode } from '../lib/server-api';
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

  // Server mode: admins are provisioned via seed/ops, never self-registered
  // (the API rejects the role) — mirror that restriction in the form.
  const roles = ROLES.filter((r) => r !== 'admin' || !serverMode());

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!name.trim() || !email.trim() || !password || !confirm) { setError('Please fill in all fields.'); return; }
    if (!email.includes('@')) { setError('Please enter a valid email address.'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    const res = await register({ name, email, role, password });
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
              {roles.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
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
