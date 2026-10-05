import { useState, useEffect } from 'react';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { Select } from '../components/ui/Select';
import { Button } from '../components/ui/Button';
import { Table, THead, TR, TH, TD } from '../components/ui/Table';
import { PageHeader } from '../components/layout/PageHeader';
import { HeadBlock } from '../components/ui/HeadBlock';
import { Tabs } from '../components/ui/Tabs';
import { MonthlyReductionChart } from '../components/charts/LazyCharts';
import { RegistrationGate } from '../components/project/RegistrationGate';
import { EmptyState } from '../components/ui/EmptyState';
import { ChartSkeleton, HeadBlockSkeleton, SkeletonRows } from '../components/ui/Skeleton';
import { useStore } from '../store';
import { api } from '../lib/api';
import { formatNumber } from '../lib/format';
import { fmtDate, monthLabel } from '../lib/date';
import type { CalculationOutput } from '../lib/calc';
import { Calculator } from 'lucide-react';

type Tab = 'daily' | 'monthly' | 'total';

export function Calculations() {
  const projects = useStore((s) => s.projects);
  const factors = useStore((s) => s.factors);
  const [projectId, setProjectId] = useState(projects[0]?.id ?? '');
  const [tab, setTab] = useState<Tab>('monthly');
  const [result, setResult] = useState<CalculationOutput | null>(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    if (!projectId) return;
    setLoading(true);
    const r = await api.calculate(projectId);
    setResult(r);
    setLoading(false);
  };
  useEffect(() => { run(); /* run on project change */ }, [projectId]);

  const efUsed = result?.emission_factor_id ? factors.find((f) => f.id === result.emission_factor_id) : null;

  return (
    <div>
      <PageHeader
        title="Calculations"
        subtitle="Apply emission factors to monitoring data and roll up daily / monthly / total reductions."
        action={<Button onClick={run} disabled={loading}><Calculator size={16} /> {loading ? 'Calculating...' : 'Run Calculation'}</Button>}
      />

      <Card className="mb-4 p-4">
        <Select label="Project" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
      </Card>

      <RegistrationGate projectId={projectId}>
        {loading && <div role="status" aria-label="Calculating..." className="space-y-6">
          <span className="sr-only">Calculating...</span>
          <HeadBlockSkeleton figures={3} />
          <Card><CardHeader title="Monthly Reduction Trend" /><CardBody><ChartSkeleton /></CardBody></Card>
          <Card><SkeletonRows columns={3} /></Card>
        </div>}
        {efUsed && (
          <Card className="mb-4 p-4 text-sm">
            <span className="font-medium">Emission Factor:</span>{' '}
            {efUsed.country} / {efUsed.source} v{efUsed.version} —{' '}
            <span className="font-mono">{formatNumber(efUsed.factor_kgco2e_per_kwh, 4)} kgCO₂e/kWh</span>{' '}
            <span className="text-ink-meta">(effective {fmtDate(efUsed.effective_date)})</span>
          </Card>
        )}

        {result && result.daily.length === 0 && !loading && (
          <Card>
            <EmptyState
              icon={<Calculator size={28} />}
              illustration="/illustrations/empty-activity.webp" title="No monitoring data yet"
              hint="Upload a CSV or sync IoT data for this project — reductions are computed from daily generation records."
            />
          </Card>
        )}

        {result && result.daily.length > 0 && !loading && (
          <>
            <HeadBlock className="mb-6" figures={[
              { label: 'Total Generation', value: `${formatNumber(result.totals.generation_kwh, 1)} kWh`, source: efUsed ? `EF ${efUsed.country}/${efUsed.source} v${efUsed.version}` : '—' },
              { label: 'Reduction (kgCO₂e)', value: formatNumber(result.totals.reduction_kgco2e, 1), source: efUsed ? `EF ${efUsed.country}/${efUsed.source} v${efUsed.version}` : '—' },
              { label: 'Reduction (tCO₂e)', value: formatNumber(result.totals.reduction_tco2e, 3), source: efUsed ? `EF ${efUsed.country}/${efUsed.source} v${efUsed.version}` : '—' },
            ]} />

            <Card className="mb-4">
              <CardHeader title="Monthly Reduction Trend" />
              <CardBody><MonthlyReductionChart data={result.monthly.map((m) => ({ period: m.period, tco2e: m.reduction_kgco2e / 1000 }))} /></CardBody>
            </Card>

            <Card>
              <Tabs className="px-5" label="Calculation period" value={tab} onChange={setTab}
                items={(['daily', 'monthly', 'total'] as Tab[]).map((t) => ({ value: t, label: t[0].toUpperCase() + t.slice(1), content: <>
                {t === 'daily' && (
                  <Table>
                    <THead><TR><TH>Date</TH><TH className="text-right">kWh</TH><TH className="text-right">kgCO₂e</TH></TR></THead>
                    <tbody>
                      {result.daily.slice(-90).reverse().map((d) => (
                        <TR key={d.date}><TD>{fmtDate(d.date)}<div className="text-xs text-ink-meta">{efUsed ? `EF ${efUsed.country}/${efUsed.source} v${efUsed.version}` : '—'}</div></TD><TD className="text-right">{formatNumber(d.generation_kwh, 1)}</TD><TD className="text-right">{formatNumber(d.reduction_kgco2e, 1)}</TD></TR>
                      ))}
                    </tbody>
                  </Table>
                )}
                {t === 'monthly' && (
                  <Table>
                    <THead><TR><TH>Month</TH><TH className="text-right">kWh</TH><TH className="text-right">tCO₂e</TH></TR></THead>
                    <tbody>
                      {result.monthly.map((m) => (
                        <TR key={m.period}><TD>{monthLabel(m.period)}<div className="text-xs text-ink-meta">{efUsed ? `EF ${efUsed.country}/${efUsed.source} v${efUsed.version}` : '—'}</div></TD><TD className="text-right">{formatNumber(m.generation_kwh, 1)}</TD><TD className="text-right">{formatNumber(m.reduction_kgco2e / 1000, 3)}</TD></TR>
                      ))}
                    </tbody>
                  </Table>
                )}
                {t === 'total' && (
                  <div className="p-6 text-center">
                    <p className="mb-2 text-xs text-ink-meta">{efUsed ? `EF ${efUsed.country}/${efUsed.source} v${efUsed.version}` : '—'}</p>
                    <div className="text-2xl font-semibold">{formatNumber(result.totals.reduction_tco2e, 2)} tCO₂e</div>
                    <div className="mt-2 text-sm text-ink-meta">across {formatNumber(result.totals.generation_kwh, 0)} kWh of generation</div>
                  </div>
                )}
                </> }))} />
            </Card>
          </>
        )}
      </RegistrationGate>
    </div>
  );
}
