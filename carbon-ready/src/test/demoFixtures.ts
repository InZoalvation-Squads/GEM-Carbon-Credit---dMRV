// ============================================================
// Demo fixtures — TEST-ONLY sample world.
//
// The app itself boots from the real imported fleet in src/data/seed.ts and
// carries no mock projects/PDDs/verifications. These fixtures exist purely so
// the feature tests (registration, validation, verification anchoring, Guardian)
// have a rich, deterministic dataset. Call seedDemo() in a test's beforeEach to
// load them into the store.
// ============================================================
import type {
  Project, MonitoringRecord, AuditLog,
  EvidenceFile, VerificationRequest, VerificationComment,
  AuditAction, EntityType, UserRole, VerifiableCredential,
  Methodology, ProjectDesignDocument,
} from '../types';
import { shortHash } from '../lib/hash';
import { TVER_SOLAR_METHODOLOGY } from '../data/methodology-tver-solar';
import {
  TVER_WIND_METHODOLOGY, TVER_BIOMASS_METHODOLOGY, TVER_BIOGAS_METHODOLOGY,
  TVER_FORESTRY_METHODOLOGY, TVER_WASTE_LFG_METHODOLOGY,
  VERRA_VM0042_METHODOLOGY, VERRA_VM0047_METHODOLOGY, CDM_ARACM0003_METHODOLOGY,
} from '../data/methodologies';
import { auditRowHash } from '../store/audit';
import { DEFAULT_GUARDIAN_CONFIG } from '../lib/guardian';
import { seedOrg, seedUser, seedFactors, seedMethodologies } from '../data/seed';
import { useStore } from '../store';

const uid = (p: string, n: number) => `${p}-${String(n).padStart(4, '0')}`;

// One representative project per methodology (9 total). Lifecycle stages are spread so
// every workflow surface has content: seven registered projects generate credits, one sits
// in the validation queue, and one is an editable draft that drives the registration flow.
export const demoProjects: Project[] = [
  { id: 'prj-0001', organization_id: seedOrg.id, name: 'Pune Rooftop Phase 1',       location: 'Pune, India',                  capacity_kwp: 250,   commission_date: '2025-03-15', status: 'active', lifecycle_stage: 'registered',       created_at: '2025-03-15T00:00:00Z', updated_at: '2025-03-15T00:00:00Z' },
  { id: 'prj-0002', organization_id: seedOrg.id, name: 'Korat Wind Farm',            location: 'Nakhon Ratchasima, Thailand',  capacity_kwp: 45000, commission_date: '2025-06-01', status: 'active', lifecycle_stage: 'registered',       created_at: '2025-06-01T00:00:00Z', updated_at: '2025-06-01T00:00:00Z' },
  { id: 'prj-0003', organization_id: seedOrg.id, name: 'Surin Rice-Husk Power',      location: 'Surin, Thailand',              capacity_kwp: 9900,  commission_date: '2025-02-01', status: 'draft',  lifecycle_stage: 'under_validation', created_at: '2025-02-01T00:00:00Z', updated_at: '2025-02-01T00:00:00Z' },
  { id: 'prj-0004', organization_id: seedOrg.id, name: 'Ubon Regenerative Rice',     location: 'Ubon Ratchathani, Thailand',   capacity_kwp: 0,     commission_date: '2025-05-01', status: 'draft',  lifecycle_stage: 'pdd_draft',        created_at: '2025-05-01T00:00:00Z', updated_at: '2025-05-01T00:00:00Z' },
  { id: 'prj-0005', organization_id: seedOrg.id, name: 'Chonburi Pig-Farm Biogas',   location: 'Chonburi, Thailand',           capacity_kwp: 1200,  commission_date: '2025-04-01', status: 'active', lifecycle_stage: 'registered',       created_at: '2025-04-01T00:00:00Z', updated_at: '2025-04-01T00:00:00Z' },
  { id: 'prj-0006', organization_id: seedOrg.id, name: 'Nan Watershed Reforestation', location: 'Nan, Thailand',               capacity_kwp: 0,     commission_date: '2024-07-01', status: 'active', lifecycle_stage: 'registered',       created_at: '2024-07-01T00:00:00Z', updated_at: '2024-07-01T00:00:00Z' },
  { id: 'prj-0007', organization_id: seedOrg.id, name: 'Rayong Landfill Gas',        location: 'Rayong, Thailand',             capacity_kwp: 0,     commission_date: '2025-01-15', status: 'active', lifecycle_stage: 'registered',       created_at: '2025-01-15T00:00:00Z', updated_at: '2025-01-15T00:00:00Z' },
  { id: 'prj-0008', organization_id: seedOrg.id, name: 'Loei Reforestation (CDM)',   location: 'Loei, Thailand',               capacity_kwp: 0,     commission_date: '2024-03-01', status: 'active', lifecycle_stage: 'registered',       created_at: '2024-03-01T00:00:00Z', updated_at: '2024-03-01T00:00:00Z' },
  { id: 'prj-0009', organization_id: seedOrg.id, name: 'Mae Chaem Agroforestry ARR', location: 'Chiang Mai, Thailand',          capacity_kwp: 0,     commission_date: '2024-09-01', status: 'active', lifecycle_stage: 'registered',       created_at: '2024-09-01T00:00:00Z', updated_at: '2024-09-01T00:00:00Z' },
];

