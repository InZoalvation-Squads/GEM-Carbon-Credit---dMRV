import { useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Download, ExternalLink, Upload } from 'lucide-react';
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
import {
  codeReferencesFor,
  codeUrl,
  describeCalculation,
  GENERIC_PDD_EDITOR_PATH,
  paramRoleInCalculation,
  sectionImplementationFor,
  usesGenericPddEditor,
  type CodeReference,
} from '../lib/methodology-source';
import { saveBlob } from '../lib/download';
import type { Methodology, PddFieldSchema, PddSectionSchema } from '../types';

function exportMethodology(m: Methodology) {
  const blob = new Blob([methodologyToJson(m)], { type: 'application/json' });
  saveBlob(blob, `${m.code}-v${m.version.replace(/^v/i, '')}.json`);
}

function fieldStateLabel(f: PddFieldSchema): { tone: 'green' | 'gray' | 'violet'; text: string } {
  if (f.type === 'computed') return { tone: 'violet', text: 'computed' };
  if (f.required) return { tone: 'green', text: 'required' };
  return { tone: 'gray', text: 'optional' };
}

function CodeLink({ path, url }: { path: string; url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-baseline gap-1 font-mono text-xs text-brand-700 hover:underline"
    >
      {path}
      <ExternalLink size={11} aria-hidden className="translate-y-0.5" />
    </a>
  );
}

