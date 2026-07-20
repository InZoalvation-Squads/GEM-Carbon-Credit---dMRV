import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from './index';

describe('auth — mock login mapped to Guardian roles', () => {
  beforeEach(() => {
    localStorage.clear();
    useStore.getState().logout();
  });

  it('logs in a demo account and adopts its role', () => {
    const res = useStore.getState().login('vvb@gem.demo', 'demo1234');
    expect(res.ok).toBe(true);
    expect(useStore.getState().isAuthenticated).toBe(true);
    expect(useStore.getState().currentUser.role).toBe('verifier');
    expect(useStore.getState().currentUser.email).toBe('vvb@gem.demo');
  });

  it('maps the registry account to the admin (Standard Registry) role', () => {
    const res = useStore.getState().login('registry@gem.demo', 'demo1234');
    expect(res.ok).toBe(true);
    expect(useStore.getState().currentUser.role).toBe('admin');
  });

  it('rejects a wrong password', () => {
    const res = useStore.getState().login('vvb@gem.demo', 'nope');
    expect(res.ok).toBe(false);
    expect(res.error).toBeTruthy();
    expect(useStore.getState().isAuthenticated).toBe(false);
  });

  it('rejects an unknown email', () => {
    const res = useStore.getState().login('ghost@gem.demo', 'demo1234');
    expect(res.ok).toBe(false);
    expect(useStore.getState().isAuthenticated).toBe(false);
  });

  it('logout clears authentication', () => {
    useStore.getState().login('proponent@gem.demo', 'demo1234');
    useStore.getState().logout();
    expect(useStore.getState().isAuthenticated).toBe(false);
  });
});

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
