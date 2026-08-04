import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { RegistrationGate } from '../components/project/RegistrationGate';
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

  it('offers exactly two cards: solar then forestry', () => {
    renderEntry();
    const cards = screen.getAllByRole('button', { name: /T-VER|VM00|AR-ACM/ });
    expect(cards).toHaveLength(2);
    expect(cards[0]).toHaveTextContent('T-VER-S-01');
    expect(cards[1]).toHaveTextContent('T-VER-F-01');
    expect(screen.queryByText(VERRA_VM0042_METHODOLOGY.code)).toBeNull();
  });

  it('clicking a card pops up the modal; with no eligible projects it opens straight on the create form', () => {
    renderEntry();
    expect(screen.queryByText(/Start PDD —/)).toBeNull();

    // Every fixture project is registered or bound to another methodology, so
    // the solar track has nothing eligible → create-project form comes first.
    fireEvent.click(screen.getByRole('button', { name: /T-VER-S-01/ }));
    expect(screen.getByText('Start PDD — T-VER-S-01')).toBeInTheDocument();
    expect(screen.getByLabelText('Project Name')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Ubon Regenerative Rice/ })).toBeNull();
  });

  it('create & start: makes the project, opens its PDD editor', async () => {
    renderEntry();
    fireEvent.click(screen.getByRole('button', { name: /T-VER-F-01/ }));
    fireEvent.change(screen.getByLabelText('Project Name'), { target: { value: 'ป่าชุมชนทดสอบ' } });
    fireEvent.change(screen.getByLabelText('Location'), { target: { value: 'Nan, Thailand' } });
    fireEvent.click(screen.getByRole('button', { name: /Create & Start PDD/ }));

    await screen.findByText(/Register: ป่าชุมชนทดสอบ/);
    const st = useStore.getState();
    const project = st.projects.find((p) => p.name === 'ป่าชุมชนทดสอบ')!;
    expect(project.capacity_kwp).toBe(0); // land-based prefill
    const pdd = st.pdds.find((d) => d.project_id === project.id)!;
    expect(pdd.methodology_id).toBe('meth-tver-forestry');
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

    // Section A now holds two table fields (installations + equipment_specs);
    // the installations editor renders first.
    fireEvent.click(screen.getAllByRole('button', { name: /เพิ่มแถว/ })[0]);
    expect(screen.getAllByPlaceholderText('พื้นที่ติดตั้ง').length).toBe(1);
    fireEvent.click(screen.getAllByRole('button', { name: /เพิ่มแถว/ })[0]);
    expect(screen.getAllByPlaceholderText('พื้นที่ติดตั้ง').length).toBe(2);

    fireEvent.change(screen.getAllByPlaceholderText('พื้นที่ติดตั้ง')[0], { target: { value: 'อาคาร 1' } });
    expect(screen.getByDisplayValue('อาคาร 1')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'ลบแถว 2' }));
    expect(screen.getAllByPlaceholderText('พื้นที่ติดตั้ง').length).toBe(1);
    expect(screen.getByDisplayValue('อาคาร 1')).toBeInTheDocument();
  });
});
