import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Activity, Upload, ExternalLink } from 'lucide-react';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { HeadBlock } from '../components/ui/HeadBlock';
import { BlockRow, ChainList } from '../components/ui/BlockRow';
import { LinkButton } from '../components/ui/Button';
import { PageHeader } from '../components/layout/PageHeader';
import { EmptyState } from '../components/ui/EmptyState';
import { DailyGenerationChart, MonthlyReductionChart } from '../components/charts/LazyCharts';
import { calculateCarbon } from '../lib/calc';
import { locationToCountryCode } from '../lib/geo';
import { useStore } from '../store';
import { ACTION_LABEL, sourceLabel } from '../lib/labels';
import { formatKwh, formatNumber } from '../lib/format';
import { displayHcs } from '../lib/guardian';
import { fmtDateTime, fmtDate } from '../lib/date';

export function Dashboard() {
  const allAudit = useStore((s) => s.audit);
  const audit = useMemo(() => allAudit.slice(0, 6), [allAudit]);
  const credentials = useStore((s) => s.credentials);
  const projects = useStore((s) => s.projects);
  const records = useStore((s) => s.records);
  const calculations = useStore((s) => s.calculations);
  const factors = useStore((s) => s.factors);
  const verifications = useStore((s) => s.verifications);
  // Same aggregation as useDashboardSummary, cached here without modifying the store.
  const summary = useMemo(() => {
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
  }, [projects, records, factors]);
  const latest = useMemo(() => projects.flatMap((project) => {
    const record = records.filter((r) => r.project_id === project.id).sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at) || b.record_date.localeCompare(a.record_date))[0];
    const calculation = calculations.filter((c) => c.project_id === project.id).sort((a, b) => b.calculated_at.localeCompare(a.calculated_at))[0];
    if (!record && !calculation) return [];
    const useCalculation = calculation && (!record || calculation.calculated_at > record.uploaded_at);
    const verification = !useCalculation && record ? verifications.find((v) => v.project_id === project.id && v.state === 'approved' && record.record_date >= v.monitoring_period_start && record.record_date <= v.monitoring_period_end) : undefined;
    const factor = useCalculation && factors.find((f) => f.id === calculation.emission_factor_id);
    return [{ project, record, calculation: useCalculation ? calculation : undefined, verification, factor }];
  }), [projects, records, calculations, verifications, factors]);

  return <div className="space-y-6">
    <PageHeader title="Dashboard" subtitle="Overview of your solar rooftop portfolio"
      action={<LinkButton to="/upload"><Upload size={16} /> Upload monitoring data</LinkButton>} />
    <HeadBlock figures={[
      { label: 'Total Generation', value: formatKwh(summary.kpis.total_generation_kwh), source: 'Monitoring records · CSV / IoT' },
      { label: 'Carbon Reduction', value: formatNumber(summary.kpis.total_reduction_tco2e, 2), unit: 'tCO₂e', source: 'Monitoring × grid emission factors' },
      { label: 'Active Projects', value: summary.kpis.active_projects, source: 'Project registry · Active' },
      { label: 'Latest Upload', value: summary.kpis.latest_upload_at ? fmtDateTime(summary.kpis.latest_upload_at) : '—', source: 'Monitoring upload timestamp' },
    ]} />
    <Card><CardHeader title="Daily Generation Trend" /><CardBody><DailyGenerationChart data={summary.daily_generation} /></CardBody></Card>
    <div className="grid grid-cols-12 gap-6">
      <section className="col-span-12 min-w-0 lg:col-span-8">
        <h2 className="mb-3 text-lg font-semibold">Latest blocks</h2>
        {latest.length ? <ChainList>{latest.map(({ project, record, calculation, verification, factor }) => <BlockRow key={project.id}
          blockId={calculation?.id ?? record!.id} to={`/projects/${project.id}`} state={verification?.credential_id ? 'anchored' : verification ? 'approved' : project.status} hash={verification?.hash_value ?? undefined}
          figure={<span>{project.name} · <span className="whitespace-nowrap">{calculation ? `${formatNumber(calculation.reduction_kgco2e / 1000, 2)} tCO₂e` : formatKwh(record!.generation_kwh)}</span></span>}
          source={calculation ? `${factor ? `EF ${factor.country}/${factor.source} v${factor.version}` : calculation.emission_factor_id} · ${fmtDateTime(calculation.calculated_at)}` : <>{sourceLabel(record!.source)} · {fmtDate(record!.record_date)}</>}
          magnitude={calculation ? { value: calculation.reduction_kgco2e, visibleValues: latest.flatMap((r) => r.calculation ? [r.calculation.reduction_kgco2e] : []) } : undefined}>
          {verification?.hash_value && <Link to={`/verifications/${verification.id}`} className="mt-2 inline-block text-sm text-brand-600 underline">{verification.id} · {verification.credential_id ? 'Anchored' : 'Approved'}</Link>}
        </BlockRow>)}</ChainList> : <Card><EmptyState title="No records uploaded yet." action={<Link to="/upload" className="text-brand-600 underline">Upload monitoring data</Link>} /></Card>}
      </section>
      <section className="col-span-12 min-w-0 lg:col-span-4">
        {credentials.length > 0 && <section className="mb-6">
          <h2 className="mb-3 text-lg font-semibold">Guardian</h2>
          <ChainList density="compact">{credentials.slice(0, 3).map((credential) => <BlockRow density="compact" key={credential.id} blockId={credential.id}
            figure={<Link to="/guardian" className="text-brand-600 hover:underline">{String(credential.subject.project_name ?? projects.find((p) => p.id === credential.subject.project_id)?.name ?? credential.subject.project_id ?? credential.id)}</Link>}
            state="anchored" hash={credential.package_hash} source={fmtDateTime(credential.issued_at)}>
            <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-xs text-ink-meta">
              <span>{displayHcs(credential).topic_id} · #{displayHcs(credential).sequence_number}</span>
              <a href={displayHcs(credential).explorer_url} className="inline-flex min-h-8 items-center gap-1 font-sans text-sm text-brand-600 underline" target="_blank" rel="noreferrer">HashScan <ExternalLink size={14} /></a>
            </div>
          </BlockRow>)}</ChainList>
        </section>}
        <h2 className="mb-3 text-lg font-semibold">Recent Activity</h2>
        {audit.length ? <ChainList density="compact">{audit.map((a) => <BlockRow density="compact" key={a.id} blockId={a.id}
          figure={ACTION_LABEL[a.action] ?? a.action} source={<span className="font-mono text-xs">{fmtDateTime(a.created_at)}</span>}
          state={a.hcs_sequence_number != null ? 'anchored' : 'active'} hash={a.row_hash ?? undefined} />)}</ChainList> : <Card><EmptyState icon={<Activity size={22} />} illustration="/illustrations/empty-activity.webp" title="No activity yet" hint="Actions across the platform will appear here."
          action={<Link to="/upload" className="text-brand-600 underline">Upload monitoring data</Link>} /></Card>}
      </section>
    </div>
    <Card><CardHeader title="Monthly Carbon Reduction" /><CardBody><MonthlyReductionChart data={summary.monthly_reduction} /></CardBody></Card>
  </div>;
}
