import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from './index';

function reset() { useStore.getState().resetToSeed(); }

describe('registration store', () => {
  beforeEach(reset);

  it('selectMethodology creates a draft PDD and moves project to pdd_draft', () => {
    const s = useStore.getState();
    // prj-0004 already has a draft PDD; use a project with none by first clearing via a fresh select on prj-0003 is registered-path.
    const pdd = s.selectMethodology('prj-0004', 'meth-tver-solar');
    expect(pdd.state).toMatch(/draft|revision_required/);
    expect(useStore.getState().projects.find((p) => p.id === 'prj-0004')?.lifecycle_stage).toBe('pdd_draft');
  });

  it('submit → startValidation → register unlocks the project and freezes a hash', () => {
    const s = useStore.getState();
    const pdd = s.pddByProject('prj-0004')!;
    s.savePddDraft(pdd.id, {
      technology: 'Solar PV rooftop', grid_connection: 'Grid-connected',
      baseline_scenario: 'Grid electricity displaced by solar generation',
      barrier_type: 'Technological', barrier_explanation: 'x', common_practice: true,
      performance_ratio: 0.8, monitored_parameter: 'EG_PJ', measurement_method: 'meter',
      monitoring_frequency: 'Monthly', qaqc_procedure: 'checks',
    }, []);
    s.submitPdd(pdd.id);
    expect(useStore.getState().pdds.find((p) => p.id === pdd.id)?.state).toBe('submitted');
    expect(useStore.getState().projects.find((p) => p.id === 'prj-0004')?.lifecycle_stage).toBe('under_validation');

    s.startValidation(pdd.id);
    expect(useStore.getState().pdds.find((p) => p.id === pdd.id)?.state).toBe('under_validation');

    s.registerProject(pdd.id);
    const after = useStore.getState();
    const regPdd = after.pdds.find((p) => p.id === pdd.id)!;
    expect(regPdd.state).toBe('registered');
    expect(regPdd.content_hash).toBeTruthy();
    expect(after.projects.find((p) => p.id === 'prj-0004')?.lifecycle_stage).toBe('registered');
  });

  it('registerProject refuses an incomplete PDD', () => {
    const s = useStore.getState();
    const pdd = s.pddByProject('prj-0004')!;   // seed draft is incomplete
    s.submitPdd(pdd.id);
    s.startValidation(pdd.id);
    const before = useStore.getState().projects.find((p) => p.id === 'prj-0004')?.lifecycle_stage;
    s.registerProject(pdd.id);
    const after = useStore.getState().projects.find((p) => p.id === 'prj-0004')?.lifecycle_stage;
    expect(after).toBe(before);   // unchanged — not registered
  });

  it('writes an audit entry per transition and keeps the chain valid', () => {
    const s = useStore.getState();
    const before = useStore.getState().audit.length;
    const pdd = s.pddByProject('prj-0004')!;
    s.submitPdd(pdd.id);
    const after = useStore.getState().audit;
    expect(after.length).toBe(before + 1);
    expect(after[0].action).toBe('PDD_SUBMITTED');
    expect(after[0].prev_row_hash).toBe(after[1].row_hash);   // chain intact
  });

  it('validationQueue returns non-registered, non-draft PDDs', () => {
    const q = useStore.getState().validationQueue();
    expect(q.every((p) => p.state !== 'registered')).toBe(true);
    expect(q.some((p) => p.id === 'PDD-2002')).toBe(true);
  });
});
