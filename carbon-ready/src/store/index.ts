import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  Project, MonitoringRecord, EmissionFactor, CalculationResult,
  AuditLog, User, Organization, UUID, AuditAction, EntityType,
  EvidenceFile, EvidenceCategory, VerificationRequest, VerificationComment,
  VerifiableCredential, GuardianConfig,
} from '../types';
import {
  seedOrg, seedUser, seedFactors, seedProjects, seedRecords, seedAudit,
  seedEvidence, seedVerifications, seedComments, seedCredentials,
} from '../data/seed';
import { newAudit, type AuditExtra } from './audit';
import { shortHash } from '../lib/hash';
import { buildApprovalSubject, issueCredential, DEFAULT_GUARDIAN_CONFIG } from '../lib/guardian';
import { MRV_APPROVAL_SCHEMA_V1 } from '../lib/guardian-schema';

interface AppState {
  currentUser: User;
  organization: Organization;
  projects: Project[];
  records: MonitoringRecord[];
  factors: EmissionFactor[];
  calculations: CalculationResult[];
  audit: AuditLog[];
  evidence: EvidenceFile[];
  verifications: VerificationRequest[];
  comments: VerificationComment[];
  credentials: VerifiableCredential[];
  guardianConfig: GuardianConfig;

  audit_write: (action: AuditAction, entity_type: EntityType, entity_id: UUID | null, payload?: Record<string, unknown>, extra?: AuditExtra) => void;

  createProject: (p: Omit<Project, 'id' | 'created_at' | 'updated_at' | 'organization_id'>) => Project;
  updateProject: (id: UUID, patch: Partial<Project>) => Project | undefined;

  addMonitoringRecords: (project_id: UUID, rows: Array<{ record_date: string; generation_kwh: number }>) => number;

  addEmissionFactor: (input: Omit<EmissionFactor, 'id' | 'version' | 'is_current' | 'created_at'>) => EmissionFactor;

  recordCalculation: (project_id: UUID, emission_factor_id: UUID, totals: { generation_kwh: number; reduction_kgco2e: number }) => void;

  // Sprint 2 — Evidence
  uploadEvidence: (project_id: UUID, input: { file_name: string; kind: EvidenceFile['kind']; file_size: number; category: EvidenceCategory; description?: string }) => EvidenceFile;
  replaceEvidence: (evidence_id: UUID, input: { file_name?: string; file_size: number }) => EvidenceFile | undefined;
  archiveEvidence: (evidence_id: UUID) => void;

  // Sprint 2 — Verification workflow
  submitVerification: (id: UUID) => void;
  startReview: (id: UUID) => void;
  requestRevision: (id: UUID, summary: string) => void;
  approveVerification: (id: UUID, note?: string) => void;
  rejectVerification: (id: UUID, reason: string) => void;
  addComment: (verification_id: UUID, body: string, evidence?: { id: UUID; name: string }) => void;

  // Sprint 3 — Hedera Guardian anchoring (simulated)
  anchorVerification: (id: UUID) => void;

  resetToSeed: () => void;
}

