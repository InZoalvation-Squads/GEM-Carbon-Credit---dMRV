import { useStore } from './index';
import { calculateCarbon } from '../lib/calc';
import { locationToCountryCode } from '../lib/geo';

export function useDashboardSummary() {
  const projects = useStore((s) => s.projects);
  const records  = useStore((s) => s.records);
  const factors  = useStore((s) => s.factors);

  const activeProjects = projects.filter((p) => p.status === 'active').length;
  const latestUpload = records.reduce<string | null>(
    (latest, r) => (!latest || r.uploaded_at > latest ? r.uploaded_at : latest),
    null
  );

  let totalGen = 0;
  let totalRedKg = 0;
  const dailyMap = new Map<string, number>();
  const monthlyMap = new Map<string, number>();

  for (const project of projects) {
    const country = project.location.split(',').pop()?.trim() ?? '';
    const countryCode = locationToCountryCode(country);
    const projectFactors = factors.filter((f) => f.country === countryCode);
    const projectRecords = records.filter((r) => r.project_id === project.id);
    const r = calculateCarbon(projectRecords, projectFactors);
    totalGen += r.totals.generation_kwh;
    totalRedKg += r.totals.reduction_kgco2e;
    for (const d of r.daily) {
      dailyMap.set(d.date, (dailyMap.get(d.date) ?? 0) + d.generation_kwh);
    }
    for (const m of r.monthly) {
      monthlyMap.set(m.period, (monthlyMap.get(m.period) ?? 0) + m.reduction_kgco2e);
    }
  }

  const daily_generation = [...dailyMap.entries()]
    .map(([date, kwh]) => ({ date, kwh }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-90);

  const monthly_reduction = [...monthlyMap.entries()]
    .map(([period, kg]) => ({ period, tco2e: kg / 1000 }))
    .sort((a, b) => a.period.localeCompare(b.period));

  return {
    kpis: {
      total_generation_kwh: totalGen,
      total_reduction_tco2e: totalRedKg / 1000,
      active_projects: activeProjects,
      latest_upload_at: latestUpload,
    },
    daily_generation,
    monthly_reduction,
  };
}
