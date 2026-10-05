import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FileText } from 'lucide-react';
import { useStore } from '../store';
import { api } from '../lib/api';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { Button, LinkButton } from '../components/ui/Button';
import { Textarea } from '../components/ui/Textarea';
import { PddStatusBadge } from '../components/ui/StatusBadge';
import { toast } from '../components/layout/Toast';
import { EmptyState } from '../components/ui/EmptyState';
import { isFieldVisible, resolveComputed, validatePdd } from '../lib/pdd';
import { ROLE_LABEL } from '../lib/labels';
import { fmtDateTime } from '../lib/date';
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
  // Approve/reject/revision are one-shot regulatory actions — lock the
  // buttons while a request is in flight.
  const [busy, setBusy] = useState<null | 'start' | 'approve' | 'revise' | 'reject' | 'comment'>(null);
  async function track(key: NonNullable<typeof busy>, fn: () => Promise<void>) {
    setBusy(key);
    try { await fn(); } finally { setBusy(null); }
  }

  if (!pdd || !methodology || !project) return <EmptyState illustration="/illustrations/empty-document.webp" title="PDD not found" hint="This validation item does not exist." />;
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

  // Surface server rejections (403 role mismatch, expired session, …) —
  // an unhandled rejection here looks like a dead button to the VVB.
  function fail(err: unknown) {
    toast.error('Action failed', err instanceof Error ? err.message : 'The server rejected the request.');
  }
  const start = () => track('start', async () => { try { await api.startValidation(pdd!.id); } catch (err) { fail(err); } });
  const approve = () => track('approve', async () => { const ok = await api.registerProject(pdd!.id); if (ok) navigate('/validation'); });
  const revise = () => track('revise', async () => { if (!note.trim()) return; try { await api.requestPddRevision(pdd!.id, note.trim()); navigate('/validation'); } catch (err) { fail(err); } });
  const reject = () => track('reject', async () => { if (!note.trim()) return; try { await api.rejectPdd(pdd!.id, note.trim()); navigate('/validation'); } catch (err) { fail(err); } });
  const comment = () => track('comment', async () => { if (!note.trim()) return; try { await api.addPddComment(pdd!.id, note.trim()); setNote(''); } catch (err) { fail(err); } });

  return (
    <div>
      <PageHeader title={`Validate ${project.name}`} subtitle={`${pdd.id} · ${methodology.code} ${methodology.version}`}
        action={<LinkButton to={`/registration/${pdd.id}/document`} variant="ghost"><FileText size={16} /> Full document</LinkButton>} />

      <div className="mb-4 flex items-center gap-3">
        <PddStatusBadge state={pdd.state} />
        {pdd.state === 'submitted' && <Button onClick={start} loading={busy === 'start'}>Start validation</Button>}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* document */}
        <div className="space-y-5 lg:col-span-2">
          {methodology.pdd_sections.map((section) => (
            <Card key={section.key} className="p-5">
              <h2 className="mb-3 text-base font-semibold text-ink">{section.title}</h2>
              <dl className="grid grid-cols-1 gap-x-6 divide-y divide-rule sm:grid-cols-2">
                {section.fields.filter((f) => isFieldVisible(f, pdd.section_data)).map((f) => (
                  <div className="py-3" key={f.key}>
                    <dt className="text-xs font-medium text-ink-meta">{f.label}{f.unit ? ` (${f.unit})` : ''}</dt>
                    <dd className="mt-0.5 text-sm text-ink">{value(f.key, f.source)}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          ))}
        </div>

        {/* audit panel */}
        <div className="space-y-4">
          <Card className="p-5">
            <h2 className="mb-2 text-sm font-semibold text-ink">Completeness</h2>
            {check.ok ? (
              <p className="text-sm text-brand-700">All required fields complete.</p>
            ) : (
              <ul className="divide-y divide-rule text-sm text-state-rejected">
                {check.missing.map((m) => <li className="py-2" key={m.field}>{m.label}</li>)}
              </ul>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="mb-2 text-sm font-semibold text-ink">Notes & comments</h2>
            <div className="mb-3 max-h-80 divide-y divide-rule overflow-y-auto">
              {comments.length === 0 && <p className="text-sm text-ink-meta">No comments yet.</p>}
              {comments.map((c) => (
                <div key={c.id} className="py-3 text-sm">
                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-ink-meta">
                    <span className="font-medium text-ink-secondary">{c.author_name}</span>
                    <span>· {ROLE_LABEL[c.author_role]}</span>
                    <span className="text-ink-meta">· {fmtDateTime(c.created_at)}</span>
                  </div>
                  <div className="mt-0.5 text-ink">{c.body}</div>
                </div>
              ))}
            </div>
            <Textarea label="Note, request, or rejection reason" placeholder="Add a note, request, or rejection reason…" value={note} onChange={(e) => setNote(e.target.value)} />
            <div className="mt-2 flex flex-wrap gap-2">
              <Button variant="ghost" onClick={comment} disabled={!note.trim()} loading={busy === 'comment'}>Comment</Button>
              {canAct && <Button onClick={approve} disabled={!check.ok} loading={busy === 'approve'}>Approve → Register</Button>}
              {canAct && <Button variant="ghost" onClick={revise} disabled={!note.trim()} loading={busy === 'revise'}>Request revision</Button>}
              {canAct && <Button variant="ghost" onClick={reject} disabled={!note.trim()} loading={busy === 'reject'}>Reject</Button>}
            </div>
            {!check.ok && canAct && <p className="mt-2 text-xs text-ink-meta">Approve is disabled until all required fields are complete.</p>}
          </Card>
        </div>
      </div>
    </div>
  );
}
