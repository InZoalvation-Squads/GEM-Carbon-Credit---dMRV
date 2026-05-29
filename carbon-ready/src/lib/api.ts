import { useStore } from '../store';
import { parseAndValidateCsv } from './csv';
import { calculateCarbon } from './calc';
import { locationToCountryCode } from './geo';
import type {
  Project, EmissionFactor, MonitoringRecord, CsvValidationResult, UUID,
  EvidenceFile, VerificationRequest, EvidenceCategory,
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
  async createProject(input: Omit<Project, 'id' | 'created_at' | 'updated_at' | 'organization_id'>): Promise<Project> {
    return tick(useStore.getState().createProject(input));
  },
  async updateProject(id: UUID, patch: Partial<Project>): Promise<Project | undefined> {
    return tick(useStore.getState().updateProject(id, patch));
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
    return tick({ ...result, uploaded_at: new Date().toISOString() });
  },

  async listMonitoring(project_id: UUID): Promise<MonitoringRecord[]> {
    return tick(useStore.getState().records.filter((r) => r.project_id === project_id));
  },

  async calculate(project_id: UUID, range?: { from?: string; to?: string }) {
    const state = useStore.getState();
    const project = state.projects.find((p) => p.id === project_id);
    if (!project) throw new Error('Project not found');
    const country = locationToCountryCode(project.location.split(',').pop()?.trim() ?? '');
    const factors = state.factors.filter((f) => f.country === country);
    const records = state.records.filter((r) => r.project_id === project_id);
    const result = calculateCarbon(records, factors, range);
    state.audit_write('CALCULATION_EXECUTED', 'calculation', project_id, {
      emission_factor_id: result.emission_factor_id,
      generation_kwh: result.totals.generation_kwh,
      reduction_kgco2e: result.totals.reduction_kgco2e,
    });
    return tick(result);
  },

  async listFactors(): Promise<EmissionFactor[]> {
    return tick(useStore.getState().factors);
  },
  async addFactor(input: Omit<EmissionFactor, 'id' | 'version' | 'is_current' | 'created_at'>): Promise<EmissionFactor> {
    return tick(useStore.getState().addEmissionFactor(input));
  },

  // ---------------- Sprint 2: Evidence ----------------
  async listEvidence(project_id: UUID): Promise<EvidenceFile[]> {
    return tick(useStore.getState().evidence.filter((e) => e.project_id === project_id));
  },
  async uploadEvidence(
    project_id: UUID,
    input: { file_name: string; kind: EvidenceFile['kind']; file_size: number; category: EvidenceCategory; description?: string }
  ): Promise<EvidenceFile> {
    return tick(useStore.getState().uploadEvidence(project_id, input));
  },
  async replaceEvidence(evidence_id: UUID, input: { file_name?: string; file_size: number }): Promise<EvidenceFile | undefined> {
    return tick(useStore.getState().replaceEvidence(evidence_id, input));
  },
  async archiveEvidence(evidence_id: UUID): Promise<void> {
    useStore.getState().archiveEvidence(evidence_id);
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
    return tick(undefined);
  },
  async startReview(id: UUID): Promise<void> {
    useStore.getState().startReview(id);
    return tick(undefined);
  },
  async requestRevision(id: UUID, summary: string): Promise<void> {
    useStore.getState().requestRevision(id, summary);
    return tick(undefined);
  },
  async approveVerification(id: UUID, note?: string): Promise<void> {
    useStore.getState().approveVerification(id, note);
    return tick(undefined);
  },
  async rejectVerification(id: UUID, reason: string): Promise<void> {
    useStore.getState().rejectVerification(id, reason);
    return tick(undefined);
  },

  // ---------------- Sprint 3: Guardian anchoring ----------------
  async anchorVerification(id: UUID): Promise<void> {
    useStore.getState().anchorVerification(id);
    return tick(undefined);
  },
};
