import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Calculations } from './Calculations';
import { seedDemo } from '../test/demoFixtures';
import { useStore } from '../store';

beforeEach(() => seedDemo());

function renderPage() {
  return render(<MemoryRouter><Calculations /></MemoryRouter>);
}

async function pickProject(id: string) {
  fireEvent.change(screen.getByLabelText('Project'), { target: { value: id } });
}

describe('Calculations — readable output', () => {
  it('monthly table shows "May 2026", not the raw "2026-05"', async () => {
    renderPage();
    await pickProject('prj-0001'); // registered, has monitoring records
    await waitFor(() => expect(screen.getAllByText(/[A-Z][a-z]{2} 20\d\d/).length).toBeGreaterThan(0));
    expect(screen.queryByText(/^20\d\d-\d\d$/)).toBeNull();
  });

  it('explains itself when a registered project has no monitoring data yet', async () => {
    useStore.setState((s) => ({ records: s.records.filter((r) => r.project_id !== 'prj-0001') }));
    renderPage();
    await pickProject('prj-0001');
    await waitFor(() => expect(screen.getByText(/No monitoring data/i)).toBeInTheDocument());
  });
});
