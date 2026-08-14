import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { RecIssuance } from './RecIssuance';
import { seedDemo } from '../test/demoFixtures';
import { useStore } from '../store';

beforeEach(() => {
  seedDemo();
  // seedDemo() does not reset currentUser — restore the default demo role
  // (esg_manager) so role-mutating tests don't leak into later ones.
  useStore.setState((s) => ({ currentUser: { ...s.currentUser, role: 'esg_manager' } }));
});

function renderPage() {
  return render(<MemoryRouter><RecIssuance /></MemoryRouter>);
}

describe('REC Issuance page', () => {
  it('lists demo requests with state badges and MWh values', () => {
    renderPage();
    expect(screen.getByText(/REC Issuance/)).toBeInTheDocument();
    // RIR-1001 draft, 0.999 MWh (Feb 2026); RIR-1000 issued, 6 MWh (Mar 2026).
    // "Draft"/"Issued" also appear as KPI labels and filter chips, so scope to
    // the state badge (a <span> with ring classes).
    const draftBadge = screen.getAllByText('Draft').find((el) => el.tagName === 'SPAN');
    const issuedBadge = screen.getAllByText('Issued').find((el) => el.tagName === 'SPAN');
    expect(draftBadge).toBeTruthy();
    expect(issuedBadge).toBeTruthy();
    expect(screen.getByText(/0\.999/)).toBeInTheDocument();
    expect(screen.getByText(/^6(\.0+)?\s*MWh$/)).toBeInTheDocument();
  });

  it('PP sees the create button; verifier does not but sees Approve on a submitted row', () => {
    renderPage();
    expect(screen.getByRole('button', { name: /Issue Request/ })).toBeInTheDocument();

    // Transition the draft fixture (RIR-1001) to submitted so a verifier has
    // something to review.
    useStore.setState((s) => ({
      recIssues: s.recIssues.map((r) => (r.id === 'RIR-1001' ? { ...r, state: 'submitted', submitted_at: '2026-08-01T00:00:00Z' } : r)),
    }));
    useStore.setState((s) => ({ currentUser: { ...s.currentUser, role: 'verifier' } }));
    renderPage();
    expect(screen.queryByRole('button', { name: /Issue Request/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Approve/ }).length).toBeGreaterThan(0);
  });

  it('create modal lists only REC-registered projects', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Issue Request/ }));
    const projectSelect = screen.getByLabelText(/Project/i) as HTMLSelectElement;
    const optionText = within(projectSelect).getAllByRole('option').map((o) => o.textContent);
    expect(optionText.some((t) => t?.includes('Ayutthaya Solar REC Facility'))).toBe(true);
    // Pune Rooftop Phase 1 (prj-0001) is a carbon-only (TVER) registered project — must NOT appear.
    expect(optionText.some((t) => t?.includes('Pune Rooftop Phase 1'))).toBe(false);
  });

  it('period Jan 2026 previews 4 MWh and computes the fee estimate by request type', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Issue Request/ }));

    const start = screen.getByLabelText(/Period start/i);
    const end = screen.getByLabelText(/Period end/i);
    fireEvent.change(start, { target: { value: '2026-01-01' } });
    fireEvent.change(end, { target: { value: '2026-01-31' } });

    expect(screen.getByTestId('mwh-preview')).toHaveTextContent('4');

    // Normal: 4 * 0.95 = 3.80
    expect(screen.getByTestId('fee-estimate')).toHaveTextContent('3.80');

    const requestType = screen.getByLabelText(/Request type/i);
    fireEvent.change(requestType, { target: { value: 'Self consumption' } });

    // Self consumption: 4 * 1.33 = 5.32
    expect(screen.getByTestId('fee-estimate')).toHaveTextContent('5.32');
  });

  it('period with no production data disables Save & Submit and shows the zero-MWh warning', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Issue Request/ }));

    const start = screen.getByLabelText(/Period start/i);
    const end = screen.getByLabelText(/Period end/i);
    // prj-0010 (Ayutthaya Solar REC Facility) has no monitoring records in April 2026.
    fireEvent.change(start, { target: { value: '2026-04-01' } });
    fireEvent.change(end, { target: { value: '2026-04-30' } });

    expect(screen.getByText(/ไม่มีข้อมูล monitoring ในช่วงที่เลือก/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Save & Submit/ })).toBeDisabled();
  });

  it('submit then approve as verifier walks a draft to issued', async () => {
    renderPage();
    // RIR-1001 starts as draft — submit it.
    const submitButtons = screen.getAllByRole('button', { name: /^Submit$/ });
    fireEvent.click(submitButtons[0]);

    // Row should now show a Submitted badge (scope to <span> — "Submitted" is
    // also a KPI label and a filter chip). The demo api resolves after a
    // simulated network tick, so wait for it.
    await waitFor(() => {
      expect(screen.getAllByText('Submitted').some((el) => el.tagName === 'SPAN')).toBe(true);
    });

    // Switch to a verifier and approve.
    useStore.setState((s) => ({ currentUser: { ...s.currentUser, role: 'verifier' } }));
    renderPage();
    const approveButtons = screen.getAllByRole('button', { name: /Approve/ });
    fireEvent.click(approveButtons[0]);

    await waitFor(() => {
      const issuedBadges = screen.getAllByText('Issued').filter((el) => el.tagName === 'SPAN');
      expect(issuedBadges.length).toBeGreaterThanOrEqual(1);
    });
  });
});
