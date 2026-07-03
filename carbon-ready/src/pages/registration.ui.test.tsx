import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { RegistrationGate } from '../components/RegistrationGate';
import { PddDocument } from '../pages/PddDocument';
import { useStore } from '../store';

beforeEach(() => useStore.getState().resetToSeed());

function renderPdd(pddId: string) {
  return render(
    <MemoryRouter initialEntries={[`/pdd/${pddId}`]}>
      <Routes>
        <Route path="/pdd/:pddId" element={<PddDocument />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('PDD form renders per-methodology schema', () => {
  it('renders a forestry methodology PDD with its own fields, not Solar fields', () => {
    // PDD-2103 (Nan Watershed Reforestation) uses the forestry methodology.
    renderPdd('PDD-2103');
    expect(screen.getByText(/Project area/i)).toBeInTheDocument();     // forestry projectField
    expect(screen.getByText(/Dominant species/i)).toBeInTheDocument(); // forestry projectField
    expect(screen.queryByText(/Installed capacity/i)).toBeNull();      // Solar-only field absent
    expect(screen.queryByText(/Performance ratio/i)).toBeNull();       // Solar-only field absent
  });

  it('renders a Solar methodology PDD with Solar-specific fields', () => {
    // PDD-2000 (Pune Rooftop) uses the Solar methodology.
    renderPdd('PDD-2000');
    expect(screen.getByText(/Installed capacity/i)).toBeInTheDocument(); // Solar computed field
    expect(screen.queryByText(/Dominant species/i)).toBeNull();         // forestry field absent
  });
});

describe('RegistrationGate', () => {
  it('blocks dMRV content for an unregistered project', () => {
    render(
      <MemoryRouter>
        <RegistrationGate projectId="prj-0003">
          <div>SECRET DMRV</div>
        </RegistrationGate>
      </MemoryRouter>,
    );
    expect(screen.queryByText('SECRET DMRV')).toBeNull();
    expect(screen.getByText(/not registered/i)).toBeInTheDocument();
  });

  it('renders dMRV content for a registered project', () => {
    render(
      <MemoryRouter>
        <RegistrationGate projectId="prj-0001">
          <div>SECRET DMRV</div>
        </RegistrationGate>
      </MemoryRouter>,
    );
    expect(screen.getByText('SECRET DMRV')).toBeInTheDocument();
  });
});
