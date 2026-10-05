import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Plus, Sparkles, X } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useStore } from '../store';
import { api } from '../lib/api';
import { PageHeader } from '../components/layout/PageHeader';
import { RecGuide } from '../components/registration/RecGuide';
import { Badge } from '../components/ui/Badge';
import { PddStatusBadge } from '../components/ui/StatusBadge';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Textarea } from '../components/ui/Textarea';
import { EmptyState } from '../components/ui/EmptyState';
import { Modal } from '../components/ui/Modal';
import { OFFICIAL_FORMS } from '../templates/registry';
import { isFieldVisible, validatePdd, resolveComputed } from '../lib/pdd';
import { buildPrefill } from '../lib/pdd-prefill';
import { toast } from '../components/layout/Toast';
import { draftableKeys, draftActivityText, type DraftableKey } from '../lib/pdd-drafts';
import type { Methodology, PddFieldSchema, PddComputedSource, Project } from '../types';

const EDITABLE_STAGES: Project['lifecycle_stage'][] = ['unregistered', 'pdd_draft'];

type Program = 'tgo' | 'rec';

const PROGRAMS: Array<{ key: Program; title: string; tag: string; desc: string }> = [
  { key: 'tgo', title: 'TGO (T-VER)', tag: 'คาร์บอนเครดิต', desc: 'ขึ้นทะเบียนโครงการลดก๊าซเรือนกระจกกับ อบก. ภายใต้มาตรฐาน T-VER' },
  { key: 'rec', title: 'REC (I-REC(E))', tag: 'ใบรับรองพลังงานหมุนเวียน', desc: 'ขึ้นทะเบียนอุปกรณ์ผลิตไฟฟ้ากับ EGAT (Local Issuer) ตามฟอร์ม SF-02' },
];

// Flagship tracks per program: solar first, forestry second for TGO; SF-02 for REC.
const PROGRAM_TRACKS: Record<Program, string[]> = {
  tgo: ['meth-tver-solar', 'meth-tver-forestry'],
  rec: ['meth-rec-solar'],
};

/** REC registrations are SF-02 facility registrations, not PDDs — label accordingly. */
const regNoun = (m: Methodology) => (m.standard === 'REC' ? 'REC Registration' : 'PDD');

