import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Plus } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useStore } from '../store';
import { api } from '../lib/api';
import { PageHeader } from '../components/layout/PageHeader';
import { RecGuide } from '../components/registration/RecGuide';
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

  const STANDARD_TONE: Record<string, string> = {
    'T-VER': 'bg-emerald-50 text-emerald-700',
    Verra: 'bg-sky-50 text-sky-700',
    CDM: 'bg-amber-50 text-amber-700',
    REC: 'bg-indigo-50 text-indigo-700',
  };

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
                className="group rounded-xl border border-ink-200/80 bg-white p-5 text-left shadow-card transition-all hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-lg"
              >
                <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[10px] font-semibold text-ink-600">{p.tag}</span>
                <div className="mt-2 text-lg font-bold text-ink-900">{p.title}</div>
                <div className="mt-1 text-[13px] leading-snug text-ink-600">{p.desc}</div>
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
          className="mb-3 text-sm font-medium text-brand-700 hover:underline"
        >
          ← เลือกโปรแกรมใหม่
        </button>

        {program === 'rec' && <RecGuide />}

        {/* step 1 — methodology cards */}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {orderedMethodologies.map((m) => {
            const active = m.id === methId;
            return (
              <button
                key={m.id}
                type="button"
                aria-pressed={active}
                onClick={() => { setMethId(m.id); setPickerOpen(true); }}
                className={`group relative rounded-xl border bg-white p-4 text-left shadow-card transition-all
                  ${active
                    ? 'border-brand-500 ring-2 ring-brand-500/60 shadow-lg'
                    : 'border-ink-200/80 hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-lg'}`}
              >
                {active && (
                  <span className="absolute right-3 top-3 grid h-5 w-5 place-items-center rounded-full bg-brand-600 text-white">
                    <Check size={12} />
                  </span>
                )}
                <div className="flex flex-wrap items-center gap-1.5 pr-6">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STANDARD_TONE[m.standard] ?? 'bg-ink-100 text-ink-600'}`}>
                    {m.standard}
                  </span>
                  <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[10px] font-medium text-ink-500">{m.version}</span>
                  {m.document_template && (
                    <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-medium text-violet-700">{OFFICIAL_FORMS[m.document_template].badgeLabel}</span>
                  )}
                </div>
                <div className="mt-2 font-mono text-sm font-bold text-ink-900">{m.code}</div>
                <div className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-ink-600">{m.name}</div>
                <div className="mt-3 flex items-center gap-3 border-t border-dashed border-ink-100 pt-2 text-[11px] text-ink-400">
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
        <p className="text-[13px] text-ink-500">{methodology.name}</p>

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
              className="flex w-full items-center gap-3 rounded-lg border-2 border-dashed border-brand-300 bg-brand-50/40 px-4 py-3 text-left transition-colors hover:border-brand-500 hover:bg-brand-50"
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-gradient text-white"><Plus size={16} /></span>
              <span>
                <span className="block text-sm font-semibold text-ink-900">Create a new project</span>
                <span className="block text-[11px] text-ink-500">ตั้งโปรเจกต์ใหม่แล้วเริ่มกรอก{methodology.standard === 'REC' ? 'ฟอร์มขึ้นทะเบียน REC' : ' PDD'} ต่อทันที</span>
              </span>
            </button>

            <div className="flex items-center gap-3 text-[11px] uppercase tracking-wide text-ink-300">
              <span className="h-px flex-1 bg-ink-100" /> or pick an existing project <span className="h-px flex-1 bg-ink-100" />
            </div>

            {candidates.length === 0 ? (
              <p className="rounded-lg bg-ink-50 px-4 py-3 text-[13px] text-ink-500">
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
                      className={`flex w-full items-center gap-3 rounded-lg border px-4 py-2.5 text-left transition-colors
                        ${active ? 'border-brand-500 bg-brand-50/60' : 'border-ink-200 hover:border-brand-300 hover:bg-ink-50'}`}
                    >
                      <span className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border
                        ${active ? 'border-brand-600 bg-brand-600 text-white' : 'border-ink-300'}`}>
                        {active && <Check size={10} />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-ink-900">{p.name}</span>
                        <span className="block truncate text-[11px] text-ink-400">
                          {p.location}{p.capacity_kwp > 0 ? ` · ${p.capacity_kwp.toLocaleString()} kWp` : ''}
                        </span>
                      </span>
                      <span className="shrink-0 rounded-full bg-ink-100 px-2 py-0.5 text-[10px] font-medium text-ink-500">
                        {p.lifecycle_stage === 'pdd_draft' ? 'PDD draft' : 'new'}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="flex justify-end gap-2 border-t border-ink-100 pt-3">
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
            {landBased && <p className="-mt-2 text-xs text-ink-400">โครงการภาคป่าไม้ไม่มีกำลังติดตั้ง — ใช้ 0 ได้เลย</p>}
            <Input label="Commission Date" type="date" value={form.commission_date}
              onChange={(e) => setForm({ ...form, commission_date: e.target.value })} />
            <div className="flex items-center justify-between gap-2 border-t border-ink-100 pt-3">
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

      {/* progress */}
      <div className="mb-5 flex flex-wrap gap-1.5">
        {sections.map((s, i) => (
          <button key={s.key} onClick={() => setStep(i)} title={s.title}
            className={`max-w-[12rem] truncate rounded-full px-3 py-1 text-xs ${i === step ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-600 hover:bg-ink-200'}`}>
            {/* Section titles are "<name> / <thai>" — the part before the slash reads
                as a step label; the full title stays available on hover. */}
            {s.title.split('/')[0].trim()}
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
              onDraft={(draftableKeys as readonly string[]).includes(f.key)
                ? () => draftActivityText(f.key as DraftableKey, project, data, factors)
                : undefined}
              onChange={(v) => setField(f.key, v)} />
          ))}
          <div className="flex justify-between pt-2">
            <Button variant="ghost" onClick={back} disabled={step === 0}>← Back</Button>
            <div className="flex items-center gap-3">
              {!readonly && <AutoSaveStatus state={saveState} />}
              <Button onClick={next}>Next →</Button>
            </div>
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
  const tone = state === 'error' ? 'text-red-600' : state === 'saving' ? 'text-ink-400' : 'text-brand-700';
  return <span aria-live="polite" className={`text-xs ${tone}`}>{text}</span>;
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
            className="mt-1 text-xs font-medium text-brand-700 hover:underline">
            ✨ ร่างข้อความให้จากข้อมูลโครงการ
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
