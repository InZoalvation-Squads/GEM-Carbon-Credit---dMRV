import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useStore } from '../store';
import { api } from '../lib/api';
import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Select } from '../components/Select';
import { Textarea } from '../components/Textarea';
import { EmptyState } from '../components/EmptyState';
import { isFieldVisible, validatePdd, resolveComputed } from '../lib/pdd';
import type { PddFieldSchema, PddComputedSource, Project } from '../types';

const EDITABLE_STAGES: Project['lifecycle_stage'][] = ['unregistered', 'pdd_draft'];

export function Registration() {
  const { pddId } = useParams();
  const navigate = useNavigate();
  const methodologies = useStore((s) => s.methodologies);
  const projects = useStore((s) => s.projects);
  const pdds = useStore((s) => s.pdds);

  const pdd = pdds.find((p) => p.id === pddId);

  // ---- Entry screen: no pdd yet → choose methodology + project ----
  const [methId, setMethId] = useState(methodologies[0]?.id ?? '');
  const [projId, setProjId] = useState('');
  // A project belongs to at most one methodology (via its PDD). Once a draft PDD exists it may
  // only be registered under that methodology; projects with no PDD yet are open to any.
  const candidateProjects = projects.filter((p) => {
    if (!EDITABLE_STAGES.includes(p.lifecycle_stage)) return false;
    const existing = pdds.find((d) => d.project_id === p.id);
    return !existing || existing.methodology_id === methId;
  });

  async function startRegistration() {
    if (!methId || !projId) return;
    const created = await api.selectMethodology(projId, methId);
    navigate(`/registration/${created.id}`);
  }

  if (!pdd) {
    return (
      <div>
        <PageHeader title="Register a project" subtitle="Step 1 — choose a methodology, then the project it applies to" />
        <Card className="max-w-xl space-y-4 p-6">
          <Select label="Methodology" value={methId} onChange={(e) => { setMethId(e.target.value); setProjId(''); }}>
            {methodologies.map((m) => <option key={m.id} value={m.id}>{m.code} — {m.name}</option>)}
          </Select>
          <Select label="Project" value={projId} onChange={(e) => setProjId(e.target.value)}>
            <option value="">Select a project…</option>
            {candidateProjects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
          <Button disabled={!methId || !projId} onClick={startRegistration}>Start PDD →</Button>
        </Card>
      </div>
    );
  }

  return <PddEditor pddId={pdd.id} />;
}

function PddEditor({ pddId }: { pddId: string }) {
  const navigate = useNavigate();
  const pdd = useStore((s) => s.pdds.find((p) => p.id === pddId))!;
  const methodology = useStore((s) => s.methodologies.find((m) => m.id === pdd.methodology_id));
  const project = useStore((s) => s.projects.find((p) => p.id === pdd.project_id))!;
  const factors = useStore((s) => s.factors);

  const [data, setData] = useState<Record<string, unknown>>(pdd.section_data);
  const [step, setStep] = useState(0);

  const sections = methodology?.pdd_sections ?? [];
  const ctx = useMemo(() => ({ project, factors, sectionData: data }), [project, factors, data]);

  if (!methodology) return <EmptyState title="Methodology not found" hint="This PDD references a methodology that no longer exists." />;

  const readonly = pdd.state === 'submitted' || pdd.state === 'under_validation' || pdd.state === 'registered';
  const isReview = step >= sections.length;

  function setField(key: string, value: unknown) {
    setData((d) => ({ ...d, [key]: value }));
  }
  async function save() { await api.savePddDraft(pddId, data, pdd.evidence_ids); }
  async function next() { await save(); setStep((s) => Math.min(s + 1, sections.length)); }
  function back() { setStep((s) => Math.max(s - 1, 0)); }

  const check = validatePdd(methodology, data);
  async function submit() {
    await save();
    await api.submitPdd(pddId);
    navigate(`/registration/${pddId}/document`);
  }

  return (
    <div>
      <PageHeader
        title={`Register: ${project.name}`}
        subtitle={`${methodology.code} ${methodology.version} · PDD ${pdd.id}`}
      />

      {/* progress */}
      <div className="mb-5 flex flex-wrap gap-1.5">
        {sections.map((s, i) => (
          <button key={s.key} onClick={() => setStep(i)}
            className={`rounded-full px-3 py-1 text-xs ${i === step ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-600'}`}>
            {s.title.split(' ')[0]}
          </button>
        ))}
        <button onClick={() => setStep(sections.length)}
          className={`rounded-full px-3 py-1 text-xs ${isReview ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-600'}`}>
          Review
        </button>
      </div>

      {!isReview && (
        <Card className="max-w-2xl space-y-5 p-6">
          <div>
            <h3 className="text-lg font-semibold text-ink-900">{sections[step].title}</h3>
            {sections[step].help && <p className="mt-1 text-sm text-ink-500">{sections[step].help}</p>}
          </div>
          {sections[step].fields.filter((f) => isFieldVisible(f, data)).map((f) => (
            <FieldInput key={f.key} field={f} value={data[f.key]} readonly={readonly}
              computed={f.type === 'computed' ? resolveComputed(f.source as PddComputedSource, ctx) : undefined}
              onChange={(v) => setField(f.key, v)} />
          ))}
          <div className="flex justify-between pt-2">
            <Button variant="ghost" onClick={back} disabled={step === 0}>← Back</Button>
            <Button onClick={next}>Next →</Button>
          </div>
        </Card>
      )}

      {isReview && (
        <Card className="max-w-2xl space-y-4 p-6">
          <h3 className="text-lg font-semibold text-ink-900">Review & submit</h3>
          {check.ok ? (
            <p className="text-sm text-brand-700">All required fields are complete. You can submit for validation.</p>
          ) : (
            <div className="text-sm text-red-600">
              <p className="font-medium">Missing required fields:</p>
              <ul className="mt-1 list-disc pl-5">
                {check.missing.map((m) => <li key={m.field}>{m.label}</li>)}
              </ul>
            </div>
          )}
          <div className="flex justify-between pt-2">
            <Button variant="ghost" onClick={() => navigate(`/registration/${pddId}/document`)}>Preview document</Button>
            <Button disabled={!check.ok || readonly} onClick={submit}>Submit for validation</Button>
          </div>
        </Card>
      )}
    </div>
  );
}

function FieldInput({ field, value, computed, readonly, onChange }: {
  field: PddFieldSchema; value: unknown; computed?: number | string | null; readonly: boolean; onChange: (v: unknown) => void;
}) {
  const labelText = `${field.label}${field.unit ? ` (${field.unit})` : ''}`;

  // Input/Select/Textarea each render their own <label> via the `label` prop —
  // do NOT wrap them in another <label> (invalid nested labels).
  if (field.type === 'computed') {
    return (
      <div>
        <span className="mb-1 block text-sm font-medium text-ink-700">{labelText}</span>
        <div className="rounded-lg bg-ink-50 px-3 py-2 text-sm text-ink-700 ring-1 ring-ink-200">
          {computed === null || computed === undefined ? '—' : String(computed)}
          <span className="ml-2 text-xs text-ink-400">auto-calculated</span>
        </div>
      </div>
    );
  }

  if (field.type === 'table') {
    return <TableFieldInput field={field} value={value} readonly={readonly} onChange={onChange} />;
  }

  let control;
  if (field.type === 'textarea') {
    control = <Textarea label={labelText} value={String(value ?? '')} disabled={readonly} onChange={(e) => onChange(e.target.value)} />;
  } else if (field.type === 'select') {
    control = (
      <Select label={labelText} value={String(value ?? '')} disabled={readonly} onChange={(e) => onChange(e.target.value)}>
        <option value="">Select…</option>
        {field.options?.map((o) => <option key={o} value={o}>{o}</option>)}
      </Select>
    );
  } else if (field.type === 'boolean') {
    control = (
      <Select label={labelText} value={value === true ? 'yes' : value === false ? 'no' : ''} disabled={readonly}
        onChange={(e) => onChange(e.target.value === 'yes')}>
        <option value="">Select…</option><option value="yes">Yes</option><option value="no">No</option>
      </Select>
    );
  } else {
    control = (
      <Input label={labelText} type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
        value={String(value ?? '')} disabled={readonly}
        onChange={(e) => onChange(field.type === 'number' ? Number(e.target.value) : e.target.value)} />
    );
  }
  return (
    <div>
      {control}
      {field.help && <span className="mt-1 block text-xs text-ink-400">{field.help}</span>}
    </div>
  );
}

function TableFieldInput({ field, value, readonly, onChange }: {
  field: PddFieldSchema; value: unknown; readonly: boolean; onChange: (v: unknown) => void;
}) {
  const columns = field.columns ?? [];
  const rows = (Array.isArray(value) ? value : []) as Array<Record<string, unknown>>;
  const setCell = (ri: number, key: string, v: unknown) =>
    onChange(rows.map((r, i) => (i === ri ? { ...r, [key]: v } : r)));
  return (
    <div>
      <span className="mb-1 block text-sm font-medium text-ink-700">{field.label}</span>
      <div className="overflow-x-auto rounded-lg ring-1 ring-ink-200">
        <table className="w-full text-sm">
          <thead className="bg-ink-50 text-left text-xs text-ink-500">
            <tr>
              {columns.map((c) => (
                <th key={c.key} className="px-2 py-1.5 font-medium">{c.label}{c.unit ? ` (${c.unit})` : ''}</th>
              ))}
              {!readonly && <th className="w-8" />}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri} className="border-t border-ink-100">
                {columns.map((c) => (
                  <td key={c.key} className="px-1 py-1">
                    <input
                      className="w-full rounded border border-ink-200 px-2 py-1 text-sm disabled:bg-ink-50"
                      type={c.type === 'number' ? 'number' : 'text'}
                      placeholder={c.label}
                      aria-label={`${c.label} แถว ${ri + 1}`}
                      disabled={readonly}
                      value={String(row[c.key] ?? '')}
                      onChange={(e) => setCell(ri, c.key, c.type === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value)}
                    />
                  </td>
                ))}
                {!readonly && (
                  <td className="px-1 text-center">
                    <button type="button" aria-label={`ลบแถว ${ri + 1}`} className="text-ink-400 hover:text-red-600"
                      onClick={() => onChange(rows.filter((_, i) => i !== ri))}>✕</button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!readonly && (
        <Button variant="ghost" className="mt-1" onClick={() => onChange([...rows, {}])}>+ เพิ่มแถว</Button>
      )}
      {field.help && <span className="mt-1 block text-xs text-ink-400">{field.help}</span>}
    </div>
  );
}
