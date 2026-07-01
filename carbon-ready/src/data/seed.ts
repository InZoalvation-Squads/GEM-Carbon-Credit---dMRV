import type {
  Organization, Project, MonitoringRecord, EmissionFactor, User, AuditLog,
  EvidenceFile, VerificationRequest, VerificationComment,
  AuditAction, EntityType, UserRole, VerifiableCredential,
  Methodology, ProjectDesignDocument,
} from '../types';
import { shortHash } from '../lib/hash';
import { TVER_SOLAR_METHODOLOGY } from './methodology-tver-solar';
import { auditRowHash } from '../store/audit';
import { DEFAULT_GUARDIAN_CONFIG } from '../lib/guardian';

const uid = (p: string, n: number) => `${p}-${String(n).padStart(4, '0')}`;

export const seedOrg: Organization = {
  id: 'org-0001', name: 'GreenGrid Asia', country: 'IN',
  created_at: '2025-01-01T00:00:00Z',
};

export const seedUser: User = {
  id: 'usr-0001', email: 'asha@greengrid.example', name: 'Asha Iyer',
  role: 'esg_manager', created_at: '2025-01-01T00:00:00Z',
};

export const seedFactors: EmissionFactor[] = [
  { id: 'ef-0001', country: 'IN', source: 'CEA',  factor_kgco2e_per_kwh: 0.82, effective_date: '2024-01-01', version: 1, is_current: false, created_at: '2024-01-01T00:00:00Z' },
  { id: 'ef-0002', country: 'IN', source: 'CEA',  factor_kgco2e_per_kwh: 0.79, effective_date: '2025-04-01', version: 2, is_current: true,  created_at: '2025-04-01T00:00:00Z' },
  { id: 'ef-0003', country: 'TH', source: 'EGAT', factor_kgco2e_per_kwh: 0.51, effective_date: '2024-01-01', version: 1, is_current: true,  created_at: '2024-01-01T00:00:00Z' },
  { id: 'ef-0004', country: 'VN', source: 'EVN',  factor_kgco2e_per_kwh: 0.68, effective_date: '2024-01-01', version: 1, is_current: true,  created_at: '2024-01-01T00:00:00Z' },
];

export const seedProjects: Project[] = [
  { id: 'prj-0001', organization_id: seedOrg.id, name: 'Pune Rooftop Phase 1',   location: 'Pune, India',      capacity_kwp: 250, commission_date: '2025-03-15', status: 'active', lifecycle_stage: 'registered',       created_at: '2025-03-15T00:00:00Z', updated_at: '2025-03-15T00:00:00Z' },
  { id: 'prj-0002', organization_id: seedOrg.id, name: 'Bangkok Industrial Park', location: 'Bangkok, Thailand', capacity_kwp: 820, commission_date: '2024-11-01', status: 'active', lifecycle_stage: 'registered',       created_at: '2024-11-01T00:00:00Z', updated_at: '2024-11-01T00:00:00Z' },
  { id: 'prj-0003', organization_id: seedOrg.id, name: 'Hanoi Warehouse Cluster', location: 'Hanoi, Vietnam',    capacity_kwp: 510, commission_date: '2026-02-10', status: 'draft',  lifecycle_stage: 'under_validation', created_at: '2026-02-10T00:00:00Z', updated_at: '2026-02-10T00:00:00Z' },
  { id: 'prj-0004', organization_id: seedOrg.id, name: 'Chiang Mai Community Solar', location: 'Chiang Mai, Thailand', capacity_kwp: 300, commission_date: '2026-05-01', status: 'draft', lifecycle_stage: 'pdd_draft', created_at: '2026-05-01T00:00:00Z', updated_at: '2026-05-01T00:00:00Z' },
];

export const seedMethodologies: Methodology[] = [TVER_SOLAR_METHODOLOGY];

const VALIDATOR = 'Daniel Okoye';