const VALIDATOR = 'Daniel Okoye';

// Fully-answered PDD section payloads, one per methodology. Each satisfies its
// methodology's required fields so the registered PDDs pass validatePdd().
const SOLAR_SECTION_DATA = {
  // Official-form cover / preparer / declarations (T-VER-S-F001-PDD)
  project_title_th: 'โครงการผลิตไฟฟ้าจากพลังงานแสงอาทิตย์แบบติดตั้งบนหลังคา',
  project_title_en: 'Solar Rooftop Power Generation Project',
  project_owner: 'GreenGrid Asia',
  project_scale: 'เล็กมาก', crediting_years: '7', crediting_start: '2025-04-01',
  preparer_name: 'Anong Siriwan', coordinator_name: 'Kittipong Chaiyo',
  registered_elsewhere: 'ไม่มี', degradation_pct: 0.4,
  technology: 'Solar PV rooftop', grid_connection: 'Grid-connected',
  baseline_scenario: 'Grid electricity displaced by solar generation',
  barrier_type: 'Investment', investment_metric: 'IRR',
  barrier_explanation: 'Project IRR without carbon revenue is below the developer hurdle rate.',
  common_practice: true, performance_ratio: 0.8,
  monitored_parameter: 'EG_PJ', measurement_method: 'Revenue-grade bi-directional meter',
  monitoring_frequency: 'Monthly', qaqc_procedure: 'Monthly meter reads cross-checked against utility bill.',
};
const WIND_SECTION_DATA = { turbine_count: 15, rated_capacity_mw: 45, grid_connection: 'Grid-connected', baseline_scenario: 'Grid electricity displaced by wind generation', barrier_type: 'Investment', investment_metric: 'IRR', barrier_explanation: 'Wind IRR without carbon revenue below hurdle rate.', common_practice: true, capacity_factor: 0.32, annual_er_estimate: 64000, monitored_parameter: 'EG_PJ', measurement_method: 'Revenue-grade bi-directional meter', monitoring_frequency: 'Monthly', qaqc_procedure: 'Monthly meter reads cross-checked with grid operator settlement.' };
const BIOMASS_SECTION_DATA = { feedstock_type: 'Rice husk', sustainable_sourcing: true, grid_connection: 'Grid-connected', baseline_scenario: 'Grid electricity displaced by biomass generation', barrier_type: 'Investment', investment_metric: 'NPV', barrier_explanation: 'Fuel logistics raise costs above grid parity.', common_practice: false, plant_load_factor: 0.75, annual_er_estimate: 38000, monitored_parameter: 'EG_PJ', measurement_method: 'Revenue-grade bi-directional meter', monitoring_frequency: 'Monthly', qaqc_procedure: 'Meter reads reconciled with weighbridge fuel logs.' };
const BIOGAS_SECTION_DATA = { substrate: 'Livestock manure', digester_type: 'Covered lagoon', grid_connection: 'Grid-connected', baseline_scenario: 'Fossil fuel displaced by biogas', barrier_type: 'Technological', barrier_explanation: 'Digester tech uncommon among regional farms.', common_practice: false, capture_efficiency: 0.85, annual_er_estimate: 9000, monitored_parameter: 'EG_PJ', measurement_method: 'Revenue-grade bi-directional meter', monitoring_frequency: 'Monthly', qaqc_procedure: 'Gas flow cross-checked with generator output.' };
const FORESTRY_SECTION_DATA = { area_hectares: 1200, species: 'Dipterocarpus alatus', land_eligibility: true, baseline_scenario: 'Degraded / non-forest land with no regeneration', barrier_type: 'Institutional', barrier_explanation: 'No funding pathway absent carbon finance.', common_practice: false, growth_rate: 8, annual_er_estimate: 9600, monitored_parameter: 'dC_tree', measurement_method: 'Sample plot survey + allometric equations', monitoring_frequency: 'Annually', qaqc_procedure: 'Independent re-measurement of 10% of plots.' };
const WASTE_LFG_SECTION_DATA = { destruction_device: 'Enclosed flare', site_type: 'Municipal landfill', baseline_flaring: true, baseline_scenario: 'Uncontrolled methane emission to atmosphere', barrier_type: 'Investment', investment_metric: 'IRR', barrier_explanation: 'Capture infrastructure not viable on tipping fees alone.', common_practice: false, collection_efficiency: 0.75, annual_er_estimate: 42000, monitored_parameter: 'M_CH4', measurement_method: 'Flow meter × CH₄ fraction × density', monitoring_frequency: 'Continuous', qaqc_procedure: 'Analyzer calibrated monthly; flare uptime logged.' };
const CDM_SECTION_DATA = { area_hectares: 800, strata_count: 4, land_eligibility: true, baseline_scenario: 'Pre-project degraded land with negligible woody biomass', barrier_type: 'Investment', investment_metric: 'NPV', barrier_explanation: 'Long rotation makes NPV negative without credits.', common_practice: false, leakage_estimate: 300, annual_er_estimate: 7200, monitored_parameter: 'dC_actual', measurement_method: 'Permanent sample plots + allometric models', monitoring_frequency: 'Annually', qaqc_procedure: 'Strata re-survey audited by third party.' };
const VM0047_SECTION_DATA = { quantification_approach: 'Census-based', arr_activity: 'Revegetation', area_hectares: 450, land_use_change: false, baseline_scenario: 'Non-forest / degraded land vs dynamic performance benchmark (matched control plots)', barrier_type: 'Institutional', barrier_explanation: 'Dispersed smallholder plots lack finance without carbon revenue.', common_practice: false, stocking_index_baseline: 0.18, soc_included: true, biomass_burning_emissions: 40, n_fertilizer_emissions: 55, leakage_estimate: 120, annual_removal_estimate: 5400, monitored_parameter: 'dCO2_removals', measurement_method: 'Census of planted stems + allometric models, net of dynamic benchmark', monitoring_frequency: 'Annually', qaqc_procedure: 'Independent re-census of 10% of plots; control-plot SI re-measured each verification.' };

