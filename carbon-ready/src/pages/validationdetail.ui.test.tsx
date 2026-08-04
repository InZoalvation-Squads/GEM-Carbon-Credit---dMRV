import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ValidationDetail } from './ValidationDetail';
import { seedDemo } from '../test/demoFixtures';
import { toast } from '../components/layout/Toast';
import { api } from '../lib/api';

beforeEach(() => seedDemo());
afterEach(() => vi.restoreAllMocks());

function renderDetail(pddId: string) {
  return render(
    <MemoryRouter initialEntries={[`/validation/${pddId}`]}>
      <Routes>
        <Route path="/validation/:pddId" element={<ValidationDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

// A rejected server call must never disappear into an unhandled rejection —
// the VVB needs to see WHY the button did nothing (e.g. 403 role mismatch).
describe('ValidationDetail — API errors surface as toasts', () => {
  it('shows an error toast when start validation is rejected by the server', async () => {
    vi.spyOn(api, 'startValidation').mockRejectedValue(new Error('FORBIDDEN: Insufficient role'));
    const error = vi.spyOn(toast, 'error');
    renderDetail('PDD-2002'); // fixture PDD in "submitted" state
    fireEvent.click(screen.getByRole('button', { name: /start validation/i }));
    await waitFor(() => expect(error).toHaveBeenCalled());
    expect(String(error.mock.calls[0][1])).toMatch(/FORBIDDEN/);
  });

  it('shows an error toast when rejecting the PDD fails', async () => {
    vi.spyOn(api, 'rejectPdd').mockRejectedValue(new Error('Session expired — please sign in again.'));
    const error = vi.spyOn(toast, 'error');
    // Flip the fixture to under_validation so the Reject action is available.
    const { useStore } = await import('../store');
    useStore.setState((s) => ({
      pdds: s.pdds.map((p) => (p.id === 'PDD-2002' ? { ...p, state: 'under_validation' as const } : p)),
    }));
    renderDetail('PDD-2002');
    fireEvent.change(screen.getByPlaceholderText(/add a note/i), { target: { value: 'not acceptable' } });
    fireEvent.click(screen.getByRole('button', { name: /^reject$/i }));
    await waitFor(() => expect(error).toHaveBeenCalled());
    expect(String(error.mock.calls[0][1])).toMatch(/Session expired/);
  });
});

describe('ValidationDetail — readable header and comments', () => {
  it('page heading leads with the project name, not the raw PDD id', () => {
    renderDetail('PDD-2002'); // prj-0003 "Surin Rice-Husk Power"
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1.textContent).toContain('Surin Rice-Husk Power');
    expect(h1.textContent).not.toContain('PDD-2002');
  });

  it('comments show the author role label and a timestamp, not the raw enum', async () => {
    const { useStore } = await import('../store');
    useStore.setState((s) => ({
      comments: [...s.comments, {
        id: 'cmt-test-1', verification_id: 'PDD-2002', evidence_id: null,
        author_id: 'usr-vvb', author_name: 'Daniel Okoye', author_role: 'verifier' as const,
        body: 'ขอเอกสารเพิ่มเติม', created_at: '2026-06-21T10:00:00Z',
      }],
    }));
    renderDetail('PDD-2002');
    expect(screen.getByText(/VVB \(Validation & Verification Body\)/)).toBeInTheDocument();
    expect(screen.getByText(/21 Jun 2026/)).toBeInTheDocument();
  });

  it('locks the Start validation button while the request is in flight', async () => {
    vi.spyOn(api, 'startValidation').mockImplementation(() => new Promise(() => {}));
    renderDetail('PDD-2002');
    const btn = screen.getByRole('button', { name: /start validation/i });
    fireEvent.click(btn);
    await waitFor(() => expect(btn).toBeDisabled());
  });
});
