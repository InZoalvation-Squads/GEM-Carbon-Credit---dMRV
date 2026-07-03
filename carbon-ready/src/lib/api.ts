import { useStore } from '../store';
import { parseAndValidateCsv } from './csv';
import { calculateCarbon } from './calc';
import { locationToCountryCode } from './geo';
import { toast } from '../components/Toast';
import { formatNumber } from './format';
import type {
  Project, EmissionFactor, MonitoringRecord, CsvValidationResult, UUID,
  EvidenceFile, VerificationRequest, EvidenceCategory,
  Methodology, ProjectDesignDocument,
} from '../types';

const tick = <T>(value: T, ms = 120): Promise<T> =>
  new Promise((res) => setTimeout(() => res(value), ms));

export const api = {
  async listProjects(): Promise<Project[]> {
    return tick(useStore.getState().projects);
  },
  async getProject(id: UUID): Promise<Project | undefined> {
    return tick(useStore.getState().projects.find((p) => p.id === id));
  },
  async createProject(input: Omit<Project, 'id' | 'created_at' | 'updated_at' | 'organization_id' | 'lifecycle_stage'>): Promise<Project> {
    const project = useStore.getState().createProject(input);
    toast.success('Project created', project.name);
    return tick(project);
  },
  async updateProject(id: UUID, patch: Partial<Project>): Promise<Project | undefined> {
    const project = useStore.getState().updateProject(id, patch);
    toast.success('Project updated', project?.name);
    return tick(project);
  },

  async uploadMonitoringCsv(project_id: UUID, csvText: string): Promise<CsvValidationResult & { uploaded_at: string }> {
    const state = useStore.getState();
    const existing = state.records.filter((r) => r.project_id === project_id).map((r) => r.record_date);
    const result = parseAndValidateCsv(csvText, existing);
    if (result.accepted.length > 0) {
      state.addMonitoringRecords(project_id, result.accepted);
    }
    state.audit_write('CSV_UPLOADED', 'monitoring', project_id, {
      accepted: result.accepted.length,
      rejected: result.rejected.length,
    });
    if (result.accepted.length === 0) {
      toast.error('No rows imported', `${result.rejected.length} row(s) rejected — check the file format.`);
    } else {
      toast.success(
        `${result.accepted.length} record(s) imported`,
        result.rejected.length ? `${result.rejected.length} row(s) rejected.` : 'All rows passed validation.',
      );
    }
    return tick({ ...result, uploaded_at: new Date().toISOString() });
  },

  async listMonitoring(project_id: UUID): Promise<MonitoringRecord[]> {
    return tick(useStore.getState().records.filter((r) => r.project_id === project_id));
  },

  async calculate(project_id: UUID, range?: { from?: string; to?: string }) {
    const state = useStore.getState();
    const project = state.projects.find((p) => p.id === project_id);
    if (!project) throw new Error('Project not found');
    const pdd = state.pddByProject(project_id);
    const methodology = state.methodologies.find((m) => m.id === pdd?.methodology_id);
    const calculation = methodology?.calculation;
    const country = locationToCountryCode(project.location.split(',').pop()?.trim() ?? '');
    const factors = state.factors.filter((f) => f.country === country);
    const records = state.records.filter((r) => r.project_id === project_id);
    const result = calculateCarbon(records, factors, range, calculation);
    state.audit_write('CALCULATION_EXECUTED', 'calculation', project_id, {
      emission_factor_id: result.emission_factor_id,
      generation_kwh: result.totals.generation_kwh,
      reduction_kgco2e: result.totals.reduction_kgco2e,
    });
    toast.success('Calculation complete', `${formatNumber(result.totals.reduction_tco2e, 2)} tCO₂e reduction`);
    return tick(result);
  },

  async listFactors(): Promise<EmissionFactor[]> {
    return tick(useStore.getState().factors);
  },
  async addFactor(input: Omit<EmissionFactor, 'id' | 'version' | 'is_current' | 'created_at'>): Promise<EmissionFactor> {
    const factor = useStore.getState().addEmissionFactor(input);
    toast.success('Emission factor added', `${factor.country} · ${factor.source} v${factor.version}`);
    return tick(factor);
  },

  // ---------------- Sprint 2: Evidence ----------------
  async listEvidence(project_id: UUID): Promise<EvidenceFile[]> {
    return tick(useStore.getState().evidence.filter((e) => e.project_id === project_id));
  },
  async uploadEvidence(
    project_id: UUID,
    input: { file_name: string; kind: EvidenceFile['kind']; file_size: number; category: EvidenceCategory; description?: string }
  ): Promise<EvidenceFile> {
    const file = useStore.getState().uploadEvidence(project_id, input);
    toast.success('Evidence uploaded', file.file_name);
    return tick(file);
  },
  async replaceEvidence(evidence_id: UUID, input: { file_name?: string; file_size: number }): Promise<EvidenceFile | undefined> {
    const file = useStore.getState().replaceEvidence(evidence_id, input);
    toast.success('New version uploaded', file ? `${file.file_name} · v${file.version_number}` : undefined);
    return tick(file);
  },
  async archiveEvidence(evidence_id: UUID): Promise<void> {
    useStore.getState().archiveEvidence(evidence_id);
    toast.info('Evidence archived');
    return tick(undefined);
  },

  // ---------------- Sprint 2: Verification ----------------
  async listVerifications(): Promise<VerificationRequest[]> {
    return tick(useStore.getState().verifications);
  },
  async getVerification(id: UUID): Promise<VerificationRequest | undefined> {
    return tick(useStore.getState().verifications.find((v) => v.id === id));
  },
  async submitVerification(id: UUID): Promise<void> {
    useStore.getState().submitVerification(id);
    toast.success('Verification submitted', 'Sent to the review queue.');
    return tick(undefined);
  },
  async startReview(id: UUID): Promise<void> {
    useStore.getState().startReview(id);
    toast.info('Review started');
    return tick(undefined);
  },
  async requestRevision(id: UUID, summary: string): Promise<void> {
    useStore.getState().requestRevision(id, summary);
    toast.info('Revision requested', 'Returned to the project owner.');
    return tick(undefined);
  },
  async approveVerification(id: UUID, note?: string): Promise<void> {
    useStore.getState().approveVerification(id, note);
    toast.success('Verification approved', 'Package locked and hash-sealed.');
    return tick(undefined);
  },
  async rejectVerification(id: UUID, reason: string): Promise<void> {
    useStore.getState().rejectVerification(id, reason);
    toast.error('Verification rejected', reason);
    return tick(undefined);
  },

  // ---------------- Sprint 3: Guardian anchoring ----------------
  async anchorVerification(id: UUID): Promise<void> {
    useStore.getState().anchorVerification(id);
    toast.success('Anchored to Hedera Guardian', 'Verifiable Credential issued.');
    return tick(undefined);
  },

  // ---------------- Registration: Gate 1 ----------------
  async listMethodologies(): Promise<Methodology[]> {
    return tick(useStore.getState().methodologies);
  },
  async getMethodology(id: UUID): Promise<Methodology | undefined> {
    return tick(useStore.getState().methodologies.find((m) => m.id === id));
  },
  async listPdds(): Promise<ProjectDesignDocument[]> {
    return tick(useStore.getState().pdds);
  },
  async getPdd(id: UUID): Promise<ProjectDesignDocument | undefined> {
    return tick(useStore.getState().pdds.find((p) => p.id === id));
  },
  async selectMethodology(project_id: UUID, methodology_id: UUID): Promise<ProjectDesignDocument> {
    return tick(useStore.getState().selectMethodology(project_id, methodology_id));
  },
  async savePddDraft(pdd_id: UUID, section_data: Record<string, unknown>, evidence_ids: UUID[]): Promise<void> {
    useStore.getState().savePddDraft(pdd_id, section_data, evidence_ids);
    return tick(undefined, 60);
  },
  async submitPdd(pdd_id: UUID): Promise<void> {
    useStore.getState().submitPdd(pdd_id);
    toast.success('PDD submitted', 'Sent to the validation queue.');
    return tick(undefined);
  },
  async startValidation(pdd_id: UUID): Promise<void> {
    useStore.getState().startValidation(pdd_id);
    toast.info('Validation started');
    return tick(undefined);
  },
  async requestPddRevision(pdd_id: UUID, summary: string): Promise<void> {
    useStore.getState().requestPddRevision(pdd_id, summary);
    toast.info('Revision requested', 'Returned to the project proponent.');
    return tick(undefined);
  },
  async registerProject(pdd_id: UUID): Promise<boolean> {
    const ok = useStore.getState().registerProject(pdd_id);
    if (ok) toast.success('Project registered', 'dMRV is now unlocked for this project.');
    else toast.error('Cannot register', 'PDD is incomplete — required fields are missing.');
    return tick(ok);
  },
  async rejectPdd(pdd_id: UUID, reason: string): Promise<void> {
    useStore.getState().rejectPdd(pdd_id, reason);
    toast.error('PDD rejected', reason);
    return tick(undefined);
  },
  async addPddComment(pdd_id: UUID, body: string, section_key?: string): Promise<void> {
    useStore.getState().addPddComment(pdd_id, body, section_key);
    return tick(undefined, 60);
  },
};
