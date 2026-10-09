import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Methodologies } from './Methodologies';
import { seedDemo } from '../test/demoFixtures';
import { useStore } from '../store';
import { ALL_METHODOLOGIES, REC_SOLAR_METHODOLOGY } from '../data/methodologies';
import { methodologyToJson } from '../lib/methodology-schema';
import type { Methodology } from '../types';

beforeEach(() => seedDemo());

function renderMethodologies() {
  return render(
    <MemoryRouter>
      <Methodologies />
    </MemoryRouter>,
  );
}

function openPanelFor(code: string) {
  fireEvent.click(screen.getByRole('button', { name: code }));
}

describe('Methodologies — detail panel (project owner view)', () => {
  it('shows what the methodology is for next to its name for SF-02', () => {
    renderMethodologies();
    openPanelFor('SF-02');
    expect(screen.getByText('What this methodology is for')).toBeInTheDocument();
    const usage = screen.getByTestId('methodology-usage');
    expect(usage.textContent).toMatch(/I-REC\(E\)/);
    expect(usage.textContent).toMatch(/EGAT/);
  });

  it('shows no code links, source paths or developer notes', () => {
    renderMethodologies();
    openPanelFor('SF-02');
    fireEvent.click(screen.getByRole('button', { name: /2\. Registrant Contact Details/i }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).queryAllByRole('link')).toHaveLength(0);
    expect(dialog.textContent).not.toMatch(
      /carbon-ready\/|\.tsx?\b|github|Code references|Guardian (policy|schema|issuance)|buildPddSubject|issueCredential|generic (PDD )?editor|bundled code definition/i,
    );
  });

  it('an imported methodology without bundled files opens with no developer notes', () => {
    const bare: Methodology = {
      ...REC_SOLAR_METHODOLOGY,
      id: 'meth-fixture-bare',
      code: 'FIX-BARE',
      name: 'Imported methodology (no bundled artifacts)',
      document_template: undefined,
      usage: undefined,
      source_path: undefined,
    };
    // Append to the store so the row renders.
    useStore.setState({ methodologies: [...useStore.getState().methodologies, bare] });
    renderMethodologies();
    openPanelFor('FIX-BARE');

    expect(screen.queryByTestId('methodology-usage')).not.toBeInTheDocument();
    expect(screen.queryByText('What this methodology is for')).not.toBeInTheDocument();
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).queryAllByRole('link')).toHaveLength(0);
    expect(dialog.textContent).not.toMatch(/bundled code definition|Guardian policy|generic (PDD )?editor/i);
    expect(within(dialog).getByText('What you will fill in')).toBeInTheDocument();
  });

  it('explains the formula in plain words and marks the reading that drives it', () => {
    renderMethodologies();
    openPanelFor('SF-02');

    const formula = screen.getByTestId('methodology-formula');
    expect(formula.textContent).toMatch(/EG_PJ/);
    expect(formula.textContent).toMatch(/EF_grid/);
    expect(formula.textContent).toMatch(/÷ 1000/);
    expect(formula.textContent).toMatch(
      /Each reading of net electricity produced by the facility \(EG_PJ\), in kWh, is multiplied by the grid emission factor/,
    );
    expect(formula.textContent).toMatch(/divided by 1,000 to turn kilograms into tonnes of CO₂e/);

    const egPj = screen.getByTestId('monitoring-param-EG_PJ');
    expect(egPj.textContent).toMatch(/Measured in kWh · Monthly · How: Revenue-grade meter/);
    expect(within(egPj).getByText('Used to calculate the emission reduction')).toBeInTheDocument();
  });

  it('describes a stock-change methodology as a total of the reported values', () => {
    renderMethodologies();
    openPanelFor('T-VER-F-01');

    expect(screen.getByTestId('methodology-formula').textContent).toMatch(
      /Change in tree carbon stock \(dC_tree\) is already reported in tCO₂e for each reporting period/,
    );
    expect(within(screen.getByTestId('monitoring-param-A_planted')).queryByText(/Used to calculate/)).not.toBeInTheDocument();
  });

  it('expands a PDD section to list what it asks for, in plain labels, and keeps others collapsed', () => {
    renderMethodologies();
    openPanelFor('SF-02');

    const toggle = screen.getByRole('button', {
      name: /2\. Registrant Contact Details/i,
    });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const section = document.getElementById(toggle.getAttribute('aria-controls')!)!;
    // Field labels render; internal field keys and input types do not.
    expect(within(section).getByText('Organisation name')).toBeInTheDocument();
    expect(section.textContent).not.toMatch(/organisation_name|evident_org_id/);
    expect(within(section).getAllByText(/^(Required|Optional|Filled in automatically)$/).length).toBeGreaterThan(0);

    // Click again to collapse.
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(document.getElementById(toggle.getAttribute('aria-controls')!)).toBeNull();
  });

  it('an imported methodology keeps its usage line', () => {
    useStore.setState({ currentUser: { ...useStore.getState().currentUser, role: 'admin' } });
    const exported = JSON.parse(methodologyToJson(REC_SOLAR_METHODOLOGY)) as Record<string, unknown>;
    expect(exported).not.toHaveProperty('source_path');
    const legacy = JSON.stringify({
      ...exported,
      code: 'SF-02-IMPORTED',
      source_path: REC_SOLAR_METHODOLOGY.source_path,
    });
    const r = useStore.getState().importMethodology(legacy);
    expect(r.ok).toBe(true);
    expect(r.methodology?.source_path).toBeUndefined();

    renderMethodologies();
    openPanelFor('SF-02-IMPORTED');
    expect(screen.getByTestId('methodology-usage').textContent).toBe(REC_SOLAR_METHODOLOGY.usage);
  });

  it('every bundled methodology carries a usage line and a source_path', () => {
    // Guard against drift: future methodologies added to the registry should
    // either ship the handoff metadata or document on this test why they skip it.
    // Iterate the product catalog only: the demo seed also loads test-only
    // fixture methodologies, which are not bundled definitions.
    const skipIds = new Set<string>();
    for (const m of ALL_METHODOLOGIES) {
      if (skipIds.has(m.id)) continue;
      expect(m.usage, `${m.code} missing usage`).toBeTruthy();
      expect(m.source_path, `${m.code} missing source_path`).toBeTruthy();
    }
  });
});
