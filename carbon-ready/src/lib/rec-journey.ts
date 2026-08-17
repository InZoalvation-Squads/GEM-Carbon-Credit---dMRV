import type { Methodology, ProjectDesignDocument } from '../types';

/** Phase of the REC onboarding journey (matches REC_GUIDE_PHASES order). */
export type RecPhase = 1 | 2 | 3 | 4;

/**
 * Where the organization currently is in the REC journey, derived from its
 * most advanced REC registration:
 *   ④ any registered → issuance cycle (repeats; never "done")
 *   ③ any submitted / under validation → EGAT review
 *   ② any draft / revision → filling SF-02
 *   ① otherwise → registrant account opening (external)
 */
export function currentRecPhase(
  pdds: ProjectDesignDocument[],
  methodologies: Methodology[],
): RecPhase {
  const recStates = pdds
    .filter((p) => methodologies.find((m) => m.id === p.methodology_id)?.standard === 'REC')
    .map((p) => p.state);
  if (recStates.includes('registered')) return 4;
  if (recStates.some((s) => s === 'submitted' || s === 'under_validation')) return 3;
  if (recStates.some((s) => s === 'draft' || s === 'revision_required')) return 2;
  return 1;
}
