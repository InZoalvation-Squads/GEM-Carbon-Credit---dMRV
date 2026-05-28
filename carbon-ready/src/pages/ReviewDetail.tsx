import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ChevronLeft, Lock, ShieldCheck, CheckCircle2, FileCheck2, MessageSquarePlus } from 'lucide-react';
import { Card, CardBody, CardHeader } from '../components/Card';
import { Button } from '../components/Button';
import { Textarea } from '../components/Textarea';
import { Modal } from '../components/Modal';
import { Badge } from '../components/Badge';
import { StatusBadge, CategoryChip, FileKindIcon } from '../components/StatusBadge';
import { useStore } from '../store';
import { CATEGORY_LABEL, ROLE_LABEL } from '../lib/labels';
import { fmtDate, fmtDateTime } from '../lib/date';
import { formatTco2e } from '../lib/format';
import type { AuditLog } from '../types';

type Action = 'approve' | 'reject' | 'revision' | null;

const ACTION_LABEL: Record<string, string> = {
  VERIFICATION_SUBMITTED: 'submitted the package',
  REVIEW_STARTED: 'opened review',
  COMMENT_ADDED: 'added a comment',
  REVISION_REQUESTED: 'requested revision',
  VERIFICATION_APPROVED: 'approved & locked',
  VERIFICATION_REJECTED: 'rejected',
  EVIDENCE_REPLACED: 'replaced evidence',
  EVIDENCE_UPLOADED: 'uploaded evidence',
};