function uid(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

const CALLER_IP = '203.0.113.10'; // stand-in for request IP until real auth middleware (Sprint 3+)

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
      evidence: seedEvidence,
      verifications: seedVerifications,
      comments: seedComments,
      credentials: seedCredentials,
      guardianConfig: DEFAULT_GUARDIAN_CONFIG,

      audit_write: (action, entity_type, entity_id, payload = {}, extra = {}) =>
        set((s) => ({
          audit: [
            newAudit(
              s.currentUser.id, action, entity_type, entity_id, payload,
              { user_role: s.currentUser.role, ip_address: CALLER_IP, ...extra },
              s.audit[0]?.row_hash ?? null
            ),
            ...s.audit,
          ],
        })),

      createProject: (input) => {
        const now = new Date().toISOString();
        const p: Project = { id: uid('prj'), organization_id: get().organization.id, created_at: now, updated_at: now, ...input };
        set((s) => ({ projects: [p, ...s.projects] }));
        get().audit_write('PROJECT_CREATED', 'project', p.id, { name: p.name }, { new_value: { name: p.name } });
        return p;
      },

      updateProject: (id, patch) => {
        let updated: Project | undefined;
        let before: Project | undefined;
        set((s) => ({
          projects: s.projects.map((p) => {
            if (p.id !== id) return p;
            before = p;
            updated = { ...p, ...patch, updated_at: new Date().toISOString() };
            return updated;
          }),
        }));
        if (updated && before) get().audit_write('PROJECT_UPDATED', 'project', id, { changes: patch }, { previous_value: { ...before }, new_value: { ...updated } });
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
        get().audit_write('EMISSION_FACTOR_ADDED', 'factor', ef.id, { country: ef.country, source: ef.source, version: ef.version }, { new_value: { factor_kgco2e_per_kwh: ef.factor_kgco2e_per_kwh, version: ef.version } });
        return ef;
      },

      recordCalculation: (project_id, emission_factor_id, totals) => {
        get().audit_write('CALCULATION_EXECUTED', 'calculation', project_id, { emission_factor_id, ...totals });
      },

      // ---------------- Sprint 2: Evidence ----------------
      uploadEvidence: (project_id, input) => {
        const ev: EvidenceFile = {
          id: uid('ev'), project_id, parent_id: null,
          category: input.category, file_name: input.file_name, kind: input.kind,
          file_size: input.file_size, version_number: 1, status: 'active',
          description: input.description, content_hash: shortHash(input.file_name + input.file_size),
          uploaded_by: get().currentUser.id, uploaded_by_name: get().currentUser.name,
          uploaded_at: new Date().toISOString(),
        };
        set((s) => ({ evidence: [ev, ...s.evidence] }));
        get().audit_write('EVIDENCE_UPLOADED', 'evidence', ev.id, { file_name: ev.file_name, category: ev.category }, { new_value: { version_number: 1, file_size: ev.file_size } });
        return ev;
      },

      replaceEvidence: (evidence_id, input) => {
        const prev = get().evidence.find((e) => e.id === evidence_id && e.status === 'active');
        if (!prev) return undefined;
        const next: EvidenceFile = {
          ...prev, id: uid('ev'), parent_id: prev.id,
          file_name: input.file_name ?? prev.file_name, file_size: input.file_size,
          version_number: prev.version_number + 1, status: 'active',
          content_hash: shortHash((input.file_name ?? prev.file_name) + input.file_size + Date.now()),
          uploaded_by: get().currentUser.id, uploaded_by_name: get().currentUser.name,
          uploaded_at: new Date().toISOString(),
        };
        set((s) => ({
          evidence: [next, ...s.evidence.map((e) => (e.id === prev.id ? { ...e, status: 'superseded' as const } : e))],
        }));
        get().audit_write('EVIDENCE_REPLACED', 'evidence', next.id, { file_name: next.file_name },
          { previous_value: { version_number: prev.version_number, content_hash: prev.content_hash }, new_value: { version_number: next.version_number, content_hash: next.content_hash } });
        return next;
      },

      archiveEvidence: (evidence_id) => {
        set((s) => ({ evidence: s.evidence.map((e) => (e.id === evidence_id ? { ...e, status: 'archived' as const } : e)) }));
        get().audit_write('EVIDENCE_ARCHIVED', 'evidence', evidence_id, {}, { new_value: { status: 'archived' } });
      },

      // ---------------- Sprint 2: Verification ----------------
      submitVerification: (id) => {
        set((s) => ({ verifications: s.verifications.map((v) => (v.id === id ? { ...v, state: 'submitted', submitted_at: v.submitted_at ?? new Date().toISOString() } : v)) }));
        get().audit_write('VERIFICATION_SUBMITTED', 'verification', id, {}, { previous_value: { state: 'draft' }, new_value: { state: 'submitted' } });
      },

      startReview: (id) => {
        set((s) => ({ verifications: s.verifications.map((v) => (v.id === id ? { ...v, state: 'under_review' } : v)) }));
        get().audit_write('REVIEW_STARTED', 'verification', id, {}, { previous_value: { state: 'submitted' }, new_value: { state: 'under_review' } });
      },

      requestRevision: (id, summary) => {
        set((s) => ({ verifications: s.verifications.map((v) => (v.id === id ? { ...v, state: 'revision_required' } : v)) }));
        get().audit_write('REVISION_REQUESTED', 'verification', id, { summary }, { previous_value: { state: 'under_review' }, new_value: { state: 'revision_required', summary } });
      },

      approveVerification: (id, note) => {
        const v = get().verifications.find((x) => x.id === id);
        if (!v) return;
        const locked_at = new Date().toISOString();
        const hash_value = shortHash(`${v.id}|${v.project_id}|${v.reduction_kgco2e}|${v.evidence_ids.join(',')}|${locked_at}`);
        set((s) => ({ verifications: s.verifications.map((x) => (x.id === id ? { ...x, state: 'approved', locked_at, hash_value } : x)) }));
        get().audit_write('VERIFICATION_APPROVED', 'verification', id,
          { reduction_tco2e: v.reduction_kgco2e / 1000, note: note ?? null },
          { previous_value: { state: v.state }, new_value: { state: 'approved', hash_value, locked_at } });
      },

      rejectVerification: (id, reason) => {
        const v = get().verifications.find((x) => x.id === id);
        set((s) => ({ verifications: s.verifications.map((x) => (x.id === id ? { ...x, state: 'rejected', rejection_reason: reason } : x)) }));
        get().audit_write('VERIFICATION_REJECTED', 'verification', id, { reason }, { previous_value: { state: v?.state ?? null }, new_value: { state: 'rejected', reason } });
      },

      addComment: (verification_id, body, evidence) => {
        const u = get().currentUser;
        const c: VerificationComment = {
          id: uid('cmt'), verification_id, evidence_id: evidence?.id ?? null, evidence_name: evidence?.name,
          author_id: u.id, author_name: u.name, author_role: u.role, body, created_at: new Date().toISOString(),
        };
        set((s) => ({ comments: [...s.comments, c] }));
        get().audit_write('COMMENT_ADDED', 'verification', verification_id, evidence ? { evidence: evidence.name } : {}, { new_value: { body } });
      },

      // ---------------- Sprint 3: Guardian anchoring (simulated) ----------------
      anchorVerification: (id) => {
        const v = get().verifications.find((x) => x.id === id);
        if (!v || v.state !== 'approved' || v.credential_id || !v.hash_value) return;
        const issuedAt = new Date().toISOString();
        const sequenceNumber = get().credentials.length + 1;
        const subject = buildApprovalSubject(v, get().evidence);
        const vc = issueCredential(subject, v.hash_value, sequenceNumber, get().guardianConfig, MRV_APPROVAL_SCHEMA_V1, issuedAt);
        set((s) => ({
          credentials: [vc, ...s.credentials],
          verifications: s.verifications.map((x) =>
            x.id === id
              ? { ...x, credential_id: vc.id, anchored_at: issuedAt, hcs_topic_id: vc.hcs.topic_id, hcs_sequence_number: vc.hcs.sequence_number }
              : x),
        }));
        get().audit_write('VERIFICATION_ANCHORED', 'verification', id,
          { credential_id: vc.id, topic_id: vc.hcs.topic_id, sequence_number: vc.hcs.sequence_number },
          { previous_value: { anchored: false }, new_value: { credential_id: vc.id, hcs_topic_id: vc.hcs.topic_id, hcs_sequence_number: vc.hcs.sequence_number } });
      },

      resetToSeed: () => set({
        projects: seedProjects, records: seedRecords, factors: seedFactors, calculations: [], audit: seedAudit,
        evidence: seedEvidence, verifications: seedVerifications, comments: seedComments,
        credentials: seedCredentials, guardianConfig: DEFAULT_GUARDIAN_CONFIG,
      }),
    }),
    { name: 'carbon-ready-store-v3' }
  )
);
