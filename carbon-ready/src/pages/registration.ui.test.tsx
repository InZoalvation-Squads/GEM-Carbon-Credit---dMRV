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

describe('PDD editor — draft boilerplate for activity fields', () => {
  it('fills after_project with TGO-style text composed from project data', async () => {
    const { useStore } = await import('../store');
    // PDD-2000 (Pune Rooftop, solar) — flip to draft so the wizard is editable.
    useStore.setState((st) => ({
      pdds: st.pdds.map((p) => (p.id === 'PDD-2000' ? { ...p, state: 'draft' as const } : p)),
      projects: st.projects.map((p) => (p.id === 'prj-0001' ? { ...p, lifecycle_stage: 'pdd_draft' as const } : p)),
    }));
    render(
      <MemoryRouter initialEntries={['/registration/PDD-2000']}>
        <Routes><Route path="/registration/:pddId" element={<Registration />} /></Routes>
      </MemoryRouter>,
    );
    // jump straight to the section that carries the activity textareas
    fireEvent.click(screen.getByRole('button', { name: /^A\.$/ })); // step chips show the title's first word
    void useStore;
    const buttons = screen.getAllByText(/ร่างข้อความให้จากข้อมูลโครงการ/);
    expect(buttons.length).toBe(2); // before_project + after_project
    fireEvent.click(buttons[1]); // after_project is the later field
    const areas = Array.from(document.querySelectorAll('textarea')).map((t) => t.value).join('\n');
    expect(areas).toContain('ขนาดติดตั้ง'); // ¶2 installation facts
    expect(areas).toContain('AEDP2015');   // ¶1 policy boilerplate
    expect(areas).toContain('การไฟฟ้าส่วนภูมิภาค'); // non-MEA address → PEA default

  });
});

describe('PDD editor — auto-save', () => {
  it('saves the draft automatically after the user stops typing, with no Save-draft button', async () => {
    const { api } = await import('../lib/api');
    const { vi } = await import('vitest');
    const { act } = await import('@testing-library/react');
    const spy = vi.spyOn(api, 'savePddDraft').mockResolvedValue(undefined);
    const { useStore } = await import('../store');
    useStore.setState((st) => ({
      pdds: st.pdds.map((p) => (p.id === 'PDD-2000' ? { ...p, state: 'draft' as const } : p)),
      projects: st.projects.map((p) => (p.id === 'prj-0001' ? { ...p, lifecycle_stage: 'pdd_draft' as const } : p)),
    }));
    vi.useFakeTimers();
    try {
      render(
        <MemoryRouter initialEntries={['/registration/PDD-2000']}>
          <Routes><Route path="/registration/:pddId" element={<Registration />} /></Routes>
        </MemoryRouter>,
      );
      expect(screen.queryByRole('button', { name: /Save draft/i })).toBeNull();
      const area = document.querySelector('textarea')!;
      fireEvent.change(area, { target: { value: 'แก้ไขข้อความทดสอบ' } });
      expect(spy).not.toHaveBeenCalled(); // debounced — not on every keystroke
      await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
      expect(spy).toHaveBeenCalledTimes(1);
      // once saved and unchanged, no repeat save fires
      await act(async () => { await vi.advanceTimersByTimeAsync(4000); });
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
      vi.restoreAllMocks();
    }
  });
});

describe('New-PDD prefill & clone-from-previous', () => {
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

  it('seeds methodology-standard defaults into a fresh solar PDD', async () => {
    renderEntry();
    fireEvent.click(screen.getByRole('button', { name: /T-VER-S-01/ }));
    fireEvent.change(screen.getByLabelText('Project Name'), { target: { value: 'โซลาร์ทดสอบดีฟอลต์' } });
    fireEvent.change(screen.getByLabelText('Location'), { target: { value: 'Khon Kaen, Thailand' } });
    fireEvent.change(screen.getByLabelText('Capacity (kWp)'), { target: { value: '100' } });
    fireEvent.click(screen.getByRole('button', { name: /Create & Start PDD/ }));
    await screen.findByText(/Register: โซลาร์ทดสอบดีฟอลต์/);

    const st = useStore.getState();
    const project = st.projects.find((p) => p.name === 'โซลาร์ทดสอบดีฟอลต์')!;
    const pdd = st.pdds.find((d) => d.project_id === project.id)!;
    expect(pdd.section_data.technology).toBe('Solar PV rooftop');
    expect(pdd.section_data.baseline_scenario).toBe('Grid electricity displaced by solar generation');
    expect(pdd.section_data.registered_elsewhere).toBe('ไม่มี');
    expect(pdd.section_data.monitoring_frequency).toBe('Monthly');
    expect(pdd.section_data.project_title_th).toBeUndefined(); // ไม่มีการเดา fact เฉพาะไซต์
  });

  it('clone: carries shared fields, blanks site-specific and draftable ones', async () => {
    // source: draft solar PDD ของ prj-0004 พร้อมข้อมูล
    const src = useStore.getState().selectMethodology('prj-0004', 'meth-tver-solar');
    useStore.getState().savePddDraft(src.id, {
      preparer_name: 'สมชาย ทดสอบ',
      project_title_th: 'ไซต์เก่า',
      before_project: 'ข้อความของไซต์เก่า',
    }, []);

    renderEntry();
    fireEvent.click(screen.getByRole('button', { name: /T-VER-S-01/ }));
    // เลือกแหล่ง clone (select โผล่เพราะมี PDD solar ที่มีข้อมูลอยู่)
    fireEvent.change(screen.getByLabelText(/คัดลอกข้อมูลจากโครงการก่อนหน้า/), { target: { value: src.id } });
    // prj-0004 มี draft solar อยู่ → modal เปิดโหมด pick; สลับไปฟอร์มสร้างโปรเจกต์ใหม่ก่อน
    fireEvent.click(screen.getByRole('button', { name: /Create a new project/ }));
    fireEvent.change(screen.getByLabelText('Project Name'), { target: { value: 'โซลาร์ทดสอบโคลน' } });
    fireEvent.change(screen.getByLabelText('Location'), { target: { value: 'Rayong, Thailand' } });
    fireEvent.change(screen.getByLabelText('Capacity (kWp)'), { target: { value: '250' } });
    fireEvent.click(screen.getByRole('button', { name: /Create & Start PDD/ }));
    await screen.findByText(/Register: โซลาร์ทดสอบโคลน/);

    const st = useStore.getState();
    const project = st.projects.find((p) => p.name === 'โซลาร์ทดสอบโคลน')!;
    const pdd = st.pdds.find((d) => d.project_id === project.id)!;
    expect(pdd.section_data.preparer_name).toBe('สมชาย ทดสอบ');   // ติดมา
    expect(pdd.section_data.project_title_th).toBeUndefined();      // siteSpecific → ว่าง
    expect(pdd.section_data.before_project).toBeUndefined();        // draftable → ว่าง (ให้กด ✨ ร่างใหม่)
    expect(pdd.section_data.technology).toBe('Solar PV rooftop');   // defaults ยังเติมส่วนที่ clone ไม่มี
    expect(pdd.evidence_ids).toEqual([]);                           // evidence ไม่ copy
  });
});
