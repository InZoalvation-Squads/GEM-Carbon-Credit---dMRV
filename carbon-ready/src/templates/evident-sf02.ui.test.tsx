import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { EvidentSF02 } from './EvidentSF02';
import { seedDemo } from '../test/demoFixtures';
import { useStore } from '../store';

beforeEach(() => { localStorage.clear(); seedDemo(); });
const renderForm = () => render(<MemoryRouter><EvidentSF02 pddId="PDD-2009" /></MemoryRouter>);

describe('Evident SF-02 official form', () => {
  it('renders cover + document control + footer identity', () => {
    renderForm();
    expect(screen.getAllByText(/I-REC Code for Electricity/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/SF-02: Production Facility Registration/).length).toBeGreaterThan(0);
    expect(screen.getByText('EC-IRE-SF02')).toBeInTheDocument();
    expect(screen.getAllByText(/Copyright © Evident Ev Limited/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Version: 1.4.1/).length).toBeGreaterThan(0);
  });

  it('fills registrant/facility values from section_data', () => {
    renderForm();
    expect(screen.getByText('EVID-000456')).toBeInTheDocument(); // evident_org_id
    expect(screen.getByText('GreenGrid Asia Co., Ltd.')).toBeInTheDocument(); // organisation_name
    expect(screen.getByText('Anong Siriwan')).toBeInTheDocument(); // contact_person
    expect(screen.getByText('Ayutthaya Solar REC Facility')).toBeInTheDocument(); // facility_name
    expect(screen.getByText('MTR-AYU-0800-01')).toBeInTheDocument(); // meter_ids
  });

  it('marks the selected registration type and Yes/No answers with ☑', () => {
    renderForm();
    // registration_type: 'New' — fixture value
    expect(screen.getByText('☑ New')).toBeInTheDocument();
    expect(screen.getByText('☐ Change of details')).toBeInTheDocument();
    // registrant_is_owner: 'Yes' in fixture
    expect(screen.getByText('☑ Yes')).toBeInTheDocument();
    expect(screen.getByText('☐ No')).toBeInTheDocument();
  });

  it('renders installed capacity as per-digit boxes', () => {
    renderForm();
    expect(screen.getByTestId('capacity-grid')).toBeInTheDocument();
  });

  it('always shows SF-02A; shows SF-02C only when registrant is not the owner', () => {
    renderForm();
    expect(screen.getAllByText(/SF-02A: Registrant.s Declaration/).length).toBeGreaterThan(0);
    // "SF-02C: Owner's Declaration" appears in static boilerplate (Contents, Introduction,
    // the §1.1 submitter-status hint) on every render; the SF-02C page itself only
    // renders when registrant_is_owner === 'No', so the count must go up when it appears.
    const baselineCount = screen.getAllByText(/SF-02C: Owner.s Declaration/).length; // fixture is 'Yes'
    const pdd = useStore.getState().pdds.find((p) => p.id === 'PDD-2009')!;
    pdd.section_data = { ...pdd.section_data, registrant_is_owner: 'No' };
    renderForm();
    expect(screen.getAllByText(/SF-02C: Owner.s Declaration/).length).toBeGreaterThan(baselineCount);
  });
});
