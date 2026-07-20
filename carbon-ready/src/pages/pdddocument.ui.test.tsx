import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PddDocument } from './PddDocument';
import { seedDemo } from '../test/demoFixtures';

beforeEach(() => {
  localStorage.clear();
  seedDemo();
});

// PDD-2000 (solar, registered) carries barrier_explanation + investment_metric.
function renderDoc() {
  return render(<MemoryRouter><PddDocument pddId="PDD-2000" /></MemoryRouter>);
}

describe('PddDocument selective disclosure', () => {
  it('marks sensitive fields with a Restricted chip', () => {
    renderDoc();
    expect(screen.getAllByText(/Restricted/i).length).toBeGreaterThan(0);
  });

  it('Public view masks sensitive values', () => {
    renderDoc();
    expect(screen.getByText((t) => t.includes('developer hurdle rate'))).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Public view/i }));
    expect(screen.queryByText((t) => t.includes('developer hurdle rate'))).toBeNull();
    expect(screen.getAllByText('•••').length).toBeGreaterThan(0);
  });
});