// A fully-answered PDD payload reused by the registered seed PDDs.
const REGISTERED_SECTION_DATA = {
  technology: 'Solar PV rooftop', grid_connection: 'Grid-connected',
  baseline_scenario: 'Grid electricity displaced by solar generation',
  barrier_type: 'Investment', investment_metric: 'IRR',
  barrier_explanation: 'Project IRR without carbon revenue is below the developer hurdle rate.',
  common_practice: true, performance_ratio: 0.8,
  monitored_parameter: 'EG_PJ', measurement_method: 'Revenue-grade bi-directional meter',
  monitoring_frequency: 'Monthly', qaqc_procedure: 'Monthly meter reads cross-checked against utility bill.',
};

export const seedPdds: ProjectDesignDocument[] = [
  {
    id: 'PDD-2000', project_id: 'prj-0001', methodology_id: TVER_SOLAR_METHODOLOGY.id,
    methodology_snapshot: 'T-VER-S-01 v3.0', state: 'registered',
    section_data: REGISTERED_SECTION_DATA, evidence_ids: ['ev-0003'],
    assigned_validator_name: VALIDATOR, submitted_at: '2025-03-16T00:00:00Z',
    validated_at: '2025-03-20T00:00:00Z', content_hash: shortHash('PDD-2000-registered'),
  },
  {
    id: 'PDD-2001', project_id: 'prj-0002', methodology_id: TVER_SOLAR_METHODOLOGY.id,
    methodology_snapshot: 'T-VER-S-01 v3.0', state: 'registered',
    section_data: REGISTERED_SECTION_DATA, evidence_ids: ['ev-0008'],
    assigned_validator_name: VALIDATOR, submitted_at: '2024-11-03T00:00:00Z',
    validated_at: '2024-11-10T00:00:00Z', content_hash: shortHash('PDD-2001-registered'),
  },
  {
    id: 'PDD-2002', project_id: 'prj-0003', methodology_id: TVER_SOLAR_METHODOLOGY.id,
    methodology_snapshot: 'T-VER-S-01 v3.0', state: 'submitted',
    section_data: REGISTERED_SECTION_DATA, evidence_ids: [],
    assigned_validator_name: VALIDATOR, submitted_at: '2026-06-20T09:00:00Z',
    validated_at: null, content_hash: null,
  },
  {
    id: 'PDD-2003', project_id: 'prj-0004', methodology_id: TVER_SOLAR_METHODOLOGY.id,
    methodology_snapshot: 'T-VER-S-01 v3.0', state: 'revision_required',
    section_data: { technology: 'Solar PV rooftop', grid_connection: 'Grid-connected', performance_ratio: 0.8 },
    evidence_ids: [], assigned_validator_name: VALIDATOR,
    submitted_at: '2026-06-10T09:00:00Z', validated_at: null, content_hash: null,
    rejection_reason: 'Additionality section incomplete; attach commissioning report.',
  },
];

function generationFor(kwp: number, dateIso: string, seed: number): number {
  const d = new Date(dateIso);
  const dayOfYear = Math.floor((d.getTime() - new Date(d.getFullYear(), 0, 0).getTime()) / 86400000);
  const seasonal = 0.85 + 0.25 * Math.sin((2 * Math.PI * dayOfYear) / 365);
  const jitter = 0.85 + 0.3 * ((Math.sin(seed * 9301 + dayOfYear * 49297) * 0.5 + 0.5));
  const sunHours = 4.0;
  return Math.round(kwp * sunHours * seasonal * jitter * 10) / 10;
}