export function ReviewDetail() {
  const { id } = useParams<{ id: string }>();

  const v = useStore((s) => s.verifications.find((x) => x.id === id));
  const evidence = useStore((s) => s.evidence);
  const comments = useStore((s) => s.comments.filter((c) => c.verification_id === id));
  const audit = useStore((s) => s.audit.filter((a) => a.entity_type === 'verification' && a.entity_id === id));
  const project = useStore((s) => s.projects.find((p) => p.id === v?.project_id));

  const startReview = useStore((s) => s.startReview);
  const requestRevision = useStore((s) => s.requestRevision);
  const approveVerification = useStore((s) => s.approveVerification);
  const rejectVerification = useStore((s) => s.rejectVerification);
  const addComment = useStore((s) => s.addComment);

  const [draft, setDraft] = useState('');
  const [action, setAction] = useState<Action>(null);
  const [note, setNote] = useState('');
  const [confirmed, setConfirmed] = useState(false);

  if (!v) {
    return <div className="text-sm text-ink-500">Package not found. <Link to="/verifications" className="text-brand-700 underline">Back to queue</Link></div>;
  }

  const pkgEvidence = evidence.filter((e) => v.evidence_ids.includes(e.id));
  const locked = v.state === 'approved' || v.state === 'rejected';
  const coverage = v.required_categories.map((c) => ({ category: c, present: pkgEvidence.some((e) => e.category === c) }));

  const closeModal = () => { setAction(null); setNote(''); setConfirmed(false); };
  const run = () => {
    if (action === 'approve') approveVerification(v.id, note || undefined);
    if (action === 'reject') rejectVerification(v.id, note);
    if (action === 'revision') requestRevision(v.id, note);
    closeModal();
  };

  return (
    <div>
      <div className="mb-4">
        <Link to="/verifications" className="text-sm text-ink-500 hover:text-ink-900 inline-flex items-center gap-1"><ChevronLeft size={14} /> Verifications</Link>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-ink-900">
              <span className="font-mono text-lg text-brand-700">{v.id}</span> · {fmtDate(v.monitoring_period_start)} – {fmtDate(v.monitoring_period_end)}
            </h1>
            <StatusBadge state={v.state} />
          </div>
          <div className="mt-1 text-sm text-ink-500">
            {project?.name} · Owner {v.owner_name} · Verifier {v.assigned_verifier_name} ·{' '}
            <span className="font-medium text-ink-900">{formatTco2e(v.reduction_kgco2e)}</span> claimed
          </div>
        </div>
        {v.state === 'submitted' && (
          <Button onClick={() => startReview(v.id)}><ShieldCheck size={16} /> Start review</Button>
        )}
      </div>

      {locked && (
        <Card className="mb-5 border-brand-200 bg-brand-50">
          <CardBody className="flex items-center gap-3 py-3">
            <Lock size={16} className="text-brand-700" />
            <div className="text-sm text-brand-800">
              {v.state === 'approved' ? (
                <>Package <strong>locked</strong> on {v.locked_at ? fmtDate(v.locked_at) : 'approval'}. Evidence is read-only.{' '}
                  <span className="font-mono text-xs">hash {v.hash_value}</span> · 🔒 anchoring pending — Hedera Guardian (Sprint 3).</>
              ) : (
                <>Package was rejected and is closed. {v.rejection_reason && <em>“{v.rejection_reason}”</em>}</>
              )}
            </div>
          </CardBody>
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        {/* LEFT */}
        <div className="space-y-5">
          <Card>
            <CardHeader title="Package summary" />
            <CardBody className="grid grid-cols-2 gap-x-5 gap-y-3 text-sm">
              <Field label="Monitoring period" value={`${fmtDate(v.monitoring_period_start)} – ${fmtDate(v.monitoring_period_end)}`} />
              <Field label="Carbon result" value={formatTco2e(v.reduction_kgco2e)} />
              <div className="col-span-2">
                <div className="text-xs uppercase tracking-wide text-ink-400">Emission factor snapshot</div>
                <div className="mt-0.5 font-medium text-ink-900">{v.factors_snapshot}</div>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Required categories" />
            <CardBody className="grid grid-cols-2 gap-2">
              {coverage.map(({ category, present }) => (
                <div key={category}
                  className={'flex items-center gap-2 rounded-md border px-3 py-2 text-sm ' +
                    (present ? 'border-brand-200 bg-brand-50 text-brand-800' : 'border-amber-200 bg-amber-50 text-amber-700')}>
                  <CheckCircle2 size={16} className={present ? 'text-brand-500' : 'text-amber-400'} />
                  {CATEGORY_LABEL[category]}
                </div>
              ))}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title={`Evidence (${pkgEvidence.length})`} action={<FileCheck2 size={16} className="text-ink-300" />} />
            <CardBody className="p-0">
              <ul className="divide-y divide-ink-100">
                {pkgEvidence.map((e) => (
                  <li key={e.id} className="flex items-center gap-3 px-5 py-3">
                    <FileKindIcon kind={e.kind} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-ink-900">{e.file_name}</div>
                      <div className="mt-0.5"><CategoryChip category={e.category} /></div>
                    </div>
                    <span className="font-mono text-xs text-ink-400">v{e.version_number}</span>
                    <CheckCircle2 size={16} className="text-brand-500" />
                  </li>
                ))}
                {pkgEvidence.length === 0 && <li className="px-5 py-8 text-center text-sm text-ink-500">No evidence linked.</li>}
              </ul>
            </CardBody>
          </Card>
        </div>

        {/* RIGHT */}
        <div className="space-y-5">
          <Card>
            <CardHeader title="Conversation" />
            <CardBody className="p-0">
              <div className="max-h-80 overflow-y-auto px-5 py-4 space-y-3">
                {comments.length === 0 && <p className="py-4 text-center text-sm text-ink-400">No comments yet.</p>}
                {comments.map((c) => {
                  const isVerifier = c.author_role === 'verifier';
                  return (
                    <div key={c.id} className={'rounded-md border p-3 ' + (c.reply_to ? 'ml-6 border-ink-100 bg-ink-50' : 'border-ink-200 bg-white')}>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-semibold text-ink-900">{c.author_name}</span>
                        <Badge tone={isVerifier ? 'violet' : 'green'}>{ROLE_LABEL[c.author_role]}</Badge>
                        <span className="text-ink-400">· {fmtDateTime(c.created_at)}</span>
                      </div>
                      {c.evidence_name && <div className="mt-1 text-xs text-ink-400">on {c.evidence_name}</div>}
                      <p className="mt-1 text-sm text-ink-700">{c.body}</p>
                    </div>
                  );
                })}
              </div>
              {!locked && (
                <div className="border-t border-ink-100 p-4">
                  <Textarea rows={2} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Write a comment…" />
                  <div className="mt-2 flex justify-end">
                    <Button size="sm" variant="secondary" disabled={!draft.trim()}
                      onClick={() => { addComment(v.id, draft.trim()); setDraft(''); }}>
                      <MessageSquarePlus size={14} /> Comment
                    </Button>
                  </div>
                </div>
              )}
            </CardBody>
          </Card>

          {!locked && (
            <Card>
              <CardHeader title="Verifier actions" />
              <CardBody className="space-y-2">
                <Button className="w-full" onClick={() => setAction('approve')} disabled={v.state === 'revision_required'}>
                  <ShieldCheck size={16} /> Approve &amp; lock
                </Button>
                <div className="flex gap-2">
                  <Button variant="secondary" className="flex-1" onClick={() => setAction('revision')}>Request revision</Button>
                  <Button variant="danger" className="flex-1" onClick={() => setAction('reject')}>Reject</Button>
                </div>
                {v.state === 'submitted' && <p className="text-xs text-ink-500">Tip: start the review before approving.</p>}
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader title="Activity timeline" action={<Link to="/audit-log" className="text-xs font-medium text-brand-700 hover:underline">Full audit ›</Link>} />
            <CardBody>
              <ol className="space-y-3 border-l border-ink-200 pl-4">
                {audit.map((a: AuditLog) => (
                  <li key={a.id} className="relative">
                    <span className="absolute -left-[21px] top-1 h-2 w-2 rounded-full bg-brand-400 ring-4 ring-white" />
                    <div className="text-sm text-ink-900">
                      <span className="font-medium">{a.user_role ? ROLE_LABEL[a.user_role] : 'User'}</span>{' '}
                      <span className="text-ink-500">{ACTION_LABEL[a.action] ?? a.action}</span>
                    </div>
                    <div className="text-xs text-ink-400">{fmtDateTime(a.created_at)}</div>
                  </li>
                ))}
                {audit.length === 0 && <li className="text-sm text-ink-400">No activity recorded yet.</li>}
              </ol>
            </CardBody>
          </Card>
        </div>
      </div>

      {/* Action modal */}
      <Modal open={action !== null} onClose={closeModal} title={
        action === 'approve' ? `Approve ${v.id}` : action === 'reject' ? `Reject ${v.id}` : 'Request revision'
      }>
        {action === 'approve' && (
          <div className="space-y-4">
            <p className="text-sm text-ink-600">This will lock the package. After approval:</p>
            <ul className="space-y-1.5 text-sm text-ink-700">
              <li className="flex gap-2"><Lock size={16} className="text-brand-600 shrink-0" /> Evidence versions become read-only.</li>
              <li className="flex gap-2"><ShieldCheck size={16} className="text-brand-600 shrink-0" /> Carbon claim of {formatTco2e(v.reduction_kgco2e)} is finalized.</li>
              <li className="flex gap-2"><FileCheck2 size={16} className="text-brand-600 shrink-0" /> A hash-sealed audit record is written, ready for Hedera Guardian (Sprint 3).</li>
            </ul>
            <Textarea label="Approval notes (optional)" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            <label className="flex items-center gap-2 text-sm text-ink-700">
              <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="h-4 w-4 accent-brand-600" />
              I confirm I have reviewed all evidence.
            </label>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={closeModal}>Cancel</Button>
              <Button onClick={run} disabled={!confirmed}><ShieldCheck size={16} /> Approve</Button>
            </div>
          </div>
        )}
        {action === 'revision' && (
          <div className="space-y-4">
            <p className="text-sm text-ink-600">The owner will be notified to address your feedback.</p>
            <Textarea label="What needs to change? (required)" rows={4} value={note} onChange={(e) => setNote(e.target.value)} />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={closeModal}>Cancel</Button>
              <Button onClick={run} disabled={!note.trim()}>Send revision request</Button>
            </div>
          </div>
        )}
        {action === 'reject' && (
          <div className="space-y-4">
            <p className="text-sm text-ink-600">This terminates the workflow. A reason is recorded in the audit log.</p>
            <Textarea label="Reason for rejection (required)" rows={4} value={note} onChange={(e) => setNote(e.target.value)} />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={closeModal}>Cancel</Button>
              <Button variant="danger" onClick={run} disabled={!note.trim()}>Reject package</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-ink-400">{label}</div>
      <div className="mt-0.5 font-medium text-ink-900">{value}</div>
    </div>
  );
}
