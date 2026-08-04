import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PddDocument } from './PddDocument';
import { pickCoverImage } from '../templates/TverSF001Pdd';
import { EvidenceDetailModal } from '../components/evidence/EvidenceDetailModal';
import { useStore } from '../store';
import { seedDemo } from '../test/demoFixtures';
import type { EvidenceFile } from '../types';

beforeEach(() => {
  localStorage.clear();
  seedDemo();
});

// PDD-2000 (solar, registered) carries barrier_explanation + investment_metric.
function renderDoc() {
  return render(<MemoryRouter><PddDocument pddId="PDD-2000" /></MemoryRouter>);
}

describe('PddDocument selective disclosure', () => {
  it('marks sensitive fields with a Restricted chip', () => {
    renderDoc();
    expect(screen.getAllByText(/Restricted/i).length).toBeGreaterThan(0);
  });

  it('Public view masks sensitive values', () => {
    renderDoc();
    expect(screen.getByText((t) => t.includes('developer hurdle rate'))).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Public view/i }));
    expect(screen.queryByText((t) => t.includes('developer hurdle rate'))).toBeNull();
    expect(screen.getAllByText('•••').length).toBeGreaterThan(0);
  });
});

describe('official TGO form export button', () => {
  it('shows the export button for methodologies with a registered document_template', () => {
    renderDoc(); // PDD-2000 = T-VER-S-01, which registers T-VER-S-F001-PDD
    expect(screen.getByText(/เอกสารฟอร์ม อบก\./)).toBeInTheDocument();
  });
  it('hides the button for methodologies without a template', () => {
    render(<MemoryRouter><PddDocument pddId="PDD-2005" /></MemoryRouter>); // forestry
    expect(screen.queryByText(/เอกสารฟอร์ม อบก\./)).toBeNull();
  });
});

describe('official form cover image', () => {
  const img = (id: string) => ({ id }) as EvidenceFile;

  it('pickCoverImage prefers the explicit cover id and falls back to the first image', () => {
    const images = [img('ev-a'), img('ev-b')];
    expect(pickCoverImage(images, 'ev-b')?.id).toBe('ev-b');
    expect(pickCoverImage(images, undefined)?.id).toBe('ev-a');
    expect(pickCoverImage(images, 'ev-gone')?.id).toBe('ev-a');
    expect(pickCoverImage([], 'ev-a')).toBeUndefined();
  });

  it('Set as PDD cover stores cover_evidence_id on the project PDD', () => {
    const ev = useStore.getState().evidence.find((e) => e.id === 'ev-0004')!;
    render(<MemoryRouter><EvidenceDetailModal evidence={ev} onClose={() => {}} /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: /set as pdd cover/i }));
    const pdd = useStore.getState().pdds.find((p) => p.project_id === ev.project_id)!;
    expect(pdd.section_data.cover_evidence_id).toBe('ev-0004');
  });

  it('hides the cover button for non-image evidence', () => {
    const ev = useStore.getState().evidence.find((e) => e.kind !== 'image' && e.status === 'active')!;
    render(<MemoryRouter><EvidenceDetailModal evidence={ev} onClose={() => {}} /></MemoryRouter>);
    expect(screen.queryByRole('button', { name: /set as pdd cover/i })).toBeNull();
  });
});