export function Registration() {
  const { pddId } = useParams();
  const methodologies = useStore((s) => s.methodologies);
  const projects = useStore((s) => s.projects);
  const pdds = useStore((s) => s.pdds);

  const pdd = pdds.find((p) => p.id === pddId);

  // ---- Entry screen: no pdd yet → pick a program, then a methodology card, then the project ----
  const [program, setProgram] = useState<Program | null>(null);
  const [methId, setMethId] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  // A project belongs to at most one methodology (via its PDD). Once a draft PDD exists it may
  // only be registered under that methodology; projects with no PDD yet are open to any.
  const candidateProjects = projects.filter((p) => {
    if (!EDITABLE_STAGES.includes(p.lifecycle_stage)) return false;
    const existing = pdds.find((d) => d.project_id === p.id);
    return !existing || existing.methodology_id === methId;
  });

  const orderedMethodologies = (program ? PROGRAM_TRACKS[program] : [])
    .map((id) => methodologies.find((m) => m.id === id))
    .filter((m): m is NonNullable<typeof m> => m !== undefined);

  if (!pdd) {
    if (!program) {
      return (
        <div>
          <PageHeader title="Register a project" subtitle="เลือกโปรแกรมที่ต้องการขึ้นทะเบียนก่อน" />
          <div className="grid gap-3 sm:grid-cols-2">
            {PROGRAMS.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => setProgram(p.key)}
                className="group rounded-sheet border border-rule/80 bg-white p-5 text-left transition-colors duration-150 ease-out hover:border-petrol-100"
              >
                <span className="rounded-full bg-surface-sunk px-2 py-0.5 text-xs font-semibold text-ink-secondary">{p.tag}</span>
                <div className="mt-2 text-lg font-semibold text-ink">{p.title}</div>
                <div className="mt-1 text-sm leading-snug text-ink-secondary">{p.desc}</div>
              </button>
            ))}
          </div>
        </div>
      );
    }

    const selected = methodologies.find((m) => m.id === methId);
    return (
      <div>
        <PageHeader title="Register a project" subtitle="Pick a methodology card — a project picker will pop up" />

        <button
          type="button"
          onClick={() => { setProgram(null); setMethId(''); setPickerOpen(false); }}
          className="mb-3 min-h-8 text-sm font-medium text-petrol-700 hover:underline"
        >
          ← เลือกโปรแกรมใหม่
        </button>

        {program === 'rec' && <RecGuide />}

        {/* step 1 — methodology cards */}
        <div className="divide-y divide-rule overflow-hidden rounded-sheet border border-rule bg-surface">
          {orderedMethodologies.map((m) => {
            const active = m.id === methId;
            return (
              <button
                key={m.id}
                type="button"
                aria-pressed={active}
                onClick={() => { setMethId(m.id); setPickerOpen(true); }}
                className={`group relative block w-full bg-surface p-4 text-left transition-colors
                  ${active
                    ? 'bg-petrol-100'
                    : 'hover:bg-petrol-50'}`}
              >
                {active && (
                  <span className="absolute right-3 top-3 grid h-5 w-5 place-items-center rounded-full bg-petrol-600 text-white">
                    <Check size={12} />
                  </span>
                )}
                <div className="flex flex-wrap items-center gap-1.5 pr-6">
                  <Badge tone="gray">{m.standard}</Badge>
                  <span className="rounded-full bg-surface-sunk px-2 py-0.5 text-xs font-medium text-ink-meta">{m.version}</span>
                  {m.document_template && (
                    <span className="rounded-full bg-petrol-50 px-2 py-0.5 text-xs font-medium text-state-review">{OFFICIAL_FORMS[m.document_template].badgeLabel}</span>
                  )}
                </div>
                <div className="mt-2 font-mono text-sm font-semibold text-ink">{m.code}</div>
                <div className="mt-0.5 line-clamp-2 text-sm leading-snug text-ink-secondary">{m.name}</div>
                <div className="mt-3 flex items-center gap-3 border-t border-dashed border-rule pt-2 text-xs text-ink-meta">
                  <span>{m.pdd_sections.length} sections</span>
                  <span>·</span>
                  <span>{m.required_evidence.length} evidence types</span>
                  <span className="ml-auto truncate">{m.sectoral_scope}</span>
                </div>
              </button>
            );
          })}
        </div>

        {/* project picker / creator pops up when a card is clicked */}
        {selected && pickerOpen && (
          <StartPddModal
            key={selected.id}
            methodology={selected}
            candidates={candidateProjects}
            onClose={() => setPickerOpen(false)}
          />
        )}
      </div>
    );
  }

  return <PddEditor pddId={pdd.id} />;
}

/**
 * One modal from methodology card → working PDD: create a new project (the
 * primary path — it opens on the form when nothing eligible exists yet) or
 * pick an eligible existing one, then jump straight into the PDD editor.
 */
