import { describe, it, expect } from 'vitest';
import { currentRecPhase } from './rec-journey';
import type { Methodology, ProjectDesignDocument } from '../types';

const methodologies = [
  { id: 'meth-rec-solar', standard: 'REC' },
  { id: 'meth-tver-solar', standard: 'T-VER' },
] as Methodology[];

const pdd = (methodology_id: string, state: ProjectDesignDocument['state']) =>
  ({ id: `PDD-${state}`, methodology_id, state } as ProjectDesignDocument);

describe('currentRecPhase', () => {
  it('phase 1 when no REC registration exists (T-VER pdds are ignored)', () => {
    expect(currentRecPhase([], methodologies)).toBe(1);
    expect(currentRecPhase([pdd('meth-tver-solar', 'registered')], methodologies)).toBe(1);
  });

  it('phase 2 while a REC registration is in draft or revision', () => {
    expect(currentRecPhase([pdd('meth-rec-solar', 'draft')], methodologies)).toBe(2);
    expect(currentRecPhase([pdd('meth-rec-solar', 'revision_required')], methodologies)).toBe(2);
  });

  it('phase 3 while under EGAT review (submitted / under_validation)', () => {
    expect(currentRecPhase([pdd('meth-rec-solar', 'submitted')], methodologies)).toBe(3);
    expect(currentRecPhase([pdd('meth-rec-solar', 'under_validation')], methodologies)).toBe(3);
  });

  it('phase 4 once any REC registration is registered — most advanced wins', () => {
    expect(currentRecPhase(
      [pdd('meth-rec-solar', 'draft'), pdd('meth-rec-solar', 'registered')],
      methodologies,
    )).toBe(4);
  });
});
