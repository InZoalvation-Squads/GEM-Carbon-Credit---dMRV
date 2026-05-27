import { useStore } from '../store';
import { parseAndValidateCsv } from './csv';
import { calculateCarbon } from './calc';
import { locationToCountryCode } from './geo';
import type { Project, EmissionFactor, MonitoringRecord, CsvValidationResult, UUID } from '../types';

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
};
