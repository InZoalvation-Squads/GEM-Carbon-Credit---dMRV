import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TopBar } from './TopBar';
import { seedDemo } from '../../test/demoFixtures';
import { useStore } from '../../store';

const mode = vi.hoisted(() => ({ server: false }));

vi.mock('../../lib/server-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/server-api')>();
  return { ...actual, serverMode: () => mode.server };
});

beforeEach(() => {
  mode.server = false;
  seedDemo();
});
afterEach(() => { vi.restoreAllMocks(); });

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

describe('TopBar in server mode', () => {
  // Roles come from the signed-in server account. Switching would mean signing
  // in to a demo account with the bundled password — never offered there.
  it('hides the role switcher but keeps Sign out', () => {
    mode.server = true;
    openRoleMenu();
    expect(screen.queryByRole('menuitemradio')).toBeNull();
    expect(screen.queryByText('Switch role')).toBeNull();
    expect(screen.getByRole('menuitem', { name: /sign out/i })).toBeInTheDocument();
  });
});

describe('TopBar role switcher — demo mode', () => {
  it('switching role flips the local demo role', () => {
    openRoleMenu();
    fireEvent.click(screen.getByRole('menuitemradio', { name: /VVB/ }));
    expect(useStore.getState().currentUser.role).toBe('verifier');
  });
});
