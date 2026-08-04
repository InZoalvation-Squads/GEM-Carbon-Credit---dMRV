import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuditLogPage } from './AuditLog';
import { seedDemo } from '../test/demoFixtures';

beforeEach(() => seedDemo());

function renderPage() {
  return render(<MemoryRouter><AuditLogPage /></MemoryRouter>);
}

describe('AuditLog — readable labels instead of raw enums', () => {
  it('shows action badges as readable labels, never SCREAMING_SNAKE', () => {
    renderPage();
    // Fixture aud-0020 is PROJECT_REGISTERED.
    expect(screen.getAllByText('Project Registered').length).toBeGreaterThan(0);
    expect(screen.queryByText('PROJECT_REGISTERED')).toBeNull();
    expect(screen.queryByText('PDD_REVISION_REQUESTED')).toBeNull();
  });

  it('resolves the affected entity to a human name (PDD row → its project name)', () => {
    renderPage();
    // aud-0020: entity_type 'pdd', entity_id 'PDD-2001' → prj-0002 Korat Wind Farm.
    expect(screen.getAllByText('Korat Wind Farm').length).toBeGreaterThan(0);
  });

  it('shows a proper empty state when filters match nothing', () => {
    renderPage();
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2099-01-01' } });
    expect(screen.getByText('No matching entries')).toBeInTheDocument();
    expect(screen.getByText(/filter/i)).toBeInTheDocument(); // guidance mentions the filters
  });
});
