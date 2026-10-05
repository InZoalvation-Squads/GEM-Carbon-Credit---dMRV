import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ChevronLeft, Lock, ShieldCheck, CheckCircle2, FileCheck2, MessageSquarePlus, Link2 } from 'lucide-react';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Textarea } from '../components/ui/Textarea';
import { Modal } from '../components/ui/Modal';
import { Badge } from '../components/ui/Badge';
import { StatusBadge, CategoryChip, FileKindIcon } from '../components/ui/StatusBadge';
import { BlockRow, ChainList } from '../components/ui/BlockRow';
import { HashChip } from '../components/ui/HashChip';
import { useStore } from '../store';
import { api } from '../lib/api';
import { CATEGORY_LABEL, ROLE_LABEL } from '../lib/labels';
import { fmtDate, fmtDateTime } from '../lib/date';
import { formatNumber, formatTco2e } from '../lib/format';
import type { AuditLog } from '../types';
import { displayHcs } from '../lib/guardian';
import { locationToCountryCode } from '../lib/geo';

type Action = 'approve' | 'reject' | 'revision' | null;

const ACTION_LABEL: Record<string, string> = {
  VERIFICATION_SUBMITTED: 'submitted the package',
  REVIEW_STARTED: 'opened review',
  COMMENT_ADDED: 'added a comment',
  REVISION_REQUESTED: 'requested revision',
  VERIFICATION_APPROVED: 'approved & locked',
  VERIFICATION_REJECTED: 'rejected',
  VERIFICATION_ANCHORED: 'anchored to Hedera Guardian',
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
  const records = useStore((s) => s.records);
  const factors = useStore((s) => s.factors);


  const credential = useStore((s) => s.credentials.find((c) => c.id === (v?.credential_id ?? '')));

  const [draft, setDraft] = useState('');
  const [action, setAction] = useState<Action>(null);
  const [note, setNote] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  // One in-flight network action at a time — approve/reject/anchor are
  // irreversible, so the buttons must lock while the request runs.
  const [busy, setBusy] = useState<null | 'action' | 'start' | 'anchor' | 'comment'>(null);
  async function track(key: NonNullable<typeof busy>, fn: () => Promise<unknown>) {
    setBusy(key);
    try { await fn(); } finally { setBusy(null); }
  }

  if (!v) {
    return <div className="text-sm text-ink-meta">Package not found. <Link to="/verifications" className="text-petrol-700 underline">Back to queue</Link></div>;
  }

  const pkgEvidence = evidence.filter((e) => v.evidence_ids.includes(e.id));
  // --- VVB data check: recompute the claim from raw monitoring + current EF ---
  const periodRecords = records
    .filter((r) => r.project_id === v.project_id && r.record_date >= v.monitoring_period_start && r.record_date <= v.monitoring_period_end)
    .sort((a, b) => a.record_date.localeCompare(b.record_date));
  const totalKwh = periodRecords.reduce((s2, r) => s2 + r.generation_kwh, 0);
  const country = locationToCountryCode(project?.location.split(',').pop()?.trim() ?? '');
  const currentFactors = factors.filter((f) => f.country === country && f.is_current);
  const ef = currentFactors.length
    ? currentFactors.reduce((a, b) => (b.effective_date >= a.effective_date ? b : a)).factor_kgco2e_per_kwh
    : null;
  const computedKg = ef !== null ? totalKwh * ef : null;
  const deltaPct = computedKg !== null && v.reduction_kgco2e > 0
    ? Math.abs(computedKg - v.reduction_kgco2e) / v.reduction_kgco2e * 100
    : null;
  const claimMatches = deltaPct !== null && deltaPct <= 1;
  const locked = v.state === 'approved' || v.state === 'rejected';
  const coverage = v.required_categories.map((c) => ({ category: c, present: pkgEvidence.some((e) => e.category === c) }));

  const closeModal = () => { setAction(null); setNote(''); setConfirmed(false); };
  const pkgLabel = project?.name ?? v.id;
  const run = () => track('action', async () => {
    if (action === 'approve') await api.approveVerification(v.id, note || undefined);
    if (action === 'reject') await api.rejectVerification(v.id, note);
    if (action === 'revision') await api.requestRevision(v.id, note);
    closeModal();
  });

  return (
    <div>
      <div className="mb-4">
        <Link to="/verifications" className="text-sm text-ink-meta hover:text-ink inline-flex items-center gap-1"><ChevronLeft size={14} /> Verifications</Link>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-ink">
              {pkgLabel} <span className="font-normal text-ink-meta">· {fmtDate(v.monitoring_period_start)} – {fmtDate(v.monitoring_period_end)}</span>
            </h1>
            <StatusBadge state={v.state} />
          </div>
          <div className="mt-1 text-sm text-ink-meta">
            <span className="font-mono text-xs">{v.id}</span> · Owner {v.owner_name} · Verifier {v.assigned_verifier_name} ·{' '}
            <span className="font-medium text-ink">{formatTco2e(v.reduction_kgco2e)}</span> claimed
          </div>
        </div>
        {v.state === 'submitted' && (
          <Button loading={busy === 'start'} onClick={() => void track('start', () => api.startReview(v.id))}><ShieldCheck size={16} /> Start review</Button>
        )}
      </div>

      {locked && (
        <ChainList className="mb-5">
          <BlockRow blockId={v.id} state={v.credential_id ? 'anchored' : v.state} figure={formatTco2e(v.reduction_kgco2e)} source={v.factors_snapshot}>
          <div className="mt-3 flex items-center gap-3 border-t border-rule pt-3">
            <Lock size={16} className="text-petrol-700" />
            <div className="text-sm text-petrol-800">
              {v.state === 'approved' ? (
                v.credential_id == null ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="inline-flex flex-wrap items-center gap-1">Package <strong>locked</strong> on {v.locked_at ? fmtDate(v.locked_at) : 'approval'} · evidence read-only ·{' '}
                      {v.hash_value && <HashChip value={v.hash_value} />} · <Lock size={14} aria-hidden /> anchoring pending.</span>
                    <Button size="sm" loading={busy === 'anchor'} onClick={() => void track('anchor', () => api.anchorVerification(v.id))}>
                      <Link2 size={14} /> Anchor to Hedera Guardian
                    </Button>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center gap-2 font-medium text-petrol-800"><Link2 size={16} aria-hidden /> Anchored on Hedera Guardian{credential?.anchor ? '' : ' (simulated)'}</div>
                    <div className="anchor-provenance mt-1 grid gap-0.5 text-xs text-petrol-700 font-mono">
                      <span className="inline-flex items-center gap-1">credential: <HashChip value={v.credential_id} /></span>
                      <span>HCS: topic {v.hcs_topic_id} · msg #{v.hcs_sequence_number} · {credential?.anchor?.consensus_timestamp ?? credential?.hcs.consensus_timestamp ?? (v.anchored_at ? fmtDateTime(v.anchored_at) : '')}</span>
                      {credential && <a className="underline" href={displayHcs(credential).explorer_url} target="_blank" rel="noreferrer">View on HashScan{displayHcs(credential).real ? '' : ' (mock)'} ↗</a>}
                    </div>
                    {!credential?.anchor && <div className="mt-1 text-xs text-ink-meta">Simulated · not a live Hedera transaction.</div>}
                  </div>
                )
              ) : (
                <>Package was rejected and is closed. {v.rejection_reason && <em>“{v.rejection_reason}”</em>}</>
              )}
            </div>
          </div>
          </BlockRow>
        </ChainList>
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
                <div className="text-xs text-ink-meta">Emission factor snapshot</div>
                <div className="mt-0.5 font-medium text-ink">{v.factors_snapshot}</div>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Data check — ทวนสอบตัวเลขจากข้อมูลดิบ" />
            <CardBody className="space-y-3">
              {periodRecords.length === 0 ? (
                <p className="text-sm text-state-revision">ไม่พบข้อมูล monitoring ในช่วงเวลานี้ — ตรวจสอบกับผู้พัฒนาก่อนอนุมัติ</p>
              ) : (
                <>
                  <div className="max-h-44 overflow-y-auto rounded-sheet border border-rule">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-ground text-left text-xs text-ink-meta">
                        <tr><th className="px-3 py-1.5">Date</th><th className="px-3 py-1.5 text-right">kWh</th></tr>
                      </thead>
                      <tbody>
                        {periodRecords.map((r) => (
                          <tr key={r.id} className="border-t border-rule">
                            <td className="px-3 py-1.5 text-ink-secondary">{fmtDate(r.record_date)}</td>
                            <td className="px-3 py-1.5 text-right font-medium text-ink">{formatNumber(r.generation_kwh, 1)}</td>
                          </tr>
                        ))}
                        <tr className="border-t border-rule bg-ground/60 font-semibold">
                          <td className="px-3 py-1.5">รวม {periodRecords.length} รายการ</td>
                          <td className="px-3 py-1.5 text-right">{formatNumber(totalKwh, 1)} kWh</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <Field label="EF ปัจจุบัน" value={ef !== null ? `${formatNumber(ef, 4)} kgCO₂e/kWh` : 'ไม่พบค่า EF'} />
                    <Field label="คำนวณได้" value={computedKg !== null ? formatTco2e(computedKg) : '—'} />
                  </div>
                  {deltaPct !== null && (
                    <div data-testid="claim-check" className={'flex items-center gap-2 rounded-sheet px-3 py-2 text-sm ' + (claimMatches ? 'bg-petrol-50 text-petrol-800' : 'bg-state-revision/5 text-state-revision')}>
                      <CheckCircle2 size={16} className={claimMatches ? 'text-petrol-600' : 'text-state-revision'} />
                      {claimMatches
                        ? `ตัวเลขที่เคลม (${formatTco2e(v.reduction_kgco2e)}) ตรงกับที่คำนวณจากข้อมูลดิบ (ต่าง ${deltaPct.toFixed(2)}%)`
                        : `ตัวเลขที่เคลมต่างจากที่คำนวณได้ ${deltaPct.toFixed(1)}% — ตรวจสอบก่อนอนุมัติ`}
                    </div>
                  )}
                </>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Required categories" />
            <CardBody className="divide-y divide-rule p-0">
              {coverage.map(({ category, present }) => (
                <div key={category}
                  className={'flex items-center gap-2 px-5 py-3 text-sm ' +
                    (present ? 'text-petrol-700' : 'text-state-revision')}>
                  <CheckCircle2 size={16} className={present ? 'text-petrol-600' : 'text-state-revision'} />
                  {CATEGORY_LABEL[category]}
                </div>
              ))}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title={`Evidence (${pkgEvidence.length})`} action={<FileCheck2 size={16} className="text-ink-meta" />} />
            <CardBody className="p-0">
              <ul className="divide-y divide-rule">
                {pkgEvidence.map((e) => (
                  <li key={e.id} className="flex items-center gap-3 px-5 py-3">
                    <FileKindIcon kind={e.kind} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-ink">{e.file_name}</div>
                      <div className="mt-0.5"><CategoryChip category={e.category} /></div>
                    </div>
                    <span className="font-mono text-xs text-ink-meta">v{e.version_number}</span>
                    <CheckCircle2 size={16} className="text-petrol-600" />
                  </li>
                ))}
                {pkgEvidence.length === 0 && <li className="px-5 py-8 text-center text-sm text-ink-meta">No evidence linked.</li>}
              </ul>
            </CardBody>
          </Card>
        </div>

        {/* RIGHT */}
        <div className="space-y-5">
          <Card>
            <CardHeader title="Conversation" />
            <CardBody className="p-0">
              <div className="max-h-80 divide-y divide-rule overflow-y-auto px-5">
                {comments.length === 0 && <p className="py-4 text-center text-sm text-ink-meta">No comments yet.</p>}
                {comments.map((c) => {
                  const isVerifier = c.author_role === 'verifier';
                  return (
                    <div key={c.id} className={'py-3 ' + (c.reply_to ? 'ml-6' : '')}>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-semibold text-ink">{c.author_name}</span>
                        <Badge tone={isVerifier ? 'violet' : 'green'}>{ROLE_LABEL[c.author_role]}</Badge>
                        <span className="text-ink-meta">· {fmtDateTime(c.created_at)}</span>
                      </div>
                      {c.evidence_name && <div className="mt-1 text-xs text-ink-meta">on {c.evidence_name}</div>}
                      <p className="mt-1 text-sm text-ink-secondary">{c.body}</p>
                    </div>
                  );
                })}
              </div>
              {!locked && (
                <div className="border-t border-rule p-4">
                  <Textarea label="Comment" rows={2} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Write a comment…" />
                  <div className="mt-2 flex justify-end">
                    <Button size="sm" variant="secondary" disabled={!draft.trim()} loading={busy === 'comment'}
                      onClick={() => void track('comment', async () => { await api.addVerificationComment(v.id, draft.trim()); setDraft(''); })}>
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
                {v.state === 'submitted' && <p className="text-xs text-ink-meta">Tip: start the review before approving.</p>}
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader title="Activity timeline" action={<Link to="/audit-log" className="text-xs font-medium text-petrol-700 hover:underline">Full audit ›</Link>} />
            <CardBody>
              <ol className="space-y-3 border-l border-rule pl-4">
                {audit.map((a: AuditLog) => (
                  <li key={a.id} className="relative">
                    <span className="absolute -left-[21px] top-1 h-2 w-2 rounded-full bg-petrol-600 ring-4 ring-white" />
                    <div className="text-sm text-ink">
                      <span className="font-medium">{a.user_role ? ROLE_LABEL[a.user_role] : 'User'}</span>{' '}
                      <span className="text-ink-meta">{ACTION_LABEL[a.action] ?? a.action}</span>
                    </div>
                    <div className="text-xs text-ink-meta">{fmtDateTime(a.created_at)}</div>
                  </li>
                ))}
                {audit.length === 0 && <li className="text-sm text-ink-meta">No activity recorded yet.</li>}
              </ol>
            </CardBody>
          </Card>
        </div>
      </div>

      {/* Action modal */}
      <Modal open={action !== null} onClose={closeModal} title={
        action === 'approve' ? `Approve ${pkgLabel}` : action === 'reject' ? `Reject ${pkgLabel}` : 'Request revision'
      }>
        {action === 'approve' && (
          <div className="space-y-4">
            <p className="text-sm text-ink-secondary">This will lock the package. After approval:</p>
            <ul className="space-y-1.5 text-sm text-ink-secondary">
              <li className="flex gap-2"><Lock size={16} className="text-petrol-600 shrink-0" /> Evidence versions become read-only.</li>
              <li className="flex gap-2"><ShieldCheck size={16} className="text-petrol-600 shrink-0" /> Carbon claim of {formatTco2e(v.reduction_kgco2e)} is finalized.</li>
              <li className="flex gap-2"><FileCheck2 size={16} className="text-petrol-600 shrink-0" /> A hash-sealed audit record is written, ready for Hedera Guardian (Sprint 3).</li>
            </ul>
            <Textarea label="Approval notes (optional)" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            <label className="flex items-center gap-2 text-sm text-ink-secondary">
              <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="h-4 w-4 accent-petrol-600" />
              I confirm I have reviewed all evidence.
            </label>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={closeModal}>Cancel</Button>
              <Button onClick={run} disabled={!confirmed} loading={busy === 'action'}><ShieldCheck size={16} /> Approve</Button>
            </div>
          </div>
        )}
        {action === 'revision' && (
          <div className="space-y-4">
            <p className="text-sm text-ink-secondary">The owner will be notified to address your feedback.</p>
            <Textarea label="What needs to change? (required)" rows={4} value={note} onChange={(e) => setNote(e.target.value)} />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={closeModal}>Cancel</Button>
              <Button onClick={run} disabled={!note.trim()} loading={busy === 'action'}>Send revision request</Button>
            </div>
          </div>
        )}
        {action === 'reject' && (
          <div className="space-y-4">
            <p className="text-sm text-ink-secondary">This terminates the workflow. A reason is recorded in the audit log.</p>
            <Textarea label="Reason for rejection (required)" rows={4} value={note} onChange={(e) => setNote(e.target.value)} />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={closeModal}>Cancel</Button>
              <Button variant="danger" onClick={run} disabled={!note.trim()} loading={busy === 'action'}>Reject package</Button>
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
      <div className="text-xs text-ink-meta">{label}</div>
      <div className="mt-0.5 font-medium text-ink">{value}</div>
    </div>
  );
}
