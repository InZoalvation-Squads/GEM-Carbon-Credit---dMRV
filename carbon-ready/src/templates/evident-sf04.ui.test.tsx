import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { EvidentSF04 } from './EvidentSF04';
import { RecIssueOfficialForm } from './RecIssueOfficialForm';
import { seedDemo } from '../test/demoFixtures';

beforeEach(() => { localStorage.clear(); seedDemo(); });
const renderForm = (id: string) => render(<MemoryRouter><EvidentSF04 recIssueId={id} /></MemoryRouter>);

describe('Evident SF-04 official form', () => {
  it('renders cover + document control + footer identity', () => {
    renderForm('RIR-1000');
    expect(screen.getAllByText(/SF-04: Issue Request/).length).toBeGreaterThan(0);
    expect(screen.getByText('EC-IRE-SF04')).toBeInTheDocument();
    expect(screen.getAllByText(/Copyright © Evident Ev Limited/).length).toBeGreaterThan(0);
  });

  it('fills registrant/facility/receiving values from the request', () => {
    renderForm('RIR-1000');
    expect(screen.getByText('EVID-000456')).toBeInTheDocument(); // evident_org_id
    // organisation_name (§1.2) and receiving_org_name (§1.6) are both
    // 'GreenGrid Asia Co., Ltd.' for RIR-1000 — appears at least twice.
    expect(screen.getAllByText('GreenGrid Asia Co., Ltd.').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Ayutthaya Solar REC Facility')).toBeInTheDocument(); // facility_name
    expect(screen.getByText('EVID-ACC-000456')).toBeInTheDocument(); // receiving_account_id
  });

  it('renders §1.2 Facility ID/code from the request', () => {
    renderForm('RIR-1000');
    // RIR-1000 fixture carries facility_id 'DEMO-FAC-0001' (requested_labels
    // is '' and must stay a blank cell — no placeholder text like '-').
    expect(screen.getByText('DEMO-FAC-0001')).toBeInTheDocument();
    const labelsRow = screen.getByText('Requested Labels').closest('.doc-row') as HTMLElement;
    expect(within(labelsRow).queryByText('-')).not.toBeInTheDocument();
  });

  it('marks the request type with ☑ and shows the MWh digit grid', () => {
    renderForm('RIR-1000');
    expect(screen.getByTestId('mwh-grid')).toBeInTheDocument();
    // fixture RIR-1000 is 'Normal' → ☑ Normal / ☐ Self consumption
    expect(screen.getByText('☑ Normal')).toBeInTheDocument();
    expect(screen.getByText('☐ Self consumption')).toBeInTheDocument();
  });

  it('always shows SF-04A and never renders SF-04B/SF-04C pages (Contents/Introduction may mention them)', () => {
    renderForm('RIR-1000');
    expect(screen.getAllByText(/SF-04A: Issuing Declaration/).length).toBeGreaterThan(0);
    // SF-04B appears twice in static boilerplate — the Contents TOC line and
    // the Introduction's verbatim paragraph naming the form (PDF page III/III)
    // — never as an actual section heading/page. SF-04C appears a third time
    // in the verbatim §1.4 Fuel row hint ("...also complete SF-04C: Fuel
    // Consumption Statement)", PDF page 2/5) — also never as its own page.
    expect(screen.getAllByText(/SF-04B: Production Group Statement/)).toHaveLength(2);
    expect(screen.getAllByText(/SF-04C: Fuel Consumption Statement/)).toHaveLength(3);
  });
});

describe('RecIssueOfficialForm guard', () => {
  it('renders the form for a known id and an empty state for an unknown one', () => {
    render(<MemoryRouter><RecIssueOfficialForm recIssueId="RIR-1000" /></MemoryRouter>);
    expect(screen.getByText('EC-IRE-SF04')).toBeInTheDocument();
    render(<MemoryRouter><RecIssueOfficialForm recIssueId="RIR-nope" /></MemoryRouter>);
    expect(screen.getByText(/not found|ไม่พบ/i)).toBeInTheDocument();
  });
});
