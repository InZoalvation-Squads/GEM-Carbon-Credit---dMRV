import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TverSF001Pdd } from './TverSF001Pdd';
import { seedDemo } from '../test/demoFixtures';
import { useStore } from '../store';

beforeEach(() => { localStorage.clear(); seedDemo(); });

// PDD-2000 = registered solar PDD in the demo fixtures; enrich it with the
// official-form data the template renders.
function seedOfficialData() {
  const pdd = useStore.getState().pdds.find((p) => p.id === 'PDD-2000')!;
  pdd.section_data = {
    ...pdd.section_data,
    project_title_th: 'โครงการทดสอบพลังงานแสงอาทิตย์',
    project_title_en: 'Test Solar Project',
    project_owner: 'บริษัท ทดสอบ จำกัด',
    investment_mthb: 30,
    year1_generation_kwh: 963915,
    degradation_pct: 0.4,
    crediting_years: '7',
    crediting_start: '2026-01-01',
    consumers: [{ equipment: 'Smart Logger', rated_w: 40, hours_per_year: 8760 }],
    installations: [{ building: 'อาคารทดสอบ 1', coordinates: '13.61, 99.58', panels: 288, inverters: 5, kwp: 200.16 }],
    registered_elsewhere: 'ไม่มี',
  };
}

function renderDoc() {
  return render(<MemoryRouter><TverSF001Pdd pddId="PDD-2000" /></MemoryRouter>);
}

describe('TverSF001Pdd official template', () => {
  it('renders the TGO form frame and cover values', () => {
    seedOfficialData();
    renderDoc();
    expect(screen.getAllByText('T-VER-S-F001-PDD').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/VERSION 2.1/).length).toBeGreaterThan(0);
    expect(screen.getByText('โครงการทดสอบพลังงานแสงอาทิตย์')).toBeInTheDocument();
    expect(screen.getAllByText(/ขนาดโครงการ/).length).toBeGreaterThan(0);
    expect(screen.getByText('อาคารทดสอบ 1')).toBeInTheDocument();
  });

  it('renders the crediting-period yearly table with computed rows', () => {
    seedOfficialData();
    renderDoc();
    const table = screen.getByTestId('yearly-table');
    expect(table).toBeInTheDocument();
    // 7 crediting years + header/total/avg rows
    expect(table.querySelectorAll('tbody tr').length).toBeGreaterThanOrEqual(7);
  });

  it('renders the consumers appendix with the EC_PJ total', () => {
    seedOfficialData();
    renderDoc();
    expect(screen.getByText('Smart Logger')).toBeInTheDocument();
    expect(screen.getByTestId('ecpj-total').textContent).toContain('350.40');
  });
});
