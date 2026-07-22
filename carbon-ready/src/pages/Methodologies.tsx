import { useRef, useState } from 'react';
import { Download, Upload } from 'lucide-react';
import { useStore } from '../store';
import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/Card';
import { Table, THead, TR, TH, TD } from '../components/Table';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Drawer } from '../components/Drawer';
import { toast } from '../components/Toast';
import { CATEGORY_LABEL } from '../lib/labels';
import { methodologyToJson } from '../lib/methodology-schema';
import type { Methodology } from '../types';

function exportMethodology(m: Methodology) {
  const blob = new Blob([methodologyToJson(m)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${m.code}-v${m.version.replace(/^v/i, '')}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function Methodologies() {
  const methodologies = useStore((s) => s.methodologies);
  const role = useStore((s) => s.currentUser.role);
  const importMethodology = useStore((s) => s.importMethodology);
  const [selected, setSelected] = useState<Methodology | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const onImportFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const text = await file.text();
      const r = importMethodology(text);
      if (r.ok && r.methodology) {
        const m = r.methodology;
        toast.success('Methodology imported', `${m.code} ${m.version} (${m.status}) added to the library.`);
      } else {
        toast.error('Import failed', r.error);
      }
    } catch (e) {
      toast.error('Import failed', `Could not read the file: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div>
      <PageHeader
        title="Methodologies"
        subtitle="Approved carbon methodologies (Guardian policies) that drive project registration"
        action={role === 'admin' ? (
          <>
            <input
              ref={fileRef} type="file" accept=".json,application/json" className="hidden"
              onChange={(e) => onImportFile(e.target.files?.[0])}
            />
            <Button variant="secondary" onClick={() => fileRef.current?.click()}>
              <Upload size={16} aria-hidden /> Import methodology
            </Button>
          </>
        ) : undefined}
      />
      <Card>
        <Table>
          <THead>
            <TR><TH>Code</TH><TH>Name</TH><TH>Standard</TH><TH>Version</TH><TH>Sections</TH><TH>Status</TH><TH><span className="sr-only">Actions</span></TH></TR>
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
                <TD className="text-right">
                  <Button variant="ghost" size="sm" onClick={() => exportMethodology(m)} title={`Download ${m.code} as JSON`}>
                    <Download size={14} aria-hidden /> Export JSON
                  </Button>
                </TD>
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
