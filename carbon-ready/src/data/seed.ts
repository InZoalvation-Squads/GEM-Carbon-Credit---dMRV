import type {
  Organization, Project, MonitoringRecord, EmissionFactor, User, AuditLog,
  EvidenceFile, VerificationRequest, VerificationComment, VerifiableCredential,
  Methodology, ProjectDesignDocument,
} from '../types';
import { shortHash } from '../lib/hash';
import { TVER_SOLAR_METHODOLOGY } from './methodology-tver-solar';
import { ALL_METHODOLOGIES, VERRA_VM0047_METHODOLOGY } from './methodologies';

const uid = (p: string, n: number) => `${p}-${String(n).padStart(5, '0')}`;

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

export const seedMethodologies: Methodology[] = ALL_METHODOLOGIES;

// ============================================================
// Real solar-rooftop sites imported from plant.csv (community-college fleet).
// English names are kept verbatim; `province` drives the location label.
// Every plant is registered under T-VER-S-01 (grid-connected solar PV) and
// carries modelled daily generation for the reporting period below.
// ============================================================
const CSV_CREATED_AT = '2025-11-07T10:56:34Z';
const CSV_SOLAR_PLANTS: Array<{ id: string; name: string; province: string; capacity_kwp: number; updated_at?: string }> = [
  { id: 'd8138a35-6c1d-4f0c-a61b-5f3a3e75d076', name: 'Nong Bua Lamphu Community College', province: 'Nong Bua Lamphu', capacity_kwp: 48.4 },
  { id: 'b178bcdc-e84e-4912-8ed3-9eceae217e47', name: 'Ranong Community College', province: 'Ranong', capacity_kwp: 60.5 },
  { id: 'cdd28595-9115-449b-a790-0cbccd908d74', name: 'Pattani Community College', province: 'Pattani', capacity_kwp: 72.05 },
  { id: '1c003bff-43d9-4373-8e07-a495b20390c1', name: 'Yala Community College', province: 'Yala', capacity_kwp: 48.4 },
  { id: '9ba78129-8d0d-4877-9414-70c1c8c0eb81', name: 'Satun Community College', province: 'Satun', capacity_kwp: 72.6 },
  { id: '734b4f2b-cc0c-4d34-af11-44ad8088c037', name: 'Phang Nga Community College', province: 'Phang Nga', capacity_kwp: 68.2 },
  { id: '0644be99-5a3a-457d-aa25-b3bf70b72da6', name: 'Songkhla Community College', province: 'Songkhla', capacity_kwp: 49.5 },
  { id: '81517d1a-6973-4261-9be0-f68284f16d0d', name: 'Uthai Thani Community College', province: 'Uthai Thani', capacity_kwp: 99 },
  { id: '86a0a32a-8275-4f1f-a4fc-8f5ac538ec72', name: 'Buriram Community College', province: 'Buriram', capacity_kwp: 48.4 },
  { id: '0199708c-dd99-749d-b2de-ec68f789c83a', name: 'Narathiwat Community College (Central Administration Building)', province: 'Narathiwat', capacity_kwp: 36.3 },
  { id: '0199708d-e79b-76ac-8184-723877845531', name: 'Narathiwat Community College (Academic Services Building)', province: 'Narathiwat', capacity_kwp: 24.2 },
  { id: '0199708e-4fe9-7585-a1c3-0deaffec99ff', name: 'Phichit Community College (Tap Khlo)', province: 'Phichit', capacity_kwp: 36.3 },
  { id: '4d2679c7-1d29-41b6-9589-b6ebe3094030', name: 'Mae Hong Son Community College', province: 'Mae Hong Son', capacity_kwp: 50, updated_at: '2025-11-14T09:29:04Z' },
  { id: '0199708e-1eb3-7134-a6f5-998622275931', name: 'Phrae Community College', province: 'Phrae', capacity_kwp: 50, updated_at: '2025-11-14T09:39:13Z' },
  { id: '9a45bce5-5cb0-40a6-939f-e279dcfdce21', name: 'Yasothon Community College', province: 'Yasothon', capacity_kwp: 48.95, updated_at: '2026-03-02T09:37:49Z' },
  { id: 'c2298270-7849-4b7c-8b9d-f4044c31d3e2', name: 'Trat Community College', province: 'Trat', capacity_kwp: 58.3, updated_at: '2026-02-06T07:26:21Z' },
  { id: '8b5c8a3b-43ef-4259-9c34-734e3d502497', name: 'Mukdahan Community College', province: 'Mukdahan', capacity_kwp: 60.5, updated_at: '2026-03-02T15:26:41Z' },
  { id: 'ba4807c0-9aa4-4574-9828-77b1ae899107', name: 'Sakaeo Community College', province: 'Sakaeo', capacity_kwp: 60.5, updated_at: '2026-02-06T07:27:17Z' },
  { id: 'e2d96e17-57b3-4552-952d-be6bbda494be', name: 'Phichit Community College (Pho Thale)', province: 'Phichit', capacity_kwp: 134.75, updated_at: '2026-05-25T10:28:03Z' },
];

