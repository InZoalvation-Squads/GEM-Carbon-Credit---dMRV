import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { Guardian } from './Guardian';
import { ReviewDetail } from './ReviewDetail';
import { useStore } from '../store';
import { seedDemo } from '../test/demoFixtures';

beforeEach(() => {
  localStorage.clear();
  seedDemo();
});

describe('Guardian page', () => {
  it('renders the credential schema and the seed credential in the registry', () => {
    render(<MemoryRouter><Guardian /></MemoryRouter>);

    // Schema tab (default): the schema name + a couple of its properties.
    expect(screen.getByText('MRV Carbon Reduction Approval')).toBeInTheDocument();
    expect(screen.getByText('verification_id')).toBeInTheDocument();
    expect(screen.getByText('package_hash')).toBeInTheDocument();

    // Switch to the registry tab → the pre-anchored seed credential is listed.
    fireEvent.click(screen.getByRole('button', { name: /Credential Registry/i }));
    expect(screen.getByText('urn:vc:vr1000seed')).toBeInTheDocument();
  });
});

describe('ReviewDetail anchoring', () => {
  function renderReview(id: string) {
    return render(
      <MemoryRouter initialEntries={[`/verifications/${id}`]}>
        <Routes>
          <Route path="/verifications/:id" element={<ReviewDetail />} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it('shows the Anchor button for an approved, unanchored package and flips to Anchored on click', () => {
    useStore.setState((s) => ({
      verifications: s.verifications.map((v) =>
        v.id === 'VR-1001'
          ? { ...v, state: 'approved' as const, locked_at: '2026-05-20T00:00:00Z', hash_value: 'sha256-vr1001', credential_id: null, anchored_at: null, hcs_topic_id: null, hcs_sequence_number: null }
          : v),
    }));
    renderReview('VR-1001');

    const anchorBtn = screen.getByRole('button', { name: /Anchor to Hedera Guardian/i });
    expect(anchorBtn).toBeInTheDocument();

    fireEvent.click(anchorBtn);

    expect(screen.getByText(/Anchored on Hedera Guardian/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Anchor to Hedera Guardian/i })).not.toBeInTheDocument();
    expect(screen.getByText(/View on HashScan/i)).toBeInTheDocument();
  });

  it('shows the anchored details (not a button) for the already-anchored VR-1000', () => {
    renderReview('VR-1000');
    expect(screen.getByText(/Anchored on Hedera Guardian/i)).toBeInTheDocument();
    const banner = screen.getByText(/Anchored on Hedera Guardian/i).closest('div')!;
    expect(within(banner).queryByRole('button', { name: /Anchor to Hedera Guardian/i })).not.toBeInTheDocument();
  });
});