const snap = (m: Methodology) => `${m.code} ${m.version}`;

export const demoPdds: ProjectDesignDocument[] = [
  // Solar — registered; carries the full evidence / verification / anchoring demo.
  {
    id: 'PDD-2000', project_id: 'prj-0001', methodology_id: TVER_SOLAR_METHODOLOGY.id,
    methodology_snapshot: snap(TVER_SOLAR_METHODOLOGY), state: 'registered',
    section_data: SOLAR_SECTION_DATA, evidence_ids: ['ev-0003'],
    assigned_validator_name: VALIDATOR, submitted_at: '2025-03-16T00:00:00Z',
    validated_at: '2025-03-20T00:00:00Z', content_hash: shortHash('PDD-2000-registered'), ipfs_cid: null, credential_id: null,
  },
  // Wind — registered.
  {
    id: 'PDD-2001', project_id: 'prj-0002', methodology_id: TVER_WIND_METHODOLOGY.id,
    methodology_snapshot: snap(TVER_WIND_METHODOLOGY), state: 'registered',
    section_data: WIND_SECTION_DATA, evidence_ids: [],
    assigned_validator_name: VALIDATOR, submitted_at: '2025-06-02T00:00:00Z',
    validated_at: '2025-06-08T00:00:00Z', content_hash: shortHash('PDD-2001-registered'), ipfs_cid: null, credential_id: null,
  },
  // Biomass — submitted and awaiting a validator (project is under_validation).
  {
    id: 'PDD-2002', project_id: 'prj-0003', methodology_id: TVER_BIOMASS_METHODOLOGY.id,
    methodology_snapshot: snap(TVER_BIOMASS_METHODOLOGY), state: 'submitted',
    section_data: BIOMASS_SECTION_DATA, evidence_ids: [],
    assigned_validator_name: VALIDATOR, submitted_at: '2026-06-20T09:00:00Z',
    validated_at: null, content_hash: null, ipfs_cid: null, credential_id: null,
  },
  // VM0042 — editable draft bounced back for revision; drives the registration flow.
  {
    id: 'PDD-2003', project_id: 'prj-0004', methodology_id: VERRA_VM0042_METHODOLOGY.id,
    methodology_snapshot: snap(VERRA_VM0042_METHODOLOGY), state: 'revision_required',
    section_data: { practice_change: 'Cover cropping', crop_type: 'Rice', quantification_approach: 'Hybrid' },
    evidence_ids: [], assigned_validator_name: VALIDATOR,
    submitted_at: '2026-06-10T09:00:00Z', validated_at: null, content_hash: null, ipfs_cid: null, credential_id: null,
    rejection_reason: 'Additionality and monitoring sections incomplete; attach soil sampling plan.',
  },
  // Biogas — registered.
  {
    id: 'PDD-2004', project_id: 'prj-0005', methodology_id: TVER_BIOGAS_METHODOLOGY.id,
    methodology_snapshot: snap(TVER_BIOGAS_METHODOLOGY), state: 'registered',
    section_data: BIOGAS_SECTION_DATA, evidence_ids: [],
    assigned_validator_name: VALIDATOR, submitted_at: '2025-04-02T00:00:00Z',
    validated_at: '2025-04-09T00:00:00Z', content_hash: shortHash('PDD-2004-registered'), ipfs_cid: null, credential_id: null,
  },
  // Forestry — registered.
  {
    id: 'PDD-2005', project_id: 'prj-0006', methodology_id: TVER_FORESTRY_METHODOLOGY.id,
    methodology_snapshot: snap(TVER_FORESTRY_METHODOLOGY), state: 'registered',
    section_data: FORESTRY_SECTION_DATA, evidence_ids: [],
    assigned_validator_name: VALIDATOR, submitted_at: '2024-07-02T00:00:00Z',
    validated_at: '2024-07-20T00:00:00Z', content_hash: shortHash('PDD-2005-registered'), ipfs_cid: null, credential_id: null,
  },
  // Waste / LFG — registered.
  {
    id: 'PDD-2006', project_id: 'prj-0007', methodology_id: TVER_WASTE_LFG_METHODOLOGY.id,
    methodology_snapshot: snap(TVER_WASTE_LFG_METHODOLOGY), state: 'registered',
    section_data: WASTE_LFG_SECTION_DATA, evidence_ids: [],
    assigned_validator_name: VALIDATOR, submitted_at: '2025-01-16T00:00:00Z',
    validated_at: '2025-01-25T00:00:00Z', content_hash: shortHash('PDD-2006-registered'), ipfs_cid: null, credential_id: null,
  },
  // CDM A/R — registered.
  {
    id: 'PDD-2007', project_id: 'prj-0008', methodology_id: CDM_ARACM0003_METHODOLOGY.id,
    methodology_snapshot: snap(CDM_ARACM0003_METHODOLOGY), state: 'registered',
    section_data: CDM_SECTION_DATA, evidence_ids: [],
    assigned_validator_name: VALIDATOR, submitted_at: '2024-03-02T00:00:00Z',
    validated_at: '2024-03-20T00:00:00Z', content_hash: shortHash('PDD-2007-registered'), ipfs_cid: null, credential_id: null,
  },
  // Verra VM0047 ARR (census-based agroforestry) — registered.
  {
    id: 'PDD-2008', project_id: 'prj-0009', methodology_id: VERRA_VM0047_METHODOLOGY.id,
    methodology_snapshot: snap(VERRA_VM0047_METHODOLOGY), state: 'registered',
    section_data: VM0047_SECTION_DATA, evidence_ids: [],
    assigned_validator_name: VALIDATOR, submitted_at: '2024-09-02T00:00:00Z',
    validated_at: '2024-09-22T00:00:00Z', content_hash: shortHash('PDD-2008-registered'), ipfs_cid: null, credential_id: null,
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

// Daily generation for the solar project (the only one with a per-day meter feed).
function buildSolarRecords(): MonitoringRecord[] {
  const out: MonitoringRecord[] = [];
  const solar = demoProjects.find((p) => p.id === 'prj-0001')!;
  let counter = 0;
  for (const date of rangeDates('2025-12-01', 180)) {
    counter++;
    out.push({
      id: uid('mon', counter),
      project_id: solar.id,
      record_date: date,
      generation_kwh: generationFor(solar.capacity_kwp, date, solar.capacity_kwp),
      source: 'csv_upload',
      uploaded_at: '2026-05-26T18:30:00Z',
    });
  }
  return out;
}

// Monthly driver records for the other registered projects.
// generation_kwh holds the period driver value in the methodology's input_unit.
const DRIVER_RECORDS: Array<{ project_id: string; monthly: number; count: number; start: string }> = [
  { project_id: 'prj-0002', monthly: 5_400_000, count: 6, start: '2026-01-01' }, // wind, kWh → grid_displacement
  { project_id: 'prj-0005', monthly: 720_000,   count: 6, start: '2026-01-01' }, // biogas, kWh → grid_displacement
  { project_id: 'prj-0006', monthly: 800,       count: 4, start: '2025-01-01' }, // forestry, tCO2e → biomass_stock_change
  { project_id: 'prj-0007', monthly: 125,       count: 6, start: '2026-01-01' }, // LFG, t CH4 → ch4_avoidance
  { project_id: 'prj-0008', monthly: 600,       count: 4, start: '2025-01-01' }, // CDM A/R, tCO2e → biomass_stock_change
  { project_id: 'prj-0009', monthly: 450,       count: 4, start: '2025-01-01' }, // VM0047 ARR, tCO2e → biomass_stock_change
];

function buildDriverRecords(): MonitoringRecord[] {
  const out: MonitoringRecord[] = [];
  let counter = 100000;
  for (const spec of DRIVER_RECORDS) {
    const start = new Date(spec.start);
    for (let i = 0; i < spec.count; i++) {
      counter++;
      const d = new Date(start);
      d.setMonth(d.getMonth() + i);
      out.push({
        id: uid('mon', counter),
        project_id: spec.project_id,
        record_date: d.toISOString().slice(0, 10),
        generation_kwh: spec.monthly,
        source: 'seed_direct',
        uploaded_at: '2026-06-30T00:00:00Z',
      });
    }
  }
  return out;
}

export const demoRecords: MonitoringRecord[] = [...buildSolarRecords(), ...buildDriverRecords()];

// Evidence (all attached to the solar project).
const U = { id: seedUser.id, name: seedUser.name };

export const demoEvidence: EvidenceFile[] = [
  { id: 'ev-0001v1', project_id: 'prj-0001', parent_id: null, category: 'meter_reading', file_name: 'pune-apr-2026-meter.pdf', kind: 'pdf', file_size: 1_512_220, version_number: 1, status: 'superseded', description: 'Revenue meter reading, Apr-2026 cycle.', content_hash: shortHash('pune-apr-meter-v1'), uploaded_by: U.id, uploaded_by_name: U.name, uploaded_at: '2026-04-30T06:02:00Z' },
  { id: 'ev-0001', project_id: 'prj-0001', parent_id: 'ev-0001v1', category: 'meter_reading', file_name: 'pune-apr-2026-meter.pdf', kind: 'pdf', file_size: 1_640_344, version_number: 2, status: 'active', description: 'Revenue meter reading, Apr-2026 cycle. Serial number now visible.', content_hash: shortHash('pune-apr-meter-v2'), uploaded_by: U.id, uploaded_by_name: U.name, uploaded_at: '2026-05-04T03:11:00Z' },
  { id: 'ev-0002', project_id: 'prj-0001', parent_id: null, category: 'utility_bill', file_name: 'pune-apr-2026-utility-bill.pdf', kind: 'pdf', file_size: 402_118, version_number: 1, status: 'active', description: 'MSEDCL electricity bill, 01–30 Apr 2026.', content_hash: shortHash('pune-apr-bill'), uploaded_by: U.id, uploaded_by_name: U.name, uploaded_at: '2026-05-02T08:25:00Z' },
  { id: 'ev-0003', project_id: 'prj-0001', parent_id: null, category: 'commissioning_report', file_name: 'pune-commissioning-2025-03.pdf', kind: 'pdf', file_size: 2_044_900, version_number: 1, status: 'active', description: 'Grid-connection acceptance, MSEDCL ref IN-2025-04412.', content_hash: shortHash('pune-commissioning'), uploaded_by: U.id, uploaded_by_name: U.name, uploaded_at: '2025-03-16T02:10:00Z' },
  { id: 'ev-0004', project_id: 'prj-0001', parent_id: null, category: 'site_photo', file_name: 'pune-rooftop-array-apr.jpg', kind: 'image', file_size: 3_140_220, version_number: 1, status: 'active', description: 'North array after panel cleaning. Modules: Adani 540W.', content_hash: shortHash('pune-site-photo'), uploaded_by: U.id, uploaded_by_name: U.name, uploaded_at: '2026-05-03T05:40:00Z' },
  { id: 'ev-0005', project_id: 'prj-0001', parent_id: null, category: 'maintenance_report', file_name: 'pune-inverter-log-apr.xlsx', kind: 'xlsx', file_size: 688_400, version_number: 1, status: 'active', description: 'Inverter SCADA export, 15-min granularity.', content_hash: shortHash('pune-inverter-log'), uploaded_by: U.id, uploaded_by_name: U.name, uploaded_at: '2026-05-04T11:02:00Z' },
  { id: 'ev-0009', project_id: 'prj-0001', parent_id: null, category: 'site_photo', file_name: 'pune-drone-q1-overview.png', kind: 'image', file_size: 4_810_000, version_number: 1, status: 'archived', description: 'Superseded by higher-res capture.', content_hash: shortHash('pune-drone'), uploaded_by: U.id, uploaded_by_name: U.name, uploaded_at: '2026-02-10T04:20:00Z' },
];

const REQUIRED: VerificationRequest['required_categories'] =
  ['meter_reading', 'utility_bill', 'commissioning_report', 'site_photo'];

const CEA_SNAPSHOT = 'CEA 2025-v2 · 0.79 kgCO₂e/kWh';

export const demoVerifications: VerificationRequest[] = [
  {
    id: 'VR-1001', project_id: 'prj-0001', created_by: U.id, owner_name: U.name,
    assigned_verifier_name: VALIDATOR, state: 'under_review',
    monitoring_period_start: '2026-04-01', monitoring_period_end: '2026-04-30',
    reduction_kgco2e: 23_700, factors_snapshot: CEA_SNAPSHOT,
    evidence_ids: ['ev-0001', 'ev-0002', 'ev-0003', 'ev-0004', 'ev-0005'],
    required_categories: REQUIRED, submitted_at: '2026-05-04T17:48:00Z',
    locked_at: null, sla_target_days: 7,
    hash_value: null, credential_id: null, anchored_at: null,
    hcs_topic_id: null, hcs_sequence_number: null,
  },
  {
    id: 'VR-1002', project_id: 'prj-0001', created_by: U.id, owner_name: U.name,
    assigned_verifier_name: VALIDATOR, state: 'submitted',
    monitoring_period_start: '2026-02-01', monitoring_period_end: '2026-02-28',
    reduction_kgco2e: 22_100, factors_snapshot: CEA_SNAPSHOT,
    evidence_ids: ['ev-0001', 'ev-0002', 'ev-0003'],
    required_categories: REQUIRED, submitted_at: '2026-05-05T01:05:00Z',
    locked_at: null, sla_target_days: 7,
    hash_value: null, credential_id: null, anchored_at: null,
    hcs_topic_id: null, hcs_sequence_number: null,
  },
  {
    id: 'VR-1003', project_id: 'prj-0001', created_by: U.id, owner_name: U.name,
    assigned_verifier_name: VALIDATOR, state: 'revision_required',
    monitoring_period_start: '2026-01-01', monitoring_period_end: '2026-01-31',
    reduction_kgco2e: 21_400, factors_snapshot: CEA_SNAPSHOT,
    evidence_ids: ['ev-0001', 'ev-0002'],
    required_categories: REQUIRED, submitted_at: '2026-04-06T09:30:00Z',
    locked_at: null, sla_target_days: 7,
    hash_value: null, credential_id: null, anchored_at: null,
    hcs_topic_id: null, hcs_sequence_number: null,
  },
  {
    id: 'VR-1000', project_id: 'prj-0001', created_by: U.id, owner_name: U.name,
    assigned_verifier_name: VALIDATOR, state: 'approved',
    monitoring_period_start: '2026-03-01', monitoring_period_end: '2026-03-31',
    reduction_kgco2e: 24_550, factors_snapshot: CEA_SNAPSHOT,
    evidence_ids: ['ev-0003'],
    required_categories: REQUIRED, submitted_at: '2026-04-08T03:00:00Z',
    locked_at: '2026-04-15T08:22:00Z', sla_target_days: 7,
    hash_value: shortHash('VR-1000-approval-payload'),
    credential_id: 'urn:vc:vr1000seed', anchored_at: '2026-04-15T08:30:00Z',
    hcs_topic_id: DEFAULT_GUARDIAN_CONFIG.topic_id, hcs_sequence_number: 1,
  },
];

export const demoComments: VerificationComment[] = [
  { id: 'cmt-0001', verification_id: 'VR-1001', evidence_id: 'ev-0001', evidence_name: 'pune-apr-2026-meter.pdf', author_id: 'usr-verif', author_name: VALIDATOR, author_role: 'verifier', body: 'Serial number is not legible in v1. Please re-upload a clearer scan of the meter reading.', created_at: '2026-05-04T07:02:00Z' },
  { id: 'cmt-0002', verification_id: 'VR-1001', evidence_id: 'ev-0001', evidence_name: 'pune-apr-2026-meter.pdf', author_id: U.id, author_name: U.name, author_role: 'esg_manager', body: 'Done — uploaded v2 with the serial number clearly in frame.', reply_to: 'cmt-0001', created_at: '2026-05-04T03:13:00Z' },
  { id: 'cmt-0003', verification_id: 'VR-1001', evidence_id: 'ev-0005', evidence_name: 'pune-inverter-log-apr.xlsx', author_id: 'usr-verif', author_name: VALIDATOR, author_role: 'verifier', body: 'Inverter totals reconcile with the utility bill within 1.2%. Cross-checking the site photo timestamp next.', created_at: '2026-05-05T08:40:00Z' },
  { id: 'cmt-0004', verification_id: 'VR-1003', evidence_id: null, author_id: 'usr-verif', author_name: VALIDATOR, author_role: 'verifier', body: 'Missing the commissioning report and a site photo for this period. Please add both before resubmitting.', created_at: '2026-04-07T10:15:00Z' },
];

export const demoCredentials: VerifiableCredential[] = [
  {
    id: 'urn:vc:vr1000seed',
    schema_id: 'mrv-approval-v1',
    issuer_did: DEFAULT_GUARDIAN_CONFIG.issuer_did,
    issued_at: '2026-04-15T08:30:00Z',
    package_hash: shortHash('VR-1000-approval-payload'),
    subject: {
      verification_id: 'VR-1000', project_id: 'prj-0001',
      monitoring_period_start: '2026-03-01', monitoring_period_end: '2026-03-31',
      reduction_tco2e: 24.55, factors_snapshot: CEA_SNAPSHOT,
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

// Audit log — chained (tamper-evident). Specs are chronological;
// buildChain computes row_hash linking each entry to the previous.
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

export const demoAudit: AuditLog[] = buildChain([
  { id: 'aud-0001', user_role: 'project_owner', action: 'PROJECT_CREATED', entity_type: 'project', entity_id: 'prj-0001', payload: { name: 'Pune Rooftop Phase 1' }, new_value: { name: 'Pune Rooftop Phase 1' }, ip_address: '49.36.220.10', created_at: '2025-03-15T09:12:00Z' },
  { id: 'aud-0003', user_role: 'esg_manager', action: 'EMISSION_FACTOR_ADDED', entity_type: 'factor', entity_id: 'ef-0002', payload: { country: 'IN', source: 'CEA', version: 2 }, new_value: { factor_kgco2e_per_kwh: 0.79, version: 2 }, previous_value: { factor_kgco2e_per_kwh: 0.82, version: 1 }, created_at: '2025-04-01T08:00:00Z' },
  { id: 'aud-0002', user_role: 'project_owner', action: 'PROJECT_CREATED', entity_type: 'project', entity_id: 'prj-0002', payload: { name: 'Korat Wind Farm' }, new_value: { name: 'Korat Wind Farm' }, ip_address: '124.122.9.55', created_at: '2025-06-01T10:05:00Z' },
  { id: 'aud-0020', user_role: 'esg_manager', action: 'PROJECT_REGISTERED', entity_type: 'pdd', entity_id: 'PDD-2001', payload: { methodology: snap(TVER_WIND_METHODOLOGY) }, previous_value: { state: 'under_validation' }, new_value: { state: 'registered', content_hash: shortHash('PDD-2001-registered') }, created_at: '2025-06-08T00:00:00Z' },
  { id: 'aud-0010', user_role: 'esg_manager', action: 'VERIFICATION_APPROVED', entity_type: 'verification', entity_id: 'VR-1000', payload: { reduction_tco2e: 24.55 }, previous_value: { state: 'under_review' }, new_value: { state: 'approved', hash_value: shortHash('VR-1000-approval-payload'), locked_at: '2026-04-15T08:22:00Z' }, ip_address: '49.36.220.10', created_at: '2026-04-15T08:22:00Z' },
  { id: 'aud-0010b', user_role: 'esg_manager', action: 'VERIFICATION_ANCHORED', entity_type: 'verification', entity_id: 'VR-1000', payload: { credential_id: 'urn:vc:vr1000seed', topic_id: DEFAULT_GUARDIAN_CONFIG.topic_id, sequence_number: 1 }, previous_value: { anchored: false }, new_value: { credential_id: 'urn:vc:vr1000seed', hcs_topic_id: DEFAULT_GUARDIAN_CONFIG.topic_id, hcs_sequence_number: 1 }, created_at: '2026-04-15T08:30:00Z' },
  { id: 'aud-0004', user_role: 'esg_manager', action: 'CSV_UPLOADED', entity_type: 'monitoring', entity_id: 'prj-0001', payload: { accepted: 180, rejected: 0 }, new_value: { accepted: 180, rejected: 0 }, created_at: '2026-05-04T02:30:00Z' },
  { id: 'aud-0011', user_role: 'project_owner', action: 'EVIDENCE_REPLACED', entity_type: 'evidence', entity_id: 'ev-0001', payload: { file_name: 'pune-apr-2026-meter.pdf' }, previous_value: { version_number: 1, content_hash: shortHash('pune-apr-meter-v1') }, new_value: { version_number: 2, content_hash: shortHash('pune-apr-meter-v2') }, ip_address: '49.36.220.10', created_at: '2026-05-04T03:11:00Z' },
  { id: 'aud-0012', user_role: 'project_owner', action: 'VERIFICATION_SUBMITTED', entity_type: 'verification', entity_id: 'VR-1001', payload: { reduction_tco2e: 23.7, evidence_count: 5 }, previous_value: { state: 'draft' }, new_value: { state: 'submitted' }, ip_address: '49.36.220.10', created_at: '2026-05-04T17:48:00Z' },
  { id: 'aud-0013', user_role: 'verifier', action: 'REVIEW_STARTED', entity_type: 'verification', entity_id: 'VR-1001', payload: {}, previous_value: { state: 'submitted' }, new_value: { state: 'under_review' }, ip_address: '102.89.34.7', created_at: '2026-05-05T02:12:00Z' },
  { id: 'aud-0014', user_role: 'verifier', action: 'COMMENT_ADDED', entity_type: 'verification', entity_id: 'VR-1001', payload: { evidence: 'pune-inverter-log-apr.xlsx' }, new_value: { body: 'Inverter totals reconcile with the utility bill within 1.2%…' }, ip_address: '102.89.34.7', created_at: '2026-05-05T08:40:00Z' },
  { id: 'aud-0015', user_role: 'project_owner', action: 'VERIFICATION_SUBMITTED', entity_type: 'verification', entity_id: 'VR-1002', payload: { reduction_tco2e: 22.1, evidence_count: 3 }, previous_value: { state: 'draft' }, new_value: { state: 'submitted' }, ip_address: '49.36.220.10', created_at: '2026-05-05T01:05:00Z' },
  { id: 'aud-0022', user_role: 'verifier', action: 'PDD_REVISION_REQUESTED', entity_type: 'pdd', entity_id: 'PDD-2003', payload: { summary: 'Additionality and monitoring sections incomplete' }, previous_value: { state: 'under_validation' }, new_value: { state: 'revision_required' }, ip_address: '102.89.34.7', created_at: '2026-06-12T10:00:00Z' },
  { id: 'aud-0021', user_role: 'project_owner', action: 'PDD_SUBMITTED', entity_type: 'pdd', entity_id: 'PDD-2002', payload: { methodology: snap(TVER_BIOMASS_METHODOLOGY) }, previous_value: { state: 'draft' }, new_value: { state: 'submitted' }, ip_address: '124.122.9.55', created_at: '2026-06-20T09:00:00Z' },
]);

// Load the full demo world into the store — call in a test's beforeEach.
export function seedDemo() {
  useStore.setState({
    organization: seedOrg,
    projects: demoProjects,
    records: demoRecords,
    factors: seedFactors,
    calculations: [],
    audit: demoAudit,
    evidence: demoEvidence,
    verifications: demoVerifications,
    comments: demoComments,
    credentials: demoCredentials,
    tokens: [],
    guardianConfig: DEFAULT_GUARDIAN_CONFIG,
    methodologies: seedMethodologies,
    pdds: demoPdds,
  });
}