// A single non-solar sample so the library's AFOLU removals path (VM0047 ARR) is
// exercised end-to-end alongside the solar fleet. Census-based agroforestry.
const VM0047_PROJECT_ID = 'prj-vm0047-0001';

export const seedProjects: Project[] = [
  ...CSV_SOLAR_PLANTS.map((p) => ({
    id: p.id, organization_id: seedOrg.id, name: p.name,
    location: `${p.province}, Thailand`, capacity_kwp: p.capacity_kwp,
    commission_date: CSV_CREATED_AT.slice(0, 10), status: 'active' as const,
    lifecycle_stage: 'registered' as const, created_at: CSV_CREATED_AT, updated_at: p.updated_at ?? CSV_CREATED_AT,
  })),
  {
    id: VM0047_PROJECT_ID, organization_id: seedOrg.id, name: 'Mae Chaem Agroforestry ARR',
    location: 'Chiang Mai, Thailand', capacity_kwp: 0,
    commission_date: '2024-09-01', status: 'active', lifecycle_stage: 'registered',
    created_at: '2024-09-01T00:00:00Z', updated_at: '2024-09-01T00:00:00Z',
  },
];

// ---- Registration: one registered T-VER-S-01 PDD per plant ----
const VALIDATOR = 'Daniel Okoye';
const SOLAR_SNAPSHOT = `${TVER_SOLAR_METHODOLOGY.code} ${TVER_SOLAR_METHODOLOGY.version}`;

// Template PDD payload shared by the fleet (all grid-connected rooftop solar).
const SOLAR_SECTION_DATA = {
  technology: 'Solar PV rooftop', grid_connection: 'Grid-connected',
  baseline_scenario: 'Grid electricity displaced by on-site solar generation',
  barrier_type: 'Investment', investment_metric: 'IRR',
  barrier_explanation: 'Project IRR without carbon revenue is below the developer hurdle rate.',
  common_practice: true, performance_ratio: 0.8,
  monitored_parameter: 'EG_PJ', measurement_method: 'Revenue-grade bi-directional meter',
  monitoring_frequency: 'Monthly', qaqc_procedure: 'Monthly meter reads cross-checked against utility bill.',
};

// VM0047 ARR PDD — every A–E field filled so it passes validatePdd().
const VM0047_SECTION_DATA = {
  quantification_approach: 'Census-based', arr_activity: 'Revegetation', area_hectares: 450,
  land_use_change: false,
  baseline_scenario: 'Non-forest / degraded land vs dynamic performance benchmark (matched control plots)',
  barrier_type: 'Institutional',
  barrier_explanation: 'Dispersed smallholder plots lack finance without carbon revenue.',
  common_practice: false, stocking_index_baseline: 0.18, soc_included: true,
  biomass_burning_emissions: 40, n_fertilizer_emissions: 55, leakage_estimate: 120,
  annual_removal_estimate: 5400, monitored_parameter: 'dCO2_removals',
  measurement_method: 'Census of planted stems + allometric models, net of dynamic benchmark',
  monitoring_frequency: 'Annually',
  qaqc_procedure: 'Independent re-census of 10% of plots; control-plot SI re-measured each verification.',
};

