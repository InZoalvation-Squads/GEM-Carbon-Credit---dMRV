import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  Project, MonitoringRecord, EmissionFactor, CalculationResult,
  AuditLog, User, Organization, UUID, AuditAction, EntityType,
} from '../types';
import {
  seedOrg, seedUser, seedFactors, seedProjects, seedRecords, seedAudit,
} from '../data/seed';
import { newAudit } from './audit';

interface AppState {
  currentUser: User;
  organization: Organization;
  projects: Project[];
  records: MonitoringRecord[];
  factors: EmissionFactor[];
  calculations: CalculationResult[];
  audit: AuditLog[];

  audit_write: (action: AuditAction, entity_type: EntityType, entity_id: UUID | null, payload?: Record<string, unknown>) => void;

  createProject: (p: Omit<Project, 'id' | 'created_at' | 'updated_at' | 'organization_id'>) => Project;
  updateProject: (id: UUID, patch: Partial<Project>) => Project | undefined;

  addMonitoringRecords: (project_id: UUID, rows: Array<{ record_date: string; generation_kwh: number }>) => number;

  addEmissionFactor: (input: Omit<EmissionFactor, 'id' | 'version' | 'is_current' | 'created_at'>) => EmissionFactor;

  recordCalculation: (project_id: UUID, emission_factor_id: UUID, totals: { generation_kwh: number; reduction_kgco2e: number }) => void;

  resetToSeed: () => void;
}

function uid(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      currentUser: seedUser,
      organization: seedOrg,
      projects: seedProjects,
      records: seedRecords,
      factors: seedFactors,
      calculations: [],
      audit: seedAudit,

      audit_write: (action, entity_type, entity_id, payload = {}) =>
        set((s) => ({ audit: [newAudit(s.currentUser.id, action, entity_type, entity_id, payload), ...s.audit] })),

      createProject: (input) => {
        const now = new Date().toISOString();
        const p: Project = { id: uid('prj'), organization_id: get().organization.id, created_at: now, updated_at: now, ...input };
        set((s) => ({ projects: [p, ...s.projects] }));
        get().audit_write('PROJECT_CREATED', 'project', p.id, { name: p.name });
        return p;
      },

      updateProject: (id, patch) => {
        let updated: Project | undefined;
        set((s) => ({
          projects: s.projects.map((p) => {
            if (p.id !== id) return p;
            updated = { ...p, ...patch, updated_at: new Date().toISOString() };
            return updated;
          }),
        }));
        if (updated) get().audit_write('PROJECT_UPDATED', 'project', id, { changes: patch });
        return updated;
      },

      addMonitoringRecords: (project_id, rows) => {
        const uploaded_at = new Date().toISOString();
        const recs: MonitoringRecord[] = rows.map((r) => ({
          id: uid('mon'), project_id, source: 'csv_upload', uploaded_at, ...r,
        }));
        set((s) => ({ records: [...s.records, ...recs] }));
        return recs.length;
      },

      addEmissionFactor: (input) => {
        const existing = get().factors.filter((f) => f.country === input.country && f.source === input.source);
        const nextVersion = existing.reduce((m, f) => Math.max(m, f.version), 0) + 1;
        const ef: EmissionFactor = {
          id: uid('ef'), version: nextVersion, is_current: true,
          created_at: new Date().toISOString(), ...input,
        };
        set((s) => ({
          factors: [
            ef,
            ...s.factors.map((f) =>
              f.country === input.country && f.source === input.source ? { ...f, is_current: false } : f
            ),
          ],
        }));
        get().audit_write('EMISSION_FACTOR_ADDED', 'factor', ef.id, { country: ef.country, source: ef.source, version: ef.version });
        return ef;
      },

      recordCalculation: (project_id, emission_factor_id, totals) => {
        get().audit_write('CALCULATION_EXECUTED', 'calculation', project_id, { emission_factor_id, ...totals });
      },

      resetToSeed: () => set({
        projects: seedProjects, records: seedRecords, factors: seedFactors, calculations: [], audit: seedAudit,
      }),
    }),
    { name: 'carbon-ready-store-v1' }
  )
);