function SectionChip({
  section,
  impl,
  expanded,
  onToggle,
}: {
  section: PddSectionSchema;
  impl: { entry: CodeReference; renderer: CodeReference | null };
  expanded: boolean;
  onToggle: () => void;
}) {
  const sectionShortTitle = section.title.split(' / ')[0];
  const Icon = expanded ? ChevronDown : ChevronRight;
  return (
    <div className="rounded-md ring-1 ring-rule bg-ground">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={`meth-section-${section.key}`}
        className="flex w-full items-baseline gap-1.5 px-2 py-1 text-left text-xs text-ink-secondary hover:bg-ink-50 min-h-8"
      >
        <Icon size={12} aria-hidden className="translate-y-0.5 text-ink-meta" />
        <span className="font-medium text-ink">{sectionShortTitle}</span>
        <span className="text-ink-meta">· {section.fields.length}</span>
      </button>
      {expanded && (
        <div id={`meth-section-${section.key}`} className="border-t border-rule px-2.5 py-2 text-xs">
          {section.help && <p className="mb-2 text-ink-meta">{section.help}</p>}
          <div data-testid={`section-impl-${section.key}`} className="mb-2 space-y-0.5">
            <div className="flex flex-wrap items-baseline gap-x-1.5">
              <span className="text-ink-meta">{impl.entry.kind}:</span>
              <CodeLink path={impl.entry.path} url={impl.entry.url} />
            </div>
            {impl.renderer ? (
              <div className="flex flex-wrap items-baseline gap-x-1.5">
                <span className="text-ink-meta">{impl.renderer.kind} ({impl.renderer.note}):</span>
                <CodeLink path={impl.renderer.path} url={impl.renderer.url} />
              </div>
            ) : (
              <div className="flex flex-wrap items-baseline gap-x-1.5">
                <span className="text-ink-meta">No dedicated renderer for this section — the generic PDD editor renders it:</span>
                <CodeLink path={GENERIC_PDD_EDITOR_PATH} url={codeUrl(GENERIC_PDD_EDITOR_PATH)} />
              </div>
            )}
          </div>
          <ul className="space-y-1">
            {section.fields.map((f) => {
              const state = fieldStateLabel(f);
              return (
                <li key={f.key} className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-mono text-[11px] text-ink">{f.key}</span>
                  <span className="text-ink-secondary">{f.label}</span>
                  {f.unit && <span className="text-ink-meta">({f.unit})</span>}
                  <Badge tone={state.tone}>{state.text}</Badge>
                  <span className="text-ink-meta">· {f.type}{f.source ? ` (${f.source})` : ''}</span>
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
  const refs = codeReferencesFor(m);
  const sectionImpl = sectionImplementationFor(m);
  const calc = describeCalculation(m.calculation);
  return (
    <div className="space-y-5 p-1">
      <div>
        <h3 className="text-lg font-semibold leading-snug text-ink">{m.name}</h3>
        <p className="mt-1 text-sm text-ink-meta">{m.sectoral_scope} · {m.standard} {m.version}</p>
      </div>

      {m.usage && (
        <p
          data-testid="methodology-usage"
          className="rounded-md bg-brand-50 px-3 py-2 text-sm leading-snug text-brand-800 ring-1 ring-brand-100"
        >
          {m.usage}
        </p>
      )}

      <div>
        <div className="mb-2 text-xs font-semibold text-ink-meta">Code references</div>
        <ul className="space-y-1.5 text-sm">
          {!m.source_path && (
            <li data-testid="no-code-definition" className="text-xs text-ink-meta">
              No bundled code definition — this methodology is defined by its imported JSON document.
            </li>
          )}
          {refs.map((r) => (
            <li key={r.kind} className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-xs font-medium text-ink-secondary">{r.kind}:</span>
              <CodeLink path={r.path} url={r.url} />
              {r.note && <span className="text-xs text-ink-meta">— {r.note}</span>}
            </li>
          ))}
          {usesGenericPddEditor(m) && (
            <li className="text-xs text-ink-meta">
              No official-form template bound — the PDD renders through the generic editor at{' '}
              <CodeLink path={GENERIC_PDD_EDITOR_PATH} url={codeUrl(GENERIC_PDD_EDITOR_PATH)} />
            </li>
          )}
          <li data-testid="no-guardian-policy" className="text-xs text-ink-meta">
            Guardian policy: no Guardian policy file in this repo.
          </li>
        </ul>
      </div>

      <div>
        <div className="mb-2 text-xs font-semibold text-ink-meta">PDD sections</div>
        <p className="mb-2 text-xs text-ink-meta">Click a section to see the fields the user must fill.</p>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {m.pdd_sections.map((s) => (
            <SectionChip
              key={s.key}
              section={s}
              impl={sectionImpl}
              expanded={expandedKey === s.key}
              onToggle={() => setExpandedKey((cur) => (cur === s.key ? null : s.key))}
            />
          ))}
        </div>
      </div>

      <div>
        <div className="mb-2 text-xs font-semibold text-ink-meta">Required evidence</div>
        <div className="flex flex-wrap gap-1.5">
          {m.required_evidence.map((c) => (
            <Badge key={c} tone="blue">{CATEGORY_LABEL[c] ?? c}</Badge>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-2 text-xs font-semibold text-ink-meta">Monitoring parameters &amp; formula</div>
        <div
          data-testid="methodology-formula"
          className="mb-2 rounded-md bg-ground px-3 py-2 text-sm ring-1 ring-rule"
        >
          <div className="font-mono text-xs text-ink">{calc.formula}</div>
          <div className="mt-1 text-xs text-ink-meta">{calc.rationale}</div>
        </div>
        <ul className="space-y-1.5 text-sm text-ink-secondary">
          {m.monitoring_params.map((p) => {
            const role = paramRoleInCalculation(p.key, m.calculation);
            return (
              <li
                key={p.key}
                data-testid={`monitoring-param-${p.key}`}
                className="rounded-md bg-ground px-2.5 py-1.5 ring-1 ring-rule"
              >
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-mono text-xs text-ink">{p.key}</span>
                  <span className="text-ink-secondary">— {p.label}</span>
                  <span className="text-xs text-ink-meta">({p.unit}, {p.frequency})</span>
                </div>
                <div className="mt-0.5 text-xs text-ink-meta">
                  Measured by: {p.method}
                </div>
                {role && (
                  <div className="mt-0.5 text-xs font-medium text-brand-700">{role}</div>
                )}
              </li>
            );
          })}
        </ul>
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
