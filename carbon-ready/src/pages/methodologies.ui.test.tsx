import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Methodologies } from './Methodologies';
import { seedDemo } from '../test/demoFixtures';
import { useStore } from '../store';
import { REC_SOLAR_METHODOLOGY } from '../data/methodologies';
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

describe('Methodologies — detail panel (developer handoff)', () => {
  it('shows the hand-written usage line next to the methodology name for SF-02', () => {
    renderMethodologies();
    openPanelFor('SF-02');
    const usage = screen.getByTestId('methodology-usage');
    expect(usage.textContent).toMatch(/I-REC\(E\)/);
    expect(usage.textContent).toMatch(/EGAT/);
  });

  it('links the official-form renderer and the methodology source file', () => {
    renderMethodologies();
    openPanelFor('SF-02');

    expect(screen.getByText('Methodology definition:')).toBeInTheDocument();
    expect(screen.queryByText(/Policy \/ schema|Guardian-policy equivalent/)).not.toBeInTheDocument();
    const schemaLink = screen.getByRole('link', {
      name: /carbon-ready\/src\/data\/methodologies\/rec-solar\.ts/i,
    });
    expect(schemaLink.getAttribute('href')).toMatch(
      /github\.com\/InZoalvation-Squads\/GEM-Carbon-Credit---dMRV\/blob\/feat\/sprint-1-mvp\/carbon-ready\/src\/data\/methodologies\/rec-solar\.ts$/,
    );

    const formLink = screen.getByRole('link', {
      name: /carbon-ready\/src\/templates\/EvidentSF02\.tsx/i,
    });
    expect(formLink.getAttribute('href')).toMatch(
      /\/carbon-ready\/src\/templates\/EvidentSF02\.tsx$/,
    );
    // The template code travels alongside the link so devs recognize the renderer.
    expect(screen.getByText(/EVIDENT-SF-02/)).toBeInTheDocument();
  });

  it('links the Guardian schema and issuance code and states there is no Guardian policy file', () => {
    renderMethodologies();
    openPanelFor('SF-02');

    expect(
      screen.getByRole('link', { name: /carbon-ready\/src\/lib\/guardian-schema\.ts/ }).getAttribute('href'),
    ).toMatch(/\/blob\/feat\/sprint-1-mvp\/carbon-ready\/src\/lib\/guardian-schema\.ts$/);
    expect(screen.getByText(/PDD_REGISTRATION_SCHEMA_V1/)).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /carbon-ready\/src\/lib\/guardian\.ts/ }).getAttribute('href'),
    ).toMatch(/\/carbon-ready\/src\/lib\/guardian\.ts$/);
    expect(screen.getByTestId('no-guardian-policy').textContent).toMatch(/no Guardian policy file in this repo/);
  });

  it('an expanded section chip links the code that implements that section', () => {
    renderMethodologies();
    openPanelFor('SF-02');
    fireEvent.click(screen.getByRole('button', { name: /2\. Registrant Contact Details/i }));

    const impl = screen.getByTestId(/^section-impl-/);
    expect(
      within(impl).getByRole('link', { name: /carbon-ready\/src\/templates\/EvidentSF02\.tsx/ }),
    ).toBeInTheDocument();
    expect(
      within(impl).getByRole('link', { name: /carbon-ready\/src\/pages\/Registration\.tsx/ }),
    ).toBeInTheDocument();
    expect(within(impl).queryByText(/No dedicated renderer/)).not.toBeInTheDocument();
  });

  it('renders the ER formula and tags the driver monitoring parameter', () => {
    renderMethodologies();
    openPanelFor('SF-02');

    const formula = screen.getByTestId('methodology-formula');
    expect(formula.textContent).toMatch(/EG_PJ/);
    expect(formula.textContent).toMatch(/EF_grid/);
    expect(formula.textContent).toMatch(/÷ 1000/);

    const egPj = screen.getByTestId('monitoring-param-EG_PJ');
    expect(within(egPj).getByText(/Driver/)).toBeInTheDocument();
  });

  it('expands a PDD section chip to reveal its fields and keeps others collapsed', () => {
    renderMethodologies();
    openPanelFor('SF-02');

    // Collapsed by default — fields are not in the DOM.
    expect(screen.queryByText(/organisation_name/)).not.toBeInTheDocument();

    const toggle = screen.getByRole('button', {
      name: /2\. Registrant Contact Details/i,
    });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    // Field keys from the SF-02 "Registrant Contact Details" section render verbatim.
    expect(screen.getByText('organisation_name')).toBeInTheDocument();
    expect(screen.getByText('evident_org_id')).toBeInTheDocument();

    // Click again to collapse.
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('organisation_name')).not.toBeInTheDocument();
  });

  it('falls back to the generic PDD editor path for a methodology without usage or document_template', () => {
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
    expect(
      screen.getByText(/No official-form template bound/i),
    ).toBeInTheDocument();
    expect(screen.queryByText('Methodology definition:')).not.toBeInTheDocument();
    // The generic editor path is linked so onboarding devs still land somewhere real.
    expect(
      screen.getByRole('link', { name: /carbon-ready\/src\/pages\/PddDocument\.tsx/ }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /2\. Registrant Contact Details/i }));
    const impl = screen.getByTestId(/^section-impl-/);
    expect(within(impl).getByText(/No dedicated renderer for this section/)).toBeInTheDocument();
    expect(
      within(impl).getByRole('link', { name: /carbon-ready\/src\/pages\/PddDocument\.tsx/ }),
    ).toBeInTheDocument();
  });

  it('every bundled methodology carries a usage line and a source_path', () => {
    // Guard against drift: future methodologies added to the registry should
    // either ship the handoff metadata or document on this test why they skip it.
    const skipIds = new Set<string>();
    for (const m of useStore.getState().methodologies) {
      if (skipIds.has(m.id)) continue;
      expect(m.usage, `${m.code} missing usage`).toBeTruthy();
      expect(m.source_path, `${m.code} missing source_path`).toBeTruthy();
    }
  });
});