export const seedPdds: ProjectDesignDocument[] = [
  ...CSV_SOLAR_PLANTS.map((p, i) => ({
    id: `PDD-S${String(i + 1).padStart(2, '0')}`,
    project_id: p.id, methodology_id: TVER_SOLAR_METHODOLOGY.id,
    methodology_snapshot: SOLAR_SNAPSHOT, state: 'registered' as const,
    section_data: SOLAR_SECTION_DATA, evidence_ids: [],
    assigned_validator_name: VALIDATOR,
    submitted_at: CSV_CREATED_AT, validated_at: p.updated_at ?? CSV_CREATED_AT,
    content_hash: shortHash(`${p.id}-registered`),
  })),
  {
    id: 'PDD-VM0047-01', project_id: VM0047_PROJECT_ID, methodology_id: VERRA_VM0047_METHODOLOGY.id,
    methodology_snapshot: `${VERRA_VM0047_METHODOLOGY.code} ${VERRA_VM0047_METHODOLOGY.version}`,
    state: 'registered', section_data: VM0047_SECTION_DATA, evidence_ids: [],
    assigned_validator_name: VALIDATOR,
    submitted_at: '2024-09-02T00:00:00Z', validated_at: '2024-09-22T00:00:00Z',
    content_hash: shortHash(`${VM0047_PROJECT_ID}-registered`),
  },
];

// ---- Daily generation for the reporting period (2025-12-01 … 2026-06-30) ----
// Modelled from each plant's DC capacity and a seasonal/daily yield curve — this
// is an ESTIMATE for reporting/preview, not metered data.
const GEN_START = '2025-12-01';
const GEN_DAYS = 212; // 2025-12-01 through 2026-06-30 (7 full months)
const PEAK_SUN_HOURS = 4.2; // conservative Thailand annual daily average

function dailyGeneration(kwp: number, dateIso: string, seed: number): number {
  const d = new Date(dateIso);
  const dayOfYear = Math.floor((d.getTime() - new Date(d.getFullYear(), 0, 0).getTime()) / 86400000);
  const seasonal = 0.9 + 0.18 * Math.sin((2 * Math.PI * (dayOfYear - 80)) / 365); // peaks ~Apr
  const jitter = 0.88 + 0.24 * (Math.sin(seed * 9301 + dayOfYear * 49297) * 0.5 + 0.5);
  return Math.round(kwp * PEAK_SUN_HOURS * 0.8 * seasonal * jitter * 10) / 10;
}

function buildFleetRecords(): MonitoringRecord[] {
  const out: MonitoringRecord[] = [];
  const start = new Date(GEN_START);
  let counter = 0;
  CSV_SOLAR_PLANTS.forEach((p, idx) => {
    for (let i = 0; i < GEN_DAYS; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      const date = d.toISOString().slice(0, 10);
      counter++;
      out.push({
        id: uid('mon', counter),
        project_id: p.id,
        record_date: date,
        generation_kwh: dailyGeneration(p.capacity_kwp, date, idx + 1),
        source: 'csv_upload',
        uploaded_at: '2026-07-01T00:00:00Z',
      });
    }
  });
  return out;
}

// Monthly tCO₂e driver records for the VM0047 ARR sample. generation_kwh holds the
// period driver value in the methodology's input_unit (tCO₂e → biomass_stock_change).
function buildVm0047Records(): MonitoringRecord[] {
  const out: MonitoringRecord[] = [];
  const start = new Date('2025-01-01');
  for (let i = 0; i < 4; i++) {
    const d = new Date(start);
    d.setMonth(d.getMonth() + i);
    out.push({
      id: uid('mon-vm0047', i + 1),
      project_id: VM0047_PROJECT_ID,
      record_date: d.toISOString().slice(0, 10),
      generation_kwh: 450,
      source: 'seed_direct',
      uploaded_at: '2026-07-01T00:00:00Z',
    });
  }
  return out;
}

export const seedRecords: MonitoringRecord[] = [...buildFleetRecords(), ...buildVm0047Records()];

// No verification packages, credentials or audit history yet — these accrue as the
// operator builds and anchors verification packages from the generation above.
export const seedEvidence: EvidenceFile[] = [];
export const seedVerifications: VerificationRequest[] = [];
export const seedComments: VerificationComment[] = [];
export const seedCredentials: VerifiableCredential[] = [];
export const seedAudit: AuditLog[] = [];
