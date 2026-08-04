import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TopBar } from './TopBar';
import { seedDemo } from '../../test/demoFixtures';
import { useStore } from '../../store';
import { toast } from './Toast';
import { DEMO_PASSWORD } from '../../data/accounts';

// Server mode ON for this file: the switcher must re-authenticate, not just
// flip client state (a stale JWT keeps the old role and the API 403s).
vi.mock('../../lib/server-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/server-api')>();
  return { ...actual, serverMode: () => true };
});

beforeEach(() => seedDemo());
afterEach(() => vi.restoreAllMocks());

// The role switcher must show the same Guardian terminology as the rest of the app.
function openRoleMenu() {
  render(<MemoryRouter><TopBar onOpenSidebar={() => {}} /></MemoryRouter>);
  const toggle = screen.getAllByRole('button').find((b) => b.getAttribute('aria-haspopup') === 'menu')!;
  fireEvent.click(toggle);
}

describe('TopBar role switcher — Guardian labels', () => {
  it('lists the Project Proponent role, not "Project Owner"', () => {
    openRoleMenu();
    expect(screen.getByText('Project Proponent')).toBeInTheDocument();
    expect(screen.queryByText('Project Owner')).toBeNull();
  });

  it('lists the VVB and Standard Registry roles', () => {
    openRoleMenu();
    expect(screen.getByText('VVB (Validation & Verification Body)')).toBeInTheDocument();
    expect(screen.getByText('Standard Registry')).toBeInTheDocument();
  });
});

describe('TopBar role switcher — server mode re-authenticates', () => {
  it('switching role signs in as the matching demo account instead of only flipping client state', async () => {
    const login = vi.fn(async () => ({ ok: true }));
    useStore.setState({ login });
    openRoleMenu();
    fireEvent.click(screen.getByRole('menuitemradio', { name: /VVB/ }));
    await waitFor(() => expect(login).toHaveBeenCalledWith('vvb@gem.demo', DEMO_PASSWORD));
  });

  it('a failed re-login shows an error toast and keeps the current role', async () => {
    const login = vi.fn(async () => ({ ok: false, error: 'Invalid email or password' }));
    useStore.setState({ login });
    const error = vi.spyOn(toast, 'error');
    openRoleMenu();
    fireEvent.click(screen.getByRole('menuitemradio', { name: /VVB/ }));
    await waitFor(() => expect(error).toHaveBeenCalled());
    expect(useStore.getState().currentUser.role).toBe('esg_manager'); // seed user unchanged
  });
});
