import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { RegistrationGate } from '../components/RegistrationGate';
import { PddDocument } from '../pages/PddDocument';
import { Registration } from '../pages/Registration';
import { VERRA_VM0042_METHODOLOGY } from '../data/methodologies';
import { seedDemo } from '../test/demoFixtures';
import { useStore } from '../store';

beforeEach(() => seedDemo());

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
    // PDD-2005 (Nan Watershed Reforestation) uses the forestry methodology.
    renderPdd('PDD-2005');
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

describe('Registration entry — project list scoped to selected methodology', () => {
  function renderEntry() {
    return render(
      <MemoryRouter initialEntries={['/registration']}>
        <Routes>
          <Route path="/registration" element={<Registration />} />
          <Route path="/registration/:pddId" element={<Registration />} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it('lists a draft project only under its own methodology', () => {
    // prj-0004 (Ubon Regenerative Rice) is a pdd_draft under the VM0042 methodology.
    // The default selection is Solar, so the draft must be hidden.
    renderEntry();
    expect(screen.queryByRole('option', { name: 'Ubon Regenerative Rice' })).toBeNull();

    // Switching to VM0042 (its own methodology) must reveal it.
    fireEvent.change(screen.getByLabelText('Methodology'), { target: { value: VERRA_VM0042_METHODOLOGY.id } });
    expect(screen.getByRole('option', { name: 'Ubon Regenerative Rice' })).toBeInTheDocument();
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

describe('table field editor', () => {
  it('adds and removes rows on a table field (installations, section A)', () => {
    // Point the editable draft project at the Solar methodology so the
    // extended T-VER-S-F001 sections (incl. table fields) render.
    const pdd = useStore.getState().selectMethodology('prj-0004', 'meth-tver-solar');
    render(
      <MemoryRouter initialEntries={[`/registration/${pdd.id}`]}>
        <Routes><Route path="/registration/:pddId" element={<Registration />} /></Routes>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'A.' }));
    expect(screen.getByText('อุปกรณ์หลักที่ติดตั้งรายอาคาร')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /เพิ่มแถว/ }));
    expect(screen.getAllByPlaceholderText('พื้นที่ติดตั้ง').length).toBe(1);
    fireEvent.click(screen.getByRole('button', { name: /เพิ่มแถว/ }));
    expect(screen.getAllByPlaceholderText('พื้นที่ติดตั้ง').length).toBe(2);

    fireEvent.change(screen.getAllByPlaceholderText('พื้นที่ติดตั้ง')[0], { target: { value: 'อาคาร 1' } });
    expect(screen.getByDisplayValue('อาคาร 1')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'ลบแถว 2' }));
    expect(screen.getAllByPlaceholderText('พื้นที่ติดตั้ง').length).toBe(1);
    expect(screen.getByDisplayValue('อาคาร 1')).toBeInTheDocument();
  });
});