function StartPddModal({ methodology, candidates, onClose }: {
  methodology: Methodology;
  candidates: Project[];
  onClose: () => void;
}) {
  const navigate = useNavigate();
  // Land-based tracks (forestry/ARR) have no installed kWp — prefill 0.
  const landBased = methodology.calculation.formula !== 'grid_displacement';
  const [mode, setMode] = useState<'pick' | 'create'>(candidates.length === 0 ? 'create' : 'pick');
  const [projId, setProjId] = useState('');
  const [busy, setBusy] = useState(false);
  const pdds = useStore((s) => s.pdds);
  const allProjects = useStore((s) => s.projects);
  const [cloneSourceId, setCloneSourceId] = useState('');
  // PDDs of the same methodology that already hold data — usable as clone templates
  // (registered ones included: a completed PDD is the best source).
  const cloneSources = pdds
    .filter((p) => p.methodology_id === methodology.id && Object.keys(p.section_data).length > 0)
    .map((p) => ({ pdd: p, name: allProjects.find((x) => x.id === p.project_id)?.name ?? p.id }));
  const [form, setForm] = useState({
    name: '', location: '', capacity_kwp: landBased ? '0' : '',
    commission_date: new Date().toISOString().slice(0, 10),
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function startWith(projectId: string) {
    const created = await api.selectMethodology(projectId, methodology.id);
    // Seed only a brand-new (empty) PDD — re-entering an existing draft keeps its data.
    if (Object.keys(created.section_data).length === 0) {
      const source = pdds.find((p) => p.id === cloneSourceId);
      const prefill = buildPrefill(methodology, source?.section_data);
      if (Object.keys(prefill).length > 0) {
        await api.savePddDraft(created.id, prefill, created.evidence_ids);
      }
    }
    navigate(`/registration/${created.id}`);
  }

  async function createAndStart() {
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = 'Required';
    if (!form.location.trim()) errs.location = 'Required';
    const cap = Number(form.capacity_kwp);
    if (form.capacity_kwp === '' || Number.isNaN(cap) || cap < 0) errs.capacity_kwp = 'Must be ≥ 0';
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setBusy(true);
    try {
      const project = await api.createProject({
        name: form.name.trim(), location: form.location.trim(), capacity_kwp: cap,
        commission_date: form.commission_date, status: 'draft',
      });
      await startWith(project.id);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`Start ${regNoun(methodology)} — ${methodology.code}`}>
      <div className="space-y-4">
        <p className="text-sm text-ink-meta">{methodology.name}</p>

        {cloneSources.length > 0 && (
          <Select label="คัดลอกข้อมูลจากโครงการก่อนหน้า (ไม่บังคับ)" value={cloneSourceId}
            onChange={(e) => setCloneSourceId(e.target.value)}>
            <option value="">— เริ่มจากค่ามาตรฐาน ไม่คัดลอก —</option>
            {cloneSources.map((s) => (
              <option key={s.pdd.id} value={s.pdd.id}>{s.name}</option>
            ))}
          </Select>
        )}

        {mode === 'pick' ? (
          <>
            {/* primary action: create the project this PDD is for */}
            <button
              type="button"
              onClick={() => setMode('create')}
              className="flex w-full items-center gap-3 rounded-sheet border-2 border-dashed border-petrol-100 bg-petrol-50/40 px-4 py-3 text-left transition-colors hover:border-petrol-600 hover:bg-petrol-50"
            >
              <span className="shrink-0 text-petrol-700"><Plus size={16} /></span>
              <span>
                <span className="block text-sm font-semibold text-ink">Create a new project</span>
                <span className="block text-xs text-ink-meta">ตั้งโปรเจกต์ใหม่แล้วเริ่มกรอก{methodology.standard === 'REC' ? 'ฟอร์มขึ้นทะเบียน REC' : ' PDD'} ต่อทันที</span>
              </span>
            </button>

            <div className="flex items-center gap-3 text-xs text-ink-meta">
              <span className="h-px flex-1 bg-surface-sunk" /> or pick an existing project <span className="h-px flex-1 bg-surface-sunk" />
            </div>

            {candidates.length === 0 ? (
              <p className="rounded-sheet bg-ground px-4 py-3 text-sm text-ink-meta">
                ยังไม่มีโปรเจกต์ที่เริ่ม PDD ได้ — โปรเจกต์เดิมถูก register แล้วหรือผูกกับ methodology อื่นอยู่
              </p>
            ) : (
              <div className="max-h-60 space-y-2 overflow-y-auto pr-1">
                {candidates.map((p) => {
                  const active = p.id === projId;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setProjId(p.id)}
                      className={`flex w-full items-center gap-3 rounded-sheet border px-4 py-2.5 text-left transition-colors
                        ${active ? 'border-petrol-600 bg-petrol-50/60' : 'border-rule hover:border-petrol-100 hover:bg-ground'}`}
                    >
                      <span className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border
                        ${active ? 'border-petrol-600 bg-petrol-600 text-white' : 'border-rule-strong'}`}>
                        {active && <Check size={10} />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-ink">{p.name}</span>
                        <span className="block truncate text-xs text-ink-meta">
                          {p.location}{p.capacity_kwp > 0 ? ` · ${p.capacity_kwp.toLocaleString()} kWp` : ''}
                        </span>
                      </span>
                      <span className="shrink-0 rounded-full bg-surface-sunk px-2 py-0.5 text-xs font-medium text-ink-meta">
                        {p.lifecycle_stage === 'pdd_draft' ? 'PDD draft' : 'new'}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="flex justify-end gap-2 border-t border-rule pt-3">
              <Button variant="ghost" onClick={onClose}>Cancel</Button>
              <Button disabled={!projId} onClick={() => void startWith(projId)}>Start {regNoun(methodology)} →</Button>
            </div>
          </>
        ) : (
          <>
            <Input label="Project Name" value={form.name} autoFocus
              onChange={(e) => setForm({ ...form, name: e.target.value })} error={errors.name} />
            <Input label="Location" placeholder="e.g. Chom Bueng, Ratchaburi, Thailand" value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })} error={errors.location} />
            <Input label="Capacity (kWp)" type="number" inputMode="decimal" value={form.capacity_kwp}
              onChange={(e) => setForm({ ...form, capacity_kwp: e.target.value })} error={errors.capacity_kwp} />
            {landBased && <p className="-mt-2 text-xs text-ink-meta">โครงการภาคป่าไม้ไม่มีกำลังติดตั้ง — ใช้ 0 ได้เลย</p>}
            <Input label="Commission Date" type="date" value={form.commission_date}
              onChange={(e) => setForm({ ...form, commission_date: e.target.value })} />
            <div className="flex items-center justify-between gap-2 border-t border-rule pt-3">
              {candidates.length > 0 ? (
                <Button variant="ghost" onClick={() => setMode('pick')}>← Pick existing</Button>
              ) : (
                <Button variant="ghost" onClick={onClose}>Cancel</Button>
              )}
              <Button loading={busy} onClick={createAndStart}>Create & Start {regNoun(methodology)} →</Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
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
  // ---- Auto-save: debounce after the last edit; no manual Save-draft button. ----
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const lastSavedRef = useRef(JSON.stringify(pdd.section_data));
  const dataRef = useRef(data);
  dataRef.current = data;

  async function save() {
    await api.savePddDraft(pddId, dataRef.current, pdd.evidence_ids);
    lastSavedRef.current = JSON.stringify(dataRef.current);
  }

  useEffect(() => {
    if (readonly) return;
    if (JSON.stringify(data) === lastSavedRef.current) return;
    const t = setTimeout(async () => {
      setSaveState('saving');
      try {
        await save();
        setSaveState('saved');
      } catch (err) {
        setSaveState('error');
        toast.error('บันทึกอัตโนมัติไม่สำเร็จ', err instanceof Error ? err.message : 'กด Next เพื่อลองบันทึกอีกครั้ง');
      }
    }, AUTOSAVE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, readonly, pddId]);

  // Leaving the editor mid-debounce still persists the last keystrokes.
  useEffect(() => () => {
    if (!readonly && JSON.stringify(dataRef.current) !== lastSavedRef.current) {
      void api.savePddDraft(pddId, dataRef.current, pdd.evidence_ids);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function next() { await save(); setStep((s) => Math.min(s + 1, sections.length)); }
  function back() { setStep((s) => Math.max(s - 1, 0)); }

  const check = validatePdd(methodology, data);
  const missingSections = new Set(check.missing.map((m) => m.section));
  async function submit() {
    await save();
    await api.submitPdd(pddId);
    navigate(`/registration/${pddId}/document`);
  }

  return (
    <div>
      <PageHeader
        title={`Register: ${project.name}`}
        subtitle={`${methodology.code} ${methodology.version} · ${regNoun(methodology)} ${pdd.id}`}
      />

      <div className="mb-4"><PddStatusBadge state={pdd.state} /></div>
      <ol aria-label="Registration steps" className="registration-chain mb-5 flex gap-6 overflow-x-auto pb-3">
        {[...sections.map((section) => ({ key: section.key, title: section.title, complete: !missingSections.has(section.key) })),
          { key: 'review', title: 'Review', complete: check.ok }].map((section, i) => <li key={section.key} className="relative shrink-0">
          <button onClick={() => setStep(i)} title={section.title} aria-current={step === i ? 'step' : undefined}
            className="relative flex min-h-11 items-center gap-2 bg-ground pr-2 text-sm text-ink-secondary">
            <span aria-hidden className={`grid h-6 w-6 place-items-center rounded-full border-2 border-petrol-700 ${step === i ? 'ring-2 ring-petrol-600 ring-offset-2 ring-offset-ground' : ''} ${section.complete ? 'bg-petrol-700 text-on-petrol' : 'bg-surface'}`}>
              {section.complete ? <Check size={14} /> : <span className="font-mono text-xs">{i + 1}</span>}
            </span>
            <span className="max-w-[12rem] truncate">{section.complete ? '✓ ' : ''}{section.title.split('/')[0].trim()}</span>
          </button>
        </li>)}
      </ol>

      {!isReview && (
        <Card className="space-y-6 p-6 md:p-8">
          <div>
            <h2 className="text-lg font-semibold text-ink">{sections[step].title}</h2>
            {sections[step].help && <p className="mt-1 text-sm text-ink-meta">{sections[step].help}</p>}
          </div>
          {/* 12-col grid: each field claims a span suited to the length of the
              value it holds (see fieldSpan), so short inputs pair up on a row
              instead of every field stretching the full width of the card. */}
          <div className="grid grid-cols-1 items-start gap-6 md:grid-cols-12">
            {sections[step].fields.filter((f) => isFieldVisible(f, data)).map((f) => (
              <FieldInput key={f.key} field={f} value={data[f.key]} readonly={readonly}
                computed={f.type === 'computed' ? resolveComputed(f.source as PddComputedSource, ctx) : undefined}
                onDraft={(draftableKeys as readonly string[]).includes(f.key)
                  ? () => draftActivityText(f.key as DraftableKey, project, data, factors)
                  : undefined}
                onChange={(v) => setField(f.key, v)} />
            ))}
          </div>
          <div className="flex justify-between border-t border-rule pt-5">
            <Button variant="ghost" onClick={back} disabled={step === 0}>← Back</Button>
            <div className="flex items-center gap-3">
              {!readonly && <AutoSaveStatus state={saveState} />}
              <Button onClick={next}>Next →</Button>
            </div>
          </div>
        </Card>
      )}

      {isReview && (
        <Card className="space-y-4 p-6 md:p-8">
          <h2 className="text-lg font-semibold text-ink">Review & submit</h2>
          {check.ok ? (
            <p className="text-sm text-petrol-700">All required fields are complete. You can submit for validation.</p>
          ) : (
            <div className="text-sm text-state-rejected">
              <p className="font-medium">Missing required fields:</p>
              <ul className="mt-1 list-disc pl-5">
                {check.missing.map((m) => <li key={m.field}>{m.label}</li>)}
              </ul>
            </div>
          )}
          <div className="flex justify-between pt-2">
            <Button variant="ghost" onClick={() => navigate(`/registration/${pddId}/document`)}>Preview document</Button>
            <div className="flex items-center gap-3">
              {!readonly && <AutoSaveStatus state={saveState} />}
              <Button disabled={!check.ok || readonly} onClick={submit}>Submit for validation</Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

const AUTOSAVE_MS = 1500;

function AutoSaveStatus({ state }: { state: 'idle' | 'saving' | 'saved' | 'error' }) {
  if (state === 'idle') return null;
  const text = state === 'saving' ? 'กำลังบันทึก…' : state === 'saved' ? '✓ บันทึกอัตโนมัติแล้ว' : '⚠ บันทึกไม่สำเร็จ';
  const tone = state === 'error' ? 'text-state-rejected' : state === 'saving' ? 'text-ink-meta' : 'text-petrol-700';
  return <span aria-live="polite" className={`text-xs ${tone}`}>{text}</span>;
}

/**
 * How many of the 12 columns a field claims, derived from the shape of the
 * value it holds — the schema carries no width hint, and it lives in Postgres,
 * so inferring here keeps the layout a pure front-end concern.
 *
 * Wide values (prose, tables) take the full row; a short value with a short
 * label takes a third so three sit on a line; everything else takes half.
 */
function fieldSpan(field: PddFieldSchema): string {
  if (field.type === 'table' || field.type === 'textarea') return 'md:col-span-12';
  // A short value still needs a row wide enough for its label — these labels are
  // full Thai phrases, so thirds only work when the label is short too.
  const compact = field.type === 'date' || field.type === 'number'
    || field.type === 'boolean' || field.type === 'computed';
  if (compact && `${field.label}${field.unit ?? ''}`.length <= 24) return 'md:col-span-4';
  return 'md:col-span-6';
}

function FieldInput({ field, value, computed, readonly, onChange, onDraft }: {
  field: PddFieldSchema; value: unknown; computed?: number | string | null; readonly: boolean;
  onChange: (v: unknown) => void;
  /** Compose a boilerplate draft for this field from data already in the form. */
  onDraft?: () => string;
}) {
  const labelText = `${field.label}${field.unit ? ` (${field.unit})` : ''}`;

  // Input/Select/Textarea each render their own <label> via the `label` prop —
  // do NOT wrap them in another <label> (invalid nested labels).
  if (field.type === 'computed') {
    return (
      <div className={fieldSpan(field)}>
        <span className="mb-1.5 block text-sm font-medium text-ink-secondary">{labelText}</span>
        <div className="flex h-10 items-center rounded-sheet bg-ground px-3 text-sm text-ink-secondary ring-1 ring-rule">
          {computed === null || computed === undefined ? '—' : String(computed)}
          <span className="ml-2 text-xs text-ink-meta">auto-calculated</span>
        </div>
      </div>
    );
  }

  if (field.type === 'table') {
    return <TableFieldInput field={field} value={value} readonly={readonly} onChange={onChange} span={fieldSpan(field)} />;
  }

  let control;
  if (field.type === 'textarea') {
    const applyDraft = () => {
      if (!onDraft) return;
      const current = String(value ?? '').trim();
      // Never silently destroy hand-written text.
      if (current !== '' && !window.confirm('เขียนทับข้อความเดิมด้วยร่างมาตรฐาน?')) return;
      onChange(onDraft());
    };
    control = (
      <div>
        <Textarea label={labelText} value={String(value ?? '')} disabled={readonly} onChange={(e) => onChange(e.target.value)} />
        {onDraft && !readonly && (
          <button type="button" onClick={applyDraft}
            className="mt-1 min-h-8 text-xs font-medium text-petrol-700 hover:underline">
            <Sparkles size={14} aria-hidden className="mr-1 inline" /> ร่างข้อความให้จากข้อมูลโครงการ
          </button>
        )}
      </div>
    );
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
    <div className={fieldSpan(field)}>
      {control}
      {field.help && <span className="mt-1.5 block text-xs leading-snug text-ink-meta">{field.help}</span>}
    </div>
  );
}

function TableFieldInput({ field, value, readonly, onChange, span }: {
  field: PddFieldSchema; value: unknown; readonly: boolean; onChange: (v: unknown) => void;
  /** Grid span handed down from FieldInput — tables always take the full row. */
  span?: string;
}) {
  const columns = field.columns ?? [];
  const rows = (Array.isArray(value) ? value : []) as Array<Record<string, unknown>>;
  const setCell = (ri: number, key: string, v: unknown) =>
    onChange(rows.map((r, i) => (i === ri ? { ...r, [key]: v } : r)));
  // Numbers are short and right-aligned; free text needs room to read. Without a
  // floor the browser squeezes a wide table until headers wrap and values clip.
  const colWidth = (type?: string) => (type === 'number' ? 'min-w-[6.5rem]' : 'min-w-[9rem]');
  return (
    <div className={span}>
      <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="text-sm font-medium text-ink-secondary">{field.label}</span>
        {columns.length > 5 && (
          <span className="text-xs text-ink-meta">เลื่อนตารางแนวนอนเพื่อดูคอลัมน์ที่เหลือ →</span>
        )}
      </div>
      <div className="overflow-x-auto rounded-sheet ring-1 ring-rule">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-ground text-left text-xs text-ink-meta">
            <tr>
              <th className="w-10 px-2 py-2 text-center font-medium">#</th>
              {columns.map((c) => (
                <th key={c.key} className={`px-2 py-2 font-medium leading-snug ${colWidth(c.type)}`}>
                  {c.label}{c.unit ? ` (${c.unit})` : ''}
                </th>
              ))}
              {!readonly && <th className="w-10" />}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri} className="border-t border-rule hover:bg-ground/40">
                <td className="px-2 py-1.5 text-center text-xs tabular-nums text-ink-meta">{ri + 1}</td>
                {columns.map((c) => (
                  <td key={c.key} className={`px-1.5 py-1.5 ${colWidth(c.type)}`}>
                    <input
                      className={`h-9 w-full rounded-md border border-rule bg-white px-2 text-sm
                        transition-colors hover:border-rule-strong
                        focus:border-petrol-600 focus:outline-none focus:ring-2 focus:ring-petrol-600/15
                        disabled:bg-ground ${c.type === 'number' ? 'text-right tabular-nums' : ''}`}
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
                  <td className="px-1.5 text-center">
                    <button type="button" aria-label={`ลบแถว ${ri + 1}`}
                      className="inline-flex min-h-8 min-w-8 items-center justify-center rounded p-1 text-ink-meta transition-colors hover:bg-state-rejected/5 hover:text-state-rejected"
                      onClick={() => onChange(rows.filter((_, i) => i !== ri))}><X size={14} aria-hidden /></button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        {field.help && <span className="max-w-[46rem] text-xs leading-snug text-ink-meta">{field.help}</span>}
        {!readonly && (
          <Button variant="ghost" className="ml-auto" onClick={() => onChange([...rows, {}])}>+ เพิ่มแถว</Button>
        )}
      </div>
    </div>
  );
}
