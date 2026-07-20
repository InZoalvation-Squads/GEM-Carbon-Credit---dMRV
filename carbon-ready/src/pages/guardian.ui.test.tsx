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

describe('Guardian VCU minting', () => {
  function renderGuardian() {
    return render(<MemoryRouter><Guardian /></MemoryRouter>);
  }

  it('shows a Mint button for the Standard Registry on an un-minted credential', () => {
    useStore.getState().setRole('admin'); // Standard Registry
    renderGuardian();
    fireEvent.click(screen.getByRole('button', { name: /Credential Registry/i }));
    expect(screen.getByRole('button', { name: /^Mint/i })).toBeInTheDocument();
  });

  it('hides the Mint button for a non-Registry role', () => {
    useStore.getState().setRole('project_owner'); // Project Proponent
    renderGuardian();
    fireEvent.click(screen.getByRole('button', { name: /Credential Registry/i }));
    expect(screen.queryByRole('button', { name: /^Mint/i })).toBeNull();
  });

  it('mints a token and lists it in the Token History tab', () => {
    useStore.getState().setRole('admin');
    renderGuardian();
    fireEvent.click(screen.getByRole('button', { name: /Credential Registry/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Mint/i }));

    fireEvent.click(screen.getByRole('button', { name: /Token History/i }));
    expect(screen.getByText('24.55 tCO₂e')).toBeInTheDocument();
    expect(screen.getByText(/0\.0\.480200/)).toBeInTheDocument(); // token id
  });

  it('renders the full Trust Chain for a minted token', () => {
    useStore.getState().setRole('admin');
    useStore.getState().mintToken('urn:vc:vr1000seed');
    renderGuardian();
    fireEvent.click(screen.getByRole('button', { name: /Trust Chain/i }));

    expect(screen.getByText(/PDD registered/i)).toBeInTheDocument();
    expect(screen.getByText(/Verification approved/i)).toBeInTheDocument();
    expect(screen.getByText(/Credential issued/i)).toBeInTheDocument();
    expect(screen.getByText(/Token minted/i)).toBeInTheDocument();
  });

  it('trust chain shows the PDD credential reference when the PDD is anchored', () => {
    // Anchor the seeded PDD by stamping its credential id + cid directly.
    useStore.setState((s) => ({
      pdds: s.pdds.map((p) => (p.id === 'PDD-2000'
        ? { ...p, ipfs_cid: 'bafkreitestcid000000000', credential_id: 'urn:vc:vr1000seed' }
        : p)),
    }));
    useStore.getState().setRole('admin');
    useStore.getState().mintToken('urn:vc:vr1000seed');
    renderGuardian();
    fireEvent.click(screen.getByRole('button', { name: /Trust Chain/i }));
    expect(screen.getByText(/ipfs bafkreitestcid000000000/i)).toBeInTheDocument();
    expect(screen.getByText(/VC urn:vc:vr1000seed/i)).toBeInTheDocument();
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
