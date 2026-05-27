import type {
  Organization, Project, MonitoringRecord, EmissionFactor, User, AuditLog
} from '../types';

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
  { id: 'prj-0001', organization_id: seedOrg.id, name: 'Pune Rooftop Phase 1',  location: 'Pune, India',     capacity_kwp: 250,  commission_date: '2025-03-15', status: 'active', created_at: '2025-03-15T00:00:00Z', updated_at: '2025-03-15T00:00:00Z' },
  { id: 'prj-0002', organization_id: seedOrg.id, name: 'Bangkok Industrial Park',location: 'Bangkok, Thailand',capacity_kwp: 820,  commission_date: '2024-11-01', status: 'active', created_at: '2024-11-01T00:00:00Z', updated_at: '2024-11-01T00:00:00Z' },
  { id: 'prj-0003', organization_id: seedOrg.id, name: 'Hanoi Warehouse Cluster',location: 'Hanoi, Vietnam',  capacity_kwp: 510,  commission_date: '2026-02-10', status: 'draft',  created_at: '2026-02-10T00:00:00Z', updated_at: '2026-02-10T00:00:00Z' },
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

export const seedAudit: AuditLog[] = [
  { id: 'aud-0001', user_id: seedUser.id, action: 'PROJECT_CREATED', entity_type: 'project', entity_id: 'prj-0001', payload: { name: 'Pune Rooftop Phase 1' }, hcs_topic_id: null, hcs_sequence_number: null, created_at: '2025-03-15T09:12:00Z' },
  { id: 'aud-0002', user_id: seedUser.id, action: 'PROJECT_CREATED', entity_type: 'project', entity_id: 'prj-0002', payload: { name: 'Bangkok Industrial Park' }, hcs_topic_id: null, hcs_sequence_number: null, created_at: '2024-11-01T10:05:00Z' },
  { id: 'aud-0003', user_id: seedUser.id, action: 'EMISSION_FACTOR_ADDED', entity_type: 'factor', entity_id: 'ef-0002', payload: { country: 'IN', source: 'CEA', version: 2 }, hcs_topic_id: null, hcs_sequence_number: null, created_at: '2025-04-01T08:00:00Z' },
  { id: 'aud-0004', user_id: seedUser.id, action: 'CSV_UPLOADED', entity_type: 'monitoring', entity_id: 'prj-0001', payload: { accepted: 180, rejected: 0 }, hcs_topic_id: null, hcs_sequence_number: null, created_at: '2026-05-26T18:30:00Z' },
];
