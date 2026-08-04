import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from './index';
import { projectTopicId } from '../lib/guardian';
import { validatePdd } from '../lib/pdd';
import { seedDemo } from '../test/demoFixtures';

function reset() { seedDemo(); }

describe('registration store', () => {
  beforeEach(reset);

  it('selectMethodology creates a draft PDD and moves project to pdd_draft', () => {
    const s = useStore.getState();
    // prj-0004 (Ubon Regenerative Rice) already has a revision_required PDD; re-selecting a
    // methodology on an editable draft keeps it in pdd_draft.
    const pdd = s.selectMethodology('prj-0004', 'meth-tver-solar');
    expect(pdd.state).toMatch(/draft|revision_required/);
    expect(useStore.getState().projects.find((p) => p.id === 'prj-0004')?.lifecycle_stage).toBe('pdd_draft');
  });

  it('submit → startValidation → register unlocks the project and freezes a hash', () => {
    const s = useStore.getState();
    // Re-point the editable draft to Solar so the Solar section payload below validates.
    s.selectMethodology('prj-0004', 'meth-tver-solar');
    const pdd = s.pddByProject('prj-0004')!;
    s.savePddDraft(pdd.id, {
      project_title_th: 'โครงการทดสอบ', project_owner: 'ผู้ทดสอบ', project_scale: 'เล็กมาก',
      crediting_years: '7', crediting_start: '2026-01-01',
      preparer_name: 'ผู้จัดทำ', coordinator_name: 'ผู้ประสานงาน',
      registered_elsewhere: 'ไม่มี', degradation_pct: 0.4,
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

  it('applyServerRegistration overlays server-frozen fields and prepends the anchored credential', () => {
    const s = useStore.getState();
    const pdd = s.pdds.find((p) => p.state !== 'registered')!;
    const anchored = {
      id: 'urn:vc:server1', schema_id: 'pdd-registration-v1', issuer_did: 'did:key:zX',
      issued_at: '2026-08-04T00:00:00Z', subject: { pdd_id: pdd.id, project_id: pdd.project_id },
      package_hash: 'sha256-feed', hcs: { topic_id: '0.0.480100', sequence_number: 1, consensus_timestamp: '2026-08-04T00:00:00Z', explorer_url: 'sim' },
      anchor: { topic_id: '0.0.999', sequence_number: 5, consensus_timestamp: '2026-08-04T00:00:01Z', explorer_url: 'https://hashscan.io/testnet/topic/0.0.999/message/5' },
    };
    s.applyServerRegistration(
      { ...pdd, state: 'registered', content_hash: 'sha256-feed', ipfs_cid: 'bafkreix', credential_id: 'urn:vc:server1' },
      anchored as never,
    );
    const st = useStore.getState();
    const updated = st.pdds.find((p) => p.id === pdd.id)!;
    expect(updated.state).toBe('registered');
    expect(updated.ipfs_cid).toBe('bafkreix');
    expect(st.projects.find((p) => p.id === pdd.project_id)?.lifecycle_stage).toBe('registered');
    expect(st.credentials[0].id).toBe('urn:vc:server1');
    expect(st.credentials[0].anchor?.topic_id).toBe('0.0.999');
  });

  it('applyServerPdd overlays the row and derives project lifecycle', () => {
    const s = useStore.getState();
    const pdd = s.pdds.find((p) => p.state !== 'registered')!;
    s.applyServerPdd({ ...pdd, state: 'under_validation' });
    expect(useStore.getState().projects.find((p) => p.id === pdd.project_id)?.lifecycle_stage).toBe('under_validation');
    s.applyServerPdd({ ...pdd, state: 'revision_required' });
    expect(useStore.getState().projects.find((p) => p.id === pdd.project_id)?.lifecycle_stage).toBe('pdd_draft');
    s.applyServerPdd({ ...pdd, state: 'registered' });
    expect(useStore.getState().projects.find((p) => p.id === pdd.project_id)?.lifecycle_stage).toBe('registered');
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

  it('rejectPdd moves the pdd and project to rejected', () => {
    const s = useStore.getState();
    const pdd = s.pddByProject('prj-0004')!;
    s.rejectPdd(pdd.id, 'Ineligible site');
    const after = useStore.getState();
    expect(after.pdds.find((p) => p.id === pdd.id)?.state).toBe('rejected');
    expect(after.projects.find((p) => p.id === 'prj-0004')?.lifecycle_stage).toBe('rejected');
  });

  it('loads all 9 methodologies across T-VER / Verra / CDM', () => {
    const ms = useStore.getState().methodologies;
    expect(ms).toHaveLength(9);
    expect(new Set(ms.map((m) => m.standard))).toEqual(new Set(['T-VER', 'Verra', 'CDM']));
    // every methodology declares a calculation formula
    expect(ms.every((m) => !!m.calculation?.formula)).toBe(true);
  });

  it('registerProject anchors the PDD: credential + ipfs_cid + hcs reference', () => {
    const s = useStore.getState();
    s.selectMethodology('prj-0004', 'meth-tver-solar');
    const pdd = s.pddByProject('prj-0004')!;
    s.savePddDraft(pdd.id, {
      project_title_th: 'โครงการทดสอบ', project_owner: 'ผู้ทดสอบ', project_scale: 'เล็กมาก',
      crediting_years: '7', crediting_start: '2026-01-01',
      preparer_name: 'ผู้จัดทำ', coordinator_name: 'ผู้ประสานงาน',
      registered_elsewhere: 'ไม่มี', degradation_pct: 0.4,
      technology: 'Solar PV rooftop', grid_connection: 'Grid-connected',
      baseline_scenario: 'Grid electricity displaced by solar generation',
      barrier_type: 'Technological', barrier_explanation: 'x', common_practice: true,
      performance_ratio: 0.8, monitored_parameter: 'EG_PJ', measurement_method: 'meter',
      monitoring_frequency: 'Monthly', qaqc_procedure: 'checks',
    }, []);
    s.submitPdd(pdd.id);
    s.startValidation(pdd.id);
    const credsBefore = useStore.getState().credentials.length;
    s.registerProject(pdd.id);

    const after = useStore.getState();
    const regPdd = after.pdds.find((p) => p.id === pdd.id)!;
    expect(regPdd.ipfs_cid).toMatch(/^bafkrei/);
    expect(regPdd.credential_id).toBeTruthy();
    expect(after.credentials.length).toBe(credsBefore + 1);
    const vc = after.credentials.find((c) => c.id === regPdd.credential_id)!;
    expect(vc.schema_id).toBe('pdd-registration-v1');
    expect(vc.subject.content_hash).toBe(regPdd.content_hash);
    expect(vc.subject.ipfs_cid).toBe(regPdd.ipfs_cid);
    expect(vc.hcs.topic_id).toBe(projectTopicId('prj-0004'));
    expect(vc.hcs.sequence_number).toBe(1);   // first credential on this project's topic

    // Selective disclosure: public fields in the clear, sensitive ones hash-only.
    const disclosed = vc.subject.disclosed as Record<string, unknown>;
    const redacted = vc.subject.redacted as Array<{ key: string; value_hash: string }>;
    expect(disclosed.technology).toBe('Solar PV rooftop');
    expect(disclosed.barrier_explanation).toBeUndefined();
    expect(redacted.map((r) => r.key)).toContain('barrier_explanation');
    expect(redacted.every((r) => r.value_hash.startsWith('sha256-'))).toBe(true);
  });

  it('a refused registration issues no credential', () => {
    const s = useStore.getState();
    const pdd = s.pddByProject('prj-0004')!;   // seed draft is incomplete
    s.submitPdd(pdd.id);
    s.startValidation(pdd.id);
    const credsBefore = useStore.getState().credentials.length;
    s.registerProject(pdd.id);
    expect(useStore.getState().credentials.length).toBe(credsBefore);
  });

  it('every registered seed PDD satisfies its methodology validation', () => {
    const s = useStore.getState();
    const registered = s.pdds.filter((p) => p.state === 'registered');
    expect(registered.length).toBeGreaterThanOrEqual(6);
    for (const pdd of registered) {
      const m = s.methodologies.find((x) => x.id === pdd.methodology_id)!;
      const check = validatePdd(m, pdd.section_data);
      expect(check.missing, `PDD ${pdd.id} missing: ${check.missing.map((x) => x.field).join(', ')}`).toEqual([]);
    }
  });
});
