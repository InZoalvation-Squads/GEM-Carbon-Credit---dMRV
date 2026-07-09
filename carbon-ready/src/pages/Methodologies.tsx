import { useState } from 'react';
import { useStore } from '../store';
import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/Card';
import { Table, THead, TR, TH, TD } from '../components/Table';
import { Badge } from '../components/Badge';
import { Drawer } from '../components/Drawer';
import { CATEGORY_LABEL } from '../lib/labels';
import type { Methodology } from '../types';

export function Methodologies() {
  const methodologies = useStore((s) => s.methodologies);
  const [selected, setSelected] = useState<Methodology | null>(null);

  return (
    <div>
      <PageHeader title="Methodologies" subtitle="Approved carbon methodologies (Guardian policies) that drive project registration" />
      <Card>
        <Table>
          <THead>
            <TR><TH>Code</TH><TH>Name</TH><TH>Standard</TH><TH>Version</TH><TH>Sections</TH><TH>Status</TH></TR>
          </THead>
          <tbody>
            {methodologies.map((m) => (
              <TR key={m.id} hover>
                <TD className="font-mono text-sm"><button className="text-brand-700 hover:underline" onClick={() => setSelected(m)}>{m.code}</button></TD>
                <TD className="font-medium">{m.name}</TD>
                <TD>{m.standard}</TD>
                <TD>{m.version}</TD>
                <TD>{m.pdd_sections.length}</TD>
                <TD><Badge tone={m.status === 'active' ? 'green' : 'gray'}>{m.status}</Badge></TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </Card>

      <Drawer open={!!selected} onClose={() => setSelected(null)} title={selected?.code ?? ''} size="lg">
        {selected && (
          <div className="space-y-5 p-1">
            <div>
              <h3 className="text-lg font-semibold leading-snug text-ink-900">{selected.name}</h3>
              <p className="mt-1 text-sm text-ink-500">{selected.sectoral_scope} · {selected.standard} {selected.version}</p>
            </div>
            <div>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-400">PDD sections</div>
              <div className="flex flex-wrap gap-1.5">
                {selected.pdd_sections.map((s) => (
                  <span key={s.key} className="inline-flex items-baseline gap-1 rounded-md bg-ink-50 px-2 py-1 text-xs text-ink-700 ring-1 ring-ink-100">
                    {s.title.split(' / ')[0]}<span className="text-ink-400">· {s.fields.length}</span>
                  </span>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-400">Required evidence</div>
              <div className="flex flex-wrap gap-1.5">
                {selected.required_evidence.map((c) => (
                  <Badge key={c} tone="blue">{CATEGORY_LABEL[c] ?? c}</Badge>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-400">Monitoring parameters</div>
              <ul className="space-y-1.5 text-sm text-ink-700">
                {selected.monitoring_params.map((p) => (
                  <li key={p.key} className="flex flex-wrap items-baseline gap-x-2 rounded-md bg-ink-50 px-2.5 py-1.5 ring-1 ring-ink-100">
                    <span className="font-mono text-xs text-ink-900">{p.key}</span>
                    <span className="text-ink-700">— {p.label}</span>
                    <span className="text-xs text-ink-400">({p.unit}, {p.frequency})</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
