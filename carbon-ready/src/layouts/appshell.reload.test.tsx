import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AppShell } from './AppShell';
import { useStore } from '../store';
import { seedDemo } from '../test/demoFixtures';
import { toast } from '../components/layout/Toast';

// Reload in server mode: the persisted store holds the copy from the last
// visit. It must not be shown as current — the page waits for a full server
// load (same as after sign-in) and shows the route skeleton meanwhile.
vi.mock('../lib/server-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/server-api')>();
  return { ...actual, serverMode: () => true };
});

function renderShell() {
  return render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/dashboard" element={<div>Page content</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

let finishLoad: (errors?: string[]) => void;

beforeEach(() => {
  seedDemo();
  const hydrateFromServer = vi.fn(() => new Promise<void>((resolve) => {
    finishLoad = (errors = []) => {
      useStore.setState({ server_loaded: true, hydration_errors: errors });
      resolve();
    };
  }));
  useStore.setState({
    isAuthenticated: true, server_loaded: false, hydration_errors: [],
    hydrateFromServer, refreshFromServer: vi.fn(async () => {}),
  });
});
afterEach(() => { vi.restoreAllMocks(); });

describe('AppShell after a reload in server mode', () => {
  it('loads everything from the server and shows the skeleton, not the saved copy, until it lands', async () => {
    renderShell();

    expect(useStore.getState().hydrateFromServer).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Page content')).toBeNull();
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();

    await act(async () => { finishLoad(); });

    expect(screen.getByText('Page content')).toBeInTheDocument();
  });

  it('does not load again when sign-in already loaded this page', () => {
    useStore.setState({ server_loaded: true });
    renderShell();

    expect(useStore.getState().hydrateFromServer).not.toHaveBeenCalled();
    expect(screen.getByText('Page content')).toBeInTheDocument();
  });

  it('says which data could not be loaded', async () => {
    const error = vi.spyOn(toast, 'error');
    renderShell();

    await act(async () => { finishLoad(['factors', 'evidence']); });

    expect(error).toHaveBeenCalledWith(expect.any(String), expect.stringContaining('factors, evidence'));
    expect(screen.getByText('Page content')).toBeInTheDocument();
  });
});
