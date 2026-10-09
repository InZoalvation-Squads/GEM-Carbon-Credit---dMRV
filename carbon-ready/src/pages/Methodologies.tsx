import { useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Download, Upload } from 'lucide-react';
import { useStore } from '../store';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { Table, THead, TR, TH, TD } from '../components/ui/Table';
import { StatusBadge } from '../components/ui/StatusBadge';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Drawer } from '../components/layout/Drawer';
import { toast } from '../components/layout/Toast';
import { CATEGORY_LABEL } from '../lib/labels';
import { methodologyToJson } from '../lib/methodology-schema';
import { describeCalculation, paramRoleInCalculation } from '../lib/methodology-source';
import { saveBlob } from '../lib/download';
import type { Methodology, PddFieldSchema, PddSectionSchema } from '../types';

function exportMethodology(m: Methodology) {
  const blob = new Blob([methodologyToJson(m)], { type: 'application/json' });
  saveBlob(blob, `${m.code}-v${m.version.replace(/^v/i, '')}.json`);
}

function fieldStateLabel(f: PddFieldSchema): { tone: 'green' | 'gray' | 'violet'; text: string } {
  if (f.type === 'computed') return { tone: 'violet', text: 'Filled in automatically' };
  if (f.required) return { tone: 'green', text: 'Required' };
  return { tone: 'gray', text: 'Optional' };
}

function SectionChip({
  section,
  expanded,
  onToggle,
}: {
  section: PddSectionSchema;
  expanded: boolean;
  onToggle: () => void;
}) {
  const sectionShortTitle = section.title.split(' / ')[0];
  const Icon = expanded ? ChevronDown : ChevronRight;
  return (
    <div className={`rounded-md ring-1 ring-rule bg-ground ${expanded ? 'sm:col-span-2' : ''}`}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={`meth-section-${section.key}`}
        className="flex w-full items-baseline gap-1.5 px-2 py-1 text-left text-xs text-ink-secondary hover:bg-ink-50 min-h-8"
      >
        <Icon size={12} aria-hidden className="translate-y-0.5 text-ink-meta" />
        <span className="font-medium text-ink">{sectionShortTitle}</span>
        <span className="text-ink-meta">· {section.fields.length} {section.fields.length === 1 ? 'item' : 'items'}</span>
      </button>
      {expanded && (
        <div id={`meth-section-${section.key}`} className="border-t border-rule px-2.5 py-2 text-xs">
          {section.help && <p className="mb-2 text-ink-meta">{section.help}</p>}
          <ul className="space-y-1.5">
            {section.fields.map((f) => {
              const state = fieldStateLabel(f);
              return (
                <li key={f.key}>
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-ink">{f.label}</span>
                    {f.unit && <span className="text-ink-meta">({f.unit})</span>}
                    <Badge tone={state.tone}>{state.text}</Badge>
                  </div>
                  {f.help && <p className="mt-0.5 text-ink-meta">{f.help}</p>}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function DetailPanel({ methodology: m }: { methodology: Methodology }) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const calc = describeCalculation(m);
  return (
    <div className="space-y-5 p-1">
      <div>
        <h3 className="text-lg font-semibold leading-snug text-ink">{m.name}</h3>
        <p className="mt-1 text-sm text-ink-meta">{m.sectoral_scope} · {m.standard} {m.version}</p>
      </div>

      {m.usage && (
        <div>
          <div className="mb-2 text-xs font-semibold text-ink-meta">What this methodology is for</div>
          <p
            data-testid="methodology-usage"
            className="rounded-md bg-brand-50 px-3 py-2 text-sm leading-snug text-brand-800 ring-1 ring-brand-100"
          >
            {m.usage}
          </p>
        </div>
      )}

      <div>
        <div className="mb-2 text-xs font-semibold text-ink-meta">What you will fill in</div>
        <p className="mb-2 text-xs text-ink-meta">
          The project design document (PDD) has {m.pdd_sections.length} {m.pdd_sections.length === 1 ? 'section' : 'sections'}. Open a section to see what it asks for.
        </p>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {m.pdd_sections.map((s) => (
            <SectionChip
              key={s.key}
              section={s}
              expanded={expandedKey === s.key}
              onToggle={() => setExpandedKey((cur) => (cur === s.key ? null : s.key))}
            />
          ))}
        </div>
      </div>

      <div>
        <div className="mb-2 text-xs font-semibold text-ink-meta">Evidence to prepare</div>
        <p className="mb-2 text-xs text-ink-meta">Have these documents ready to upload for the project.</p>
        <div className="flex flex-wrap gap-1.5">
          {m.required_evidence.map((c) => (
            <Badge key={c} tone="blue">{CATEGORY_LABEL[c] ?? c}</Badge>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-2 text-xs font-semibold text-ink-meta">What will be measured</div>
        <ul className="space-y-1.5 text-sm text-ink-secondary">
          {m.monitoring_params.map((p) => {
            const role = paramRoleInCalculation(p.key, m);
            return (
              <li
                key={p.key}
                data-testid={`monitoring-param-${p.key}`}
                className="rounded-md bg-ground px-2.5 py-1.5 ring-1 ring-rule"
              >
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-ink">{p.label}</span>
                  <span className="font-mono text-xs text-ink-meta">{p.key}</span>
                </div>
                <div className="mt-0.5 text-xs text-ink-meta">
                  Measured in {p.unit} · {p.frequency} · How: {p.method}
                </div>
                {role && (
                  <div className="mt-0.5 text-xs font-medium text-brand-700">{role}</div>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <div>
        <div className="mb-2 text-xs font-semibold text-ink-meta">How the emission reduction is calculated</div>
        <div
          data-testid="methodology-formula"
          className="rounded-md bg-ground px-3 py-2 text-sm ring-1 ring-rule"
        >
          <div className="font-mono text-xs text-ink">{calc.formula}</div>
          <div className="mt-1 text-xs text-ink-meta">{calc.explanation}</div>
        </div>
      </div>
    </div>
  );
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
      const r = await importMethodology(text); // server mode: resolves after the server import
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
        <Table mobileLabels={["Code", "Name", "Standard", "Version", "Sections", "Status", "Actions"]}>
          <THead>
            <TR><TH>Code</TH><TH>Name</TH><TH>Standard</TH><TH>Version</TH><TH>Sections</TH><TH>Status</TH><TH><span className="sr-only">Actions</span></TH></TR>
          </THead>
          <tbody>
            {methodologies.map((m) => (
              <TR key={m.id} hover>
                <TD className="font-mono text-sm"><button className="min-h-8 text-brand-700 hover:underline" onClick={() => setSelected(m)}>{m.code}</button></TD>
                <TD className="font-medium">{m.name}</TD>
                <TD>{m.standard}</TD>
                <TD>{m.version}</TD>
                <TD>{m.pdd_sections.length}</TD>
                <TD><StatusBadge state={m.status} label={m.status} /></TD>
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
        {selected && <DetailPanel methodology={selected} />}
      </Drawer>
    </div>
  );
}
