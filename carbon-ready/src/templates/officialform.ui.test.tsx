import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { OfficialForm } from './OfficialForm';
import { seedDemo } from '../test/demoFixtures';

beforeEach(() => { localStorage.clear(); seedDemo(); });

function renderAt(pddId: string) {
  return render(
    <MemoryRouter initialEntries={[`/registration/${pddId}/official`]}>
      <Routes><Route path="/registration/:pddId/official" element={<OfficialForm />} /></Routes>
    </MemoryRouter>,
  );
}

describe('OfficialForm dispatcher', () => {
  it('renders the T-VER form for a T-VER-S-F001-PDD methodology pdd', () => {
    renderAt('PDD-2000');
    // T-VER template renders the TGO form code somewhere on every page
    expect(screen.getAllByText(/T-VER/).length).toBeGreaterThan(0);
  });

  it('shows an empty state for a pdd whose methodology has no template', () => {
    renderAt('PDD-2005'); // forestry — no document_template
    expect(screen.getByText(/ไม่มีฟอร์มทางการ|No official form/i)).toBeInTheDocument();
  });

  it('shows an empty state for an unknown pdd id', () => {
    renderAt('PDD-nope');
    expect(screen.getByText(/not found|ไม่พบ/i)).toBeInTheDocument();
  });

  it('renders the Evident SF-02 form for a REC (EVIDENT-SF-02) methodology pdd', () => {
    renderAt('PDD-2009');
    expect(screen.getByText('EC-IRE-SF02')).toBeInTheDocument();
  });
});
