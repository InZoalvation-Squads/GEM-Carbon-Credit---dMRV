import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ProjectCreditsTab } from './ProjectCreditsTab';
import { useStore } from '../../store';
import { seedDemo } from '../../test/demoFixtures';

beforeEach(() => seedDemo());

describe('ProjectCreditsTab', () => {
  it('shows an explanatory empty state before any mint', () => {
    render(<MemoryRouter><ProjectCreditsTab projectId="prj-0001" /></MemoryRouter>);
    expect(screen.getByText('ยังไม่มีเครดิตที่ออกให้โปรเจกต์นี้')).toBeInTheDocument();
  });

  it('lists batches with total, serial range and on-chain links', () => {
    useStore.setState({
      tokens: [{
        id: 'token:x:1', token_id: '0.0.9911', serial_number: 1, project_id: 'prj-0001',
        credential_id: 'urn:vc:abc', amount_tco2e: 263.35,
        monitoring_period_start: '2026-01-01', monitoring_period_end: '2026-07-31',
        minted_at: '2026-08-04T10:11:00Z', minted_by_role: 'admin',
        hcs: { topic_id: '0.0.1', sequence_number: 4, explorer_url: 'x' },
        batch: { serial_start: 1, serial_end: 26335, units: 26335,
          erc1155: { address: '0xEF87e486b77D6ed63BE632a731b73aE1225F1130', id: 2, tx_hash: '0xabc' } },
      }],
    });
    render(<MemoryRouter><ProjectCreditsTab projectId="prj-0001" /></MemoryRouter>);
    expect(screen.getByText('263.35')).toBeInTheDocument();
    expect(screen.getByText(/serials 1–26,335/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /HTS 0.0.9911/ })).toHaveAttribute('href', 'https://hashscan.io/testnet/token/0.0.9911');
    expect(screen.getByRole('link', { name: /ERC-1155 id 2/ })).toBeInTheDocument();
  });
});
