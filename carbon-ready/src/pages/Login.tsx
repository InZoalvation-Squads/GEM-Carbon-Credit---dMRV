import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LogIn } from 'lucide-react';
import { useStore } from '../store';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from '../data/accounts';
import { ROLE_LABEL } from '../lib/labels';

export function Login() {
  const navigate = useNavigate();
  const login = useStore((s) => s.login);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  function submit(e?: React.FormEvent) {
    e?.preventDefault();
    const res = login(email, password);
    if (res.ok) navigate('/dashboard');
    else setError(res.error ?? 'Sign in failed.');
  }

  function quickFill(demoEmail: string) {
    setEmail(demoEmail);
    setPassword(DEMO_PASSWORD);
    setError('');
  }

  return (
    <div className="grid min-h-full place-items-center bg-grid-faint [background-size:32px_32px] p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <img src="/gem-logo.svg" alt="GEM Carbon Credit" className="h-10 w-auto" />
          <h1 className="mt-4 text-xl font-semibold text-ink-900">Sign in to GEM Carbon Credit</h1>
          <p className="mt-1 text-sm text-ink-500">dMRV on Hedera Guardian</p>
        </div>

        <form onSubmit={submit} className="rounded-2xl border border-ink-200 bg-white p-6 shadow-sm">
          <div className="space-y-4">
            <Input label="Email" type="email" autoComplete="username" value={email}
              onChange={(e) => { setEmail(e.target.value); setError(''); }} placeholder="you@gem.demo" />
            <Input label="Password" type="password" autoComplete="current-password" value={password}
              onChange={(e) => { setPassword(e.target.value); setError(''); }} placeholder="••••••••" />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" className="w-full justify-center"><LogIn size={16} /> Sign in</Button>
          </div>
        </form>

        <p className="mt-4 text-center text-sm text-ink-500">
          Don&apos;t have an account?{' '}
          <Link to="/register" className="font-medium text-brand-600 hover:underline">Create account</Link>
        </p>

        <div className="mt-5">
          <div className="mb-2 text-center text-[11px] font-semibold uppercase tracking-wide text-ink-400">
            Demo accounts · click to fill
          </div>
          <div className="grid grid-cols-2 gap-2">
            {DEMO_ACCOUNTS.map((a) => (
              <button key={a.id} type="button" onClick={() => quickFill(a.email)}
                className="rounded-lg border border-ink-200 bg-white px-3 py-2 text-left text-xs transition-colors hover:border-brand-300 hover:bg-brand-50">
                <div className="font-medium text-ink-800">{ROLE_LABEL[a.role]}</div>
                <div className="truncate font-mono text-[11px] text-ink-500">{a.email}</div>
              </button>
            ))}
          </div>
          <p className="mt-2 text-center text-[11px] text-ink-400">Password for all demo accounts: <span className="font-mono">{DEMO_PASSWORD}</span></p>
        </div>
      </div>
    </div>
  );
}
