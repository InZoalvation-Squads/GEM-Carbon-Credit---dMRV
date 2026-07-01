import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { FileText } from 'lucide-react';
import { useStore } from '../store';
import { api } from '../lib/api';
import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Textarea } from '../components/Textarea';
import { PddStatusBadge } from '../components/StatusBadge';
import { EmptyState } from '../components/EmptyState';
import { isFieldVisible, resolveComputed, validatePdd } from '../lib/pdd';
import type { PddComputedSource } from '../types';

export function ValidationDetail() {
  const { pddId } = useParams();
  const navigate = useNavigate();
  const pdd = useStore((s) => s.pdds.find((p) => p.id === pddId));
  const methodology = useStore((s) => s.methodologies.find((m) => m.id === pdd?.methodology_id));
  const project = useStore((s) => s.projects.find((p) => p.id === pdd?.project_id));
  const factors = useStore((s) => s.factors);
  const comments = useStore((s) => s.comments.filter((c) => c.verification_id === pddId));
  const [note, setNote] = useState('');

  if (!pdd || !methodology || !project) return <EmptyState title="PDD not found" hint="This validation item does not exist." />;
  const ctx = { project, factors, sectionData: pdd.section_data };
  const check = validatePdd(methodology, pdd.section_data);
  const canAct = pdd.state === 'under_validation';

  function value(fieldKey: string, source?: PddComputedSource) {
    if (source) { const v = resolveComputed(source, ctx); return v === null || v === undefined ? '—' : String(v); }
    const v = pdd!.section_data[fieldKey];
    if (v === undefined || v === null || v === '') return '—';
    if (v === true) return 'Yes'; if (v === false) return 'No';
    return String(v);
  }

  async function start() { await api.startValidation(pdd!.id); }
  async function approve() { const ok = await api.registerProject(pdd!.id); if (ok) navigate('/validation'); }
  async function revise() { if (!note.trim()) return; await api.requestPddRevision(pdd!.id, note.trim()); navigate('/validation'); }
  async function reject() { if (!note.trim()) return; await api.rejectPdd(pdd!.id, note.trim()); navigate('/validation'); }
  async function comment() { if (!note.trim()) return; await api.addPddComment(pdd!.id, note.trim()); setNote(''); }

  return (
    <div>
      <PageHeader title={`Validate ${pdd.id}`} subtitle={`${project.name} · ${methodology.code} ${methodology.version}`}
        action={<Link to={`/registration/${pdd.id}/document`}><Button variant="ghost"><FileText size={16} /> Full document</Button></Link>} />

      <div className="mb-4 flex items-center gap-3">
        <PddStatusBadge state={pdd.state} />
        {pdd.state === 'submitted' && <Button onClick={start}>Start validation</Button>}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* document */}
        <div className="space-y-5 lg:col-span-2">
          {methodology.pdd_sections.map((section) => (
            <Card key={section.key} className="p-5">
              <h2 className="mb-3 text-base font-semibold text-ink-900">{section.title}</h2>
              <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
                {section.fields.filter((f) => isFieldVisible(f, pdd.section_data)).map((f) => (
                  <div key={f.key}>
                    <dt className="text-xs font-medium uppercase tracking-wide text-ink-400">{f.label}{f.unit ? ` (${f.unit})` : ''}</dt>
                    <dd className="mt-0.5 text-sm text-ink-800">{value(f.key, f.source)}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          ))}
        </div>

        {/* audit panel */}
        <div className="space-y-4">
          <Card className="p-5">
            <h3 className="mb-2 text-sm font-semibold text-ink-900">Completeness</h3>
            {check.ok ? (
              <p className="text-sm text-brand-700">All required fields complete.</p>
            ) : (
              <ul className="list-disc pl-5 text-sm text-red-600">
                {check.missing.map((m) => <li key={m.field}>{m.label}</li>)}
              </ul>
            )}
          </Card>

          <Card className="p-5">
            <h3 className="mb-2 text-sm font-semibold text-ink-900">Notes & comments</h3>
            <div className="mb-3 space-y-2 max-h-80 overflow-y-auto">
              {comments.length === 0 && <p className="text-sm text-ink-400">No comments yet.</p>}
              {comments.map((c) => (
                <div key={c.id} className="rounded-lg bg-ink-50 p-2 text-sm">
                  <div className="text-xs text-ink-500">{c.author_name} · {c.author_role}</div>
                  <div className="text-ink-800">{c.body}</div>
                </div>
              ))}
            </div>
            <Textarea placeholder="Add a note, request, or rejection reason…" value={note} onChange={(e) => setNote(e.target.value)} />
            <div className="mt-2 flex flex-wrap gap-2">
              <Button variant="ghost" onClick={comment} disabled={!note.trim()}>Comment</Button>
              {canAct && <Button onClick={approve} disabled={!check.ok}>Approve → Register</Button>}
              {canAct && <Button variant="ghost" onClick={revise} disabled={!note.trim()}>Request revision</Button>}
              {canAct && <Button variant="ghost" onClick={reject} disabled={!note.trim()}>Reject</Button>}
            </div>
            {!check.ok && canAct && <p className="mt-2 text-xs text-ink-400">Approve is disabled until all required fields are complete.</p>}
          </Card>
        </div>
      </div>
    </div>
  );
}
