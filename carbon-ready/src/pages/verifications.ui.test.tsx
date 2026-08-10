import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Verifications } from './Verifications';
import { seedDemo } from '../test/demoFixtures';
import { useStore } from '../store';

beforeEach(() => seedDemo());

function renderPage() {
  return render(<MemoryRouter><Verifications /></MemoryRouter>);
}

describe('Verifications list — project name leads each row', () => {
  it('the package cell (always visible) carries the project name, not just the raw id', () => {
    renderPage();
    // VR-1001/VR-1002 (open states) belong to prj-0001 "Pune Rooftop Phase 1" —
    // the row button itself must name the project so mobile users see it.
    const rowButtons = screen.getAllByRole('button', { name: /Pune Rooftop Phase 1/ });
    expect(rowButtons.length).toBeGreaterThan(0);
  });
});

describe('Verifications list — empty filter result explains itself', () => {
  it('shows an empty state instead of a bare table when a filter matches nothing', () => {
    useStore.setState({ verifications: [] });
    renderPage();
    expect(screen.getByText(/No packages/i)).toBeInTheDocument();
  });
});
