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

  it('registers with the chosen role and navigates to the dashboard', async () => {
    renderRegister();
    fill();
    fireEvent.change(screen.getByLabelText(/^role$/i), { target: { value: 'verifier' } });
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));
    expect(await screen.findByText('DASHBOARD')).toBeInTheDocument();
    expect(useStore.getState().isAuthenticated).toBe(true);
    expect(useStore.getState().currentUser.role).toBe('verifier');
  });

  it('surfaces the duplicate-email error from the store', async () => {
    renderRegister();
    fill({ email: 'vvb@gem.demo' });
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));
    expect(await screen.findByText(/already exists/i)).toBeInTheDocument();
  });
});
