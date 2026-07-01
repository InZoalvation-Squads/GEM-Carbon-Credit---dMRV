import { useState, useEffect } from 'react';
import { Card, CardBody, CardHeader } from '../components/Card';
import { Select } from '../components/Select';
import { Button } from '../components/Button';
import { Table, THead, TR, TH, TD } from '../components/Table';
import { PageHeader } from '../components/PageHeader';
import { KpiCard } from '../components/KpiCard';
import { MonthlyReductionChart } from '../components/charts/MonthlyReductionChart';
import { RegistrationGate } from '../components/RegistrationGate';
import { useStore } from '../store';
import { api } from '../lib/api';
import { formatNumber } from '../lib/format';
import { fmtDate } from '../lib/date';
import type { CalculationOutput } from '../lib/calc';
import { Calculator, Leaf, Zap } from 'lucide-react';

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
        {efUsed && (
          <Card className="mb-4 p-4 text-sm">
            <span className="font-medium">Emission Factor:</span>{' '}
            {efUsed.country} / {efUsed.source} v{efUsed.version} —{' '}
            <span className="font-mono">{efUsed.factor_kgco2e_per_kwh} kgCO₂e/kWh</span>{' '}
            <span className="text-ink-500">(effective {fmtDate(efUsed.effective_date)})</span>
          </Card>
        )}

        {result && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              <KpiCard label="Total Generation" value={`${formatNumber(result.totals.generation_kwh, 1)} kWh`} icon={<Zap size={20} />} />
              <KpiCard label="Reduction (kgCO₂e)" value={formatNumber(result.totals.reduction_kgco2e, 1)} icon={<Leaf size={20} />} />
              <KpiCard label="Reduction (tCO₂e)" value={formatNumber(result.totals.reduction_tco2e, 3)} icon={<Leaf size={20} />} />
            </div>

            <Card className="mb-4">
              <CardHeader title="Monthly Reduction Trend" />
              <CardBody><MonthlyReductionChart data={result.monthly.map((m) => ({ period: m.period, tco2e: m.reduction_kgco2e / 1000 }))} /></CardBody>
            </Card>

            <Card>
              <div className="px-5 py-4 border-b border-ink-100 flex gap-2">
                {(['daily', 'monthly', 'total'] as Tab[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={'px-3 py-1.5 text-sm rounded-md ' + (tab === t ? 'bg-brand-50 text-brand-700' : 'text-ink-500 hover:text-ink-900')}
                  >{t[0].toUpperCase() + t.slice(1)}</button>
                ))}
              </div>
              <CardBody className="p-0">
                {tab === 'daily' && (
                  <Table>
                    <THead><TR><TH>Date</TH><TH className="text-right">kWh</TH><TH className="text-right">kgCO₂e</TH></TR></THead>
                    <tbody>
                      {result.daily.slice(-90).reverse().map((d) => (
                        <TR key={d.date}><TD>{fmtDate(d.date)}</TD><TD className="text-right">{formatNumber(d.generation_kwh, 1)}</TD><TD className="text-right">{formatNumber(d.reduction_kgco2e, 1)}</TD></TR>
                      ))}
                    </tbody>
                  </Table>
                )}
                {tab === 'monthly' && (
                  <Table>
                    <THead><TR><TH>Month</TH><TH className="text-right">kWh</TH><TH className="text-right">tCO₂e</TH></TR></THead>
                    <tbody>
                      {result.monthly.map((m) => (
                        <TR key={m.period}><TD>{m.period}</TD><TD className="text-right">{formatNumber(m.generation_kwh, 1)}</TD><TD className="text-right">{formatNumber(m.reduction_kgco2e / 1000, 3)}</TD></TR>
                      ))}
                    </tbody>
                  </Table>
                )}
                {tab === 'total' && (
                  <div className="p-6 text-center">
                    <div className="text-4xl font-semibold">{formatNumber(result.totals.reduction_tco2e, 2)} tCO₂e</div>
                    <div className="mt-2 text-sm text-ink-500">across {formatNumber(result.totals.generation_kwh, 0)} kWh of generation</div>
                  </div>
                )}
              </CardBody>
            </Card>
          </>
        )}
      </RegistrationGate>
    </div>
  );
}