function rangeDates(fromIso: string, days: number): string[] {
  const start = new Date(fromIso);
  const out: string[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

function buildRecords(): MonitoringRecord[] {
  const out: MonitoringRecord[] = [];
  let counter = 0;
  for (const p of seedProjects.filter((x) => x.status === 'active')) {
    const dates = rangeDates('2025-12-01', 180);
    for (const date of dates) {
      counter++;
      out.push({
        id: uid('mon', counter),
        project_id: p.id,
        record_date: date,
        generation_kwh: generationFor(p.capacity_kwp, date, p.capacity_kwp),
        source: 'csv_upload',
        uploaded_at: '2026-05-26T18:30:00Z',
      });
    }
  }
  return out;
}

export const seedRecords: MonitoringRecord[] = buildRecords();

// ============================================================
// Sprint 2 — Evidence
// ============================================================
const U = { id: seedUser.id, name: seedUser.name };

export const seedEvidence: EvidenceFile[] = [
  // Pune (prj-0001)
  { id: 'ev-0001v1', project_id: 'prj-0001', parent_id: null, category: 'meter_reading', file_name: 'pune-apr-2026-meter.pdf', kind: 'pdf', file_size: 1_512_220, version_number: 1, status: 'superseded', description: 'Revenue meter reading, Apr-2026 cycle.', content_hash: shortHash('pune-apr-meter-v1'), uploaded_by: U.id, uploaded_by_name: U.name, uploaded_at: '2026-04-30T06:02:00Z' },
  { id: 'ev-0001', project_id: 'prj-0001', parent_id: 'ev-0001v1', category: 'meter_reading', file_name: 'pune-apr-2026-meter.pdf', kind: 'pdf', file_size: 1_640_344, version_number: 2, status: 'active', description: 'Revenue meter reading, Apr-2026 cycle. Serial number now visible.', content_hash: shortHash('pune-apr-meter-v2'), uploaded_by: U.id, uploaded_by_name: U.name, uploaded_at: '2026-05-04T03:11:00Z' },
  { id: 'ev-0002', project_id: 'prj-0001', parent_id: null, category: 'utility_bill', file_name: 'pune-apr-2026-utility-bill.pdf', kind: 'pdf', file_size: 402_118, version_number: 1, status: 'active', description: 'MSEDCL electricity bill, 01–30 Apr 2026.', content_hash: shortHash('pune-apr-bill'), uploaded_by: U.id, uploaded_by_name: U.name, uploaded_at: '2026-05-02T08:25:00Z' },
  { id: 'ev-0003', project_id: 'prj-0001', parent_id: null, category: 'commissioning_report', file_name: 'pune-commissioning-2025-03.pdf', kind: 'pdf', file_size: 2_044_900, version_number: 1, status: 'active', description: 'Grid-connection acceptance, MSEDCL ref IN-2025-04412.', content_hash: shortHash('pune-commissioning'), uploaded_by: U.id, uploaded_by_name: U.name, uploaded_at: '2025-03-16T02:10:00Z' },
  { id: 'ev-0004', project_id: 'prj-0001', parent_id: null, category: 'site_photo', file_name: 'pune-rooftop-array-apr.jpg', kind: 'image', file_size: 3_140_220, version_number: 1, status: 'active', description: 'North array after panel cleaning. Modules: Adani 540W.', content_hash: shortHash('pune-site-photo'), uploaded_by: U.id, uploaded_by_name: U.name, uploaded_at: '2026-05-03T05:40:00Z' },
  { id: 'ev-0005', project_id: 'prj-0001', parent_id: null, category: 'maintenance_report', file_name: 'pune-inverter-log-apr.xlsx', kind: 'xlsx', file_size: 688_400, version_number: 1, status: 'active', description: 'Inverter SCADA export, 15-min granularity.', content_hash: shortHash('pune-inverter-log'), uploaded_by: U.id, uploaded_by_name: U.name, uploaded_at: '2026-05-04T11:02:00Z' },
  { id: 'ev-0009', project_id: 'prj-0001', parent_id: null, category: 'site_photo', file_name: 'pune-drone-q1-overview.png', kind: 'image', file_size: 4_810_000, version_number: 1, status: 'archived', description: 'Superseded by higher-res capture.', content_hash: shortHash('pune-drone'), uploaded_by: U.id, uploaded_by_name: U.name, uploaded_at: '2026-02-10T04:20:00Z' },
  // Bangkok (prj-0002)
  { id: 'ev-0006', project_id: 'prj-0002', parent_id: null, category: 'meter_reading', file_name: 'bkk-apr-2026-meter.pdf', kind: 'pdf', file_size: 1_320_700, version_number: 1, status: 'active', description: 'Revenue meter reading, Apr-2026.', content_hash: shortHash('bkk-apr-meter'), uploaded_by: U.id, uploaded_by_name: U.name, uploaded_at: '2026-05-02T09:18:00Z' },
  { id: 'ev-0007', project_id: 'prj-0002', parent_id: null, category: 'utility_bill', file_name: 'bkk-apr-2026-mea-bill.pdf', kind: 'pdf', file_size: 455_220, version_number: 1, status: 'active', description: 'MEA electricity bill, Apr 2026.', content_hash: shortHash('bkk-apr-bill'), uploaded_by: U.id, uploaded_by_name: U.name, uploaded_at: '2026-05-02T09:20:00Z' },
  { id: 'ev-0008', project_id: 'prj-0002', parent_id: null, category: 'commissioning_report', file_name: 'bkk-commissioning-2024-11.pdf', kind: 'pdf', file_size: 2_210_440, version_number: 1, status: 'active', description: 'PEA grid-connection acceptance, ref TH-2024-77120.', content_hash: shortHash('bkk-commissioning'), uploaded_by: U.id, uploaded_by_name: U.name, uploaded_at: '2024-11-02T02:00:00Z' },
];

// ============================================================
// Sprint 2 — Verification packages
// ============================================================
const REQUIRED: VerificationRequest['required_categories'] =
  ['meter_reading', 'utility_bill', 'commissioning_report', 'site_photo'];

export const seedVerifications: VerificationRequest[] = [
  {
    id: 'VR-1001', project_id: 'prj-0001', created_by: U.id, owner_name: U.name,
    assigned_verifier_name: 'Daniel Okoye', state: 'under_review',
    monitoring_period_start: '2026-04-01', monitoring_period_end: '2026-04-30',
    reduction_kgco2e: 23_700, factors_snapshot: 'CEA 2025-v2 · 0.79 kgCO₂e/kWh',
    evidence_ids: ['ev-0001', 'ev-0002', 'ev-0003', 'ev-0004', 'ev-0005'],
    required_categories: REQUIRED, submitted_at: '2026-05-04T17:48:00Z',
    locked_at: null, sla_target_days: 7,
    hash_value: null, credential_id: null, anchored_at: null,
    hcs_topic_id: null, hcs_sequence_number: null,
  },
  {
    id: 'VR-1002', project_id: 'prj-0002', created_by: U.id, owner_name: U.name,
    assigned_verifier_name: 'Daniel Okoye', state: 'submitted',
    monitoring_period_start: '2026-04-01', monitoring_period_end: '2026-04-30',
    reduction_kgco2e: 50_184, factors_snapshot: 'EGAT 2024-v1 · 0.51 kgCO₂e/kWh',
    evidence_ids: ['ev-0006', 'ev-0007', 'ev-0008'],
    required_categories: REQUIRED, submitted_at: '2026-05-05T01:05:00Z',
    locked_at: null, sla_target_days: 7,
    hash_value: null, credential_id: null, anchored_at: null,
    hcs_topic_id: null, hcs_sequence_number: null,
  },
  {
    id: 'VR-1003', project_id: 'prj-0002', created_by: U.id, owner_name: U.name,
    assigned_verifier_name: 'Daniel Okoye', state: 'revision_required',
    monitoring_period_start: '2026-03-01', monitoring_period_end: '2026-03-31',
    reduction_kgco2e: 49_100, factors_snapshot: 'EGAT 2024-v1 · 0.51 kgCO₂e/kWh',
    evidence_ids: ['ev-0006', 'ev-0007'],
    required_categories: REQUIRED, submitted_at: '2026-04-06T09:30:00Z',
    locked_at: null, sla_target_days: 7,
    hash_value: null, credential_id: null, anchored_at: null,
    hcs_topic_id: null, hcs_sequence_number: null,
  },
  {
    id: 'VR-1000', project_id: 'prj-0001', created_by: U.id, owner_name: U.name,
    assigned_verifier_name: 'Daniel Okoye', state: 'approved',
    monitoring_period_start: '2026-03-01', monitoring_period_end: '2026-03-31',
    reduction_kgco2e: 24_550, factors_snapshot: 'CEA 2025-v2 · 0.79 kgCO₂e/kWh',
    evidence_ids: ['ev-0003'],
    required_categories: REQUIRED, submitted_at: '2026-04-08T03:00:00Z',
    locked_at: '2026-04-15T08:22:00Z', sla_target_days: 7,
    hash_value: shortHash('VR-1000-approval-payload'),
    credential_id: 'urn:vc:vr1000seed', anchored_at: '2026-04-15T08:30:00Z',
    hcs_topic_id: DEFAULT_GUARDIAN_CONFIG.topic_id, hcs_sequence_number: 1,
  },
];

export const seedComments: VerificationComment[] = [
  { id: 'cmt-0001', verification_id: 'VR-1001', evidence_id: 'ev-0001', evidence_name: 'pune-apr-2026-meter.pdf', author_id: 'usr-verif', author_name: 'Daniel Okoye', author_role: 'verifier', body: 'Serial number is not legible in v1. Please re-upload a clearer scan of the meter reading.', created_at: '2026-05-04T07:02:00Z' },
  { id: 'cmt-0002', verification_id: 'VR-1001', evidence_id: 'ev-0001', evidence_name: 'pune-apr-2026-meter.pdf', author_id: U.id, author_name: U.name, author_role: 'esg_manager', body: 'Done — uploaded v2 with the serial number clearly in frame.', reply_to: 'cmt-0001', created_at: '2026-05-04T03:13:00Z' },
  { id: 'cmt-0003', verification_id: 'VR-1001', evidence_id: 'ev-0005', evidence_name: 'pune-inverter-log-apr.xlsx', author_id: 'usr-verif', author_name: 'Daniel Okoye', author_role: 'verifier', body: 'Inverter totals reconcile with the utility bill within 1.2%. Cross-checking the site photo timestamp next.', created_at: '2026-05-05T08:40:00Z' },
  { id: 'cmt-0004', verification_id: 'VR-1003', evidence_id: null, author_id: 'usr-verif', author_name: 'Daniel Okoye', author_role: 'verifier', body: 'Missing the commissioning report and a site photo for this period. Please add both before resubmitting.', created_at: '2026-04-07T10:15:00Z' },
];

// ============================================================
// Sprint 3 — pre-anchored credential for VR-1000
// ============================================================
export const seedCredentials: VerifiableCredential[] = [
  {
    id: 'urn:vc:vr1000seed',
    schema_id: 'mrv-approval-v1',
    issuer_did: DEFAULT_GUARDIAN_CONFIG.issuer_did,
    issued_at: '2026-04-15T08:30:00Z',
    package_hash: shortHash('VR-1000-approval-payload'),
    subject: {
      verification_id: 'VR-1000', project_id: 'prj-0001',
      monitoring_period_start: '2026-03-01', monitoring_period_end: '2026-03-31',
      reduction_tco2e: 24.55, factors_snapshot: 'CEA 2025-v2 · 0.79 kgCO₂e/kWh',
      evidence: [{ id: 'ev-0003', content_hash: shortHash('pune-commissioning') }],
      approval_role: 'esg_manager', approved_at: '2026-04-15T08:22:00Z',
      package_hash: shortHash('VR-1000-approval-payload'),
    },
    hcs: {
      topic_id: DEFAULT_GUARDIAN_CONFIG.topic_id, sequence_number: 1,
      consensus_timestamp: '2026-04-15T08:30:00Z',
      explorer_url: `https://hashscan.io/${DEFAULT_GUARDIAN_CONFIG.network}/topic/${DEFAULT_GUARDIAN_CONFIG.topic_id}/message/1`,
    },
  },
];

// ============================================================
// Audit log — chained (tamper-evident). Specs are chronological;
// buildChain computes row_hash linking each entry to the previous.
// ============================================================
interface AuditSpec {
  id: string;
  user_role: UserRole;
  action: AuditAction;
  entity_type: EntityType;
  entity_id: string | null;
  payload: Record<string, unknown>;
  previous_value?: Record<string, unknown> | null;
  new_value?: Record<string, unknown> | null;
  ip_address?: string | null;
  created_at: string;
}

function buildChain(specs: AuditSpec[]): AuditLog[] {
  let prev: string | null = null;
  const chrono = specs.map((s) => {
    const core = {
      user_id: seedUser.id,
      user_role: s.user_role,
      action: s.action,
      entity_type: s.entity_type,
      entity_id: s.entity_id,
      previous_value: s.previous_value ?? null,
      new_value: s.new_value ?? null,
      ip_address: s.ip_address ?? null,
      created_at: s.created_at,
    };
    const row_hash = auditRowHash(prev, core);
    const entry: AuditLog = {
      id: s.id, ...core, payload: s.payload,
      hcs_topic_id: null, hcs_sequence_number: null,
      row_hash, prev_row_hash: prev,
    };
    prev = row_hash;
    return entry;
  });
  return chrono.reverse(); // newest first (store prepends new entries)
}

export const seedAudit: AuditLog[] = buildChain([
  { id: 'aud-0002', user_role: 'project_owner', action: 'PROJECT_CREATED', entity_type: 'project', entity_id: 'prj-0002', payload: { name: 'Bangkok Industrial Park' }, new_value: { name: 'Bangkok Industrial Park' }, ip_address: '124.122.9.55', created_at: '2024-11-01T10:05:00Z' },
  { id: 'aud-0008', user_role: 'project_owner', action: 'EVIDENCE_UPLOADED', entity_type: 'evidence', entity_id: 'ev-0008', payload: { file_name: 'bkk-commissioning-2024-11.pdf', category: 'commissioning_report' }, new_value: { version_number: 1, file_size: 2_210_440 }, ip_address: '124.122.9.55', created_at: '2024-11-02T02:00:00Z' },
  { id: 'aud-0020', user_role: 'esg_manager', action: 'PROJECT_REGISTERED', entity_type: 'pdd', entity_id: 'PDD-2001', payload: { methodology: 'T-VER-S-01 v3.0' }, previous_value: { state: 'under_validation' }, new_value: { state: 'registered', content_hash: shortHash('PDD-2001-registered') }, created_at: '2024-11-10T00:00:00Z' },
  { id: 'aud-0001', user_role: 'project_owner', action: 'PROJECT_CREATED', entity_type: 'project', entity_id: 'prj-0001', payload: { name: 'Pune Rooftop Phase 1' }, new_value: { name: 'Pune Rooftop Phase 1' }, ip_address: '49.36.220.10', created_at: '2025-03-15T09:12:00Z' },
  { id: 'aud-0003', user_role: 'esg_manager', action: 'EMISSION_FACTOR_ADDED', entity_type: 'factor', entity_id: 'ef-0002', payload: { country: 'IN', source: 'CEA', version: 2 }, new_value: { factor_kgco2e_per_kwh: 0.79, version: 2 }, previous_value: { factor_kgco2e_per_kwh: 0.82, version: 1 }, created_at: '2025-04-01T08:00:00Z' },
  { id: 'aud-0010', user_role: 'esg_manager', action: 'VERIFICATION_APPROVED', entity_type: 'verification', entity_id: 'VR-1000', payload: { reduction_tco2e: 24.55 }, previous_value: { state: 'under_review' }, new_value: { state: 'approved', hash_value: shortHash('VR-1000-approval-payload'), locked_at: '2026-04-15T08:22:00Z' }, ip_address: '49.36.220.10', created_at: '2026-04-15T08:22:00Z' },
  { id: 'aud-0010b', user_role: 'esg_manager', action: 'VERIFICATION_ANCHORED', entity_type: 'verification', entity_id: 'VR-1000', payload: { credential_id: 'urn:vc:vr1000seed', topic_id: DEFAULT_GUARDIAN_CONFIG.topic_id, sequence_number: 1 }, previous_value: { anchored: false }, new_value: { credential_id: 'urn:vc:vr1000seed', hcs_topic_id: DEFAULT_GUARDIAN_CONFIG.topic_id, hcs_sequence_number: 1 }, created_at: '2026-04-15T08:30:00Z' },
  { id: 'aud-0004', user_role: 'esg_manager', action: 'CSV_UPLOADED', entity_type: 'monitoring', entity_id: 'prj-0001', payload: { accepted: 180, rejected: 0 }, new_value: { accepted: 180, rejected: 0 }, created_at: '2026-05-04T02:30:00Z' },
  { id: 'aud-0011', user_role: 'project_owner', action: 'EVIDENCE_REPLACED', entity_type: 'evidence', entity_id: 'ev-0001', payload: { file_name: 'pune-apr-2026-meter.pdf' }, previous_value: { version_number: 1, content_hash: shortHash('pune-apr-meter-v1') }, new_value: { version_number: 2, content_hash: shortHash('pune-apr-meter-v2') }, ip_address: '49.36.220.10', created_at: '2026-05-04T03:11:00Z' },
  { id: 'aud-0012', user_role: 'project_owner', action: 'VERIFICATION_SUBMITTED', entity_type: 'verification', entity_id: 'VR-1001', payload: { reduction_tco2e: 23.7, evidence_count: 5 }, previous_value: { state: 'draft' }, new_value: { state: 'submitted' }, ip_address: '49.36.220.10', created_at: '2026-05-04T17:48:00Z' },
  { id: 'aud-0013', user_role: 'verifier', action: 'REVIEW_STARTED', entity_type: 'verification', entity_id: 'VR-1001', payload: {}, previous_value: { state: 'submitted' }, new_value: { state: 'under_review' }, ip_address: '102.89.34.7', created_at: '2026-05-05T02:12:00Z' },
  { id: 'aud-0014', user_role: 'verifier', action: 'COMMENT_ADDED', entity_type: 'verification', entity_id: 'VR-1001', payload: { evidence: 'pune-inverter-log-apr.xlsx' }, new_value: { body: 'Inverter totals reconcile with the utility bill within 1.2%…' }, ip_address: '102.89.34.7', created_at: '2026-05-05T08:40:00Z' },
  { id: 'aud-0015', user_role: 'project_owner', action: 'VERIFICATION_SUBMITTED', entity_type: 'verification', entity_id: 'VR-1002', payload: { reduction_tco2e: 50.18, evidence_count: 3 }, previous_value: { state: 'draft' }, new_value: { state: 'submitted' }, ip_address: '124.122.9.55', created_at: '2026-05-05T01:05:00Z' },
  { id: 'aud-0022', user_role: 'verifier', action: 'PDD_REVISION_REQUESTED', entity_type: 'pdd', entity_id: 'PDD-2003', payload: { summary: 'Additionality section incomplete' }, previous_value: { state: 'under_validation' }, new_value: { state: 'revision_required' }, ip_address: '102.89.34.7', created_at: '2026-06-12T10:00:00Z' },
  { id: 'aud-0021', user_role: 'project_owner', action: 'PDD_SUBMITTED', entity_type: 'pdd', entity_id: 'PDD-2002', payload: { methodology: 'T-VER-S-01 v3.0' }, previous_value: { state: 'draft' }, new_value: { state: 'submitted' }, ip_address: '124.122.9.55', created_at: '2026-06-20T09:00:00Z' },
]);
