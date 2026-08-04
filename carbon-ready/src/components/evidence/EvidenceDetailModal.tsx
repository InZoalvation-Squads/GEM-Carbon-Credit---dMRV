import { Download, RefreshCw, Archive, FileText, Image as ImageIcon } from 'lucide-react';
import { Modal } from './Modal';
import { Button } from './Button';
import { CategoryChip, EvidenceStatusDot } from './StatusBadge';
import { useStore } from '../store';
import { fmtDate } from '../lib/date';
import { formatBytes } from '../lib/format';
import type { EvidenceFile } from '../types';

function Preview({ ev }: { ev: EvidenceFile }) {
  if (ev.kind === 'image') {
    return (
      <div className="grid place-items-center aspect-[16/10] rounded-lg bg-gradient-to-br from-brand-700 to-brand-600 text-center text-white">
        <div>
          <div className="text-lg font-semibold">{ev.file_name.split('.')[0]}</div>
          <div className="mt-1 text-xs text-brand-50">Image preview · {formatBytes(ev.file_size)}</div>
        </div>
      </div>
    );
  }
  if (ev.kind === 'pdf') {
    return (
      <div className="grid place-items-center aspect-[16/10] rounded-lg border border-ink-200 bg-ink-50 text-center text-ink-500">
        <div>
          <FileText className="mx-auto text-red-400" size={32} />
          <div className="mt-2 text-sm font-medium text-ink-700">PDF preview (page 1)</div>
          <div className="text-xs">rendered via pdf.js · {formatBytes(ev.file_size)}</div>
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-ink-200 bg-ink-50 p-4 text-sm">
      <div className="grid grid-cols-2 gap-3">
        <Meta k="File size" v={formatBytes(ev.file_size)} />
        <Meta k="Format" v="XLSX (Office Open XML)" />
        <Meta k="Sheets" v="3" />
        <Meta k="Uploaded" v={fmtDate(ev.uploaded_at)} />
      </div>
      <p className="mt-3 text-xs text-ink-500">Spreadsheets aren't previewed inline — download to inspect.</p>
    </div>
  );
}

function Meta({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-ink-400">{k}</div>
      <div className="font-medium text-ink-900">{v}</div>
    </div>
  );
}

export function EvidenceDetailModal({ evidence, onClose }: { evidence: EvidenceFile | null; onClose: () => void }) {
  const allEvidence = useStore((s) => s.evidence);
  const verifications = useStore((s) => s.verifications);
  const comments = useStore((s) => s.comments);
  const archiveEvidence = useStore((s) => s.archiveEvidence);
  const replaceEvidence = useStore((s) => s.replaceEvidence);
  const savePddDraft = useStore((s) => s.savePddDraft);
  const pdd = useStore((s) => s.pdds.find((p) => p.project_id === evidence?.project_id));

  if (!evidence) return null;

  const isCover = pdd?.section_data.cover_evidence_id === evidence.id;

  // walk the version chain (parent_id links older → newer)
  const chain: EvidenceFile[] = [];
  const byId = new Map(allEvidence.map((e) => [e.id, e]));
  let cursor: EvidenceFile | undefined = evidence;
  const seen = new Set<string>();
  while (cursor && !seen.has(cursor.id)) {
    seen.add(cursor.id);
    chain.push(cursor);
    cursor = cursor.parent_id ? byId.get(cursor.parent_id) : undefined;
  }
  // also include any rows whose parent is this one (newer versions)
  allEvidence
    .filter((e) => e.parent_id === evidence.id && !seen.has(e.id))
    .forEach((e) => chain.unshift(e));
  chain.sort((a, b) => b.version_number - a.version_number);

  const linked = verifications.filter((v) => v.evidence_ids.includes(evidence.id));
  const isLocked = linked.some((v) => v.state === 'approved');
  const evComments = comments.filter((c) => c.evidence_id === evidence.id);

  return (
    <Modal open onClose={onClose} title={evidence.file_name} size="lg">
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <CategoryChip category={evidence.category} />
          <span className="rounded-full bg-ink-100 px-2 py-0.5 text-xs font-medium text-ink-700">v{evidence.version_number}</span>
          <EvidenceStatusDot status={evidence.status} />
          {isCover && <span className="rounded-full bg-brand-100 px-2 py-0.5 text-xs font-medium text-brand-700">PDD cover</span>}
        </div>
        <div className="text-xs text-ink-500">
          {formatBytes(evidence.file_size)} · uploaded {fmtDate(evidence.uploaded_at)} by {evidence.uploaded_by_name}
        </div>

        <Preview ev={evidence} />

        {evidence.description && (
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-400">Description</h4>
            <p className="mt-1 text-sm text-ink-700">{evidence.description}</p>
          </div>
        )}

        <div className="flex items-center gap-2 rounded-md bg-ink-50 px-3 py-2 font-mono text-[11px] text-ink-500">
          <span className="text-ink-400">content_hash</span>
          <span className="truncate text-ink-700">{evidence.content_hash}</span>
        </div>

        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-400">Version history</h4>
          <ul className="mt-2 space-y-1">
            {chain.map((v) => (
              <li key={v.id} className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-ink-50">
                <span className="font-mono text-xs font-medium text-ink-900">v{v.version_number}</span>
                <EvidenceStatusDot status={v.status} />
                <span className="text-xs text-ink-500">{v.uploaded_by_name} · {fmtDate(v.uploaded_at)}</span>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-400">Linked verifications</h4>
          {linked.length === 0 ? (
            <p className="mt-1 text-sm text-ink-400">Not yet part of a verification package.</p>
          ) : (
            <div className="mt-2 flex flex-wrap gap-2">
              {linked.map((v) => (
                <span key={v.id} className="rounded-md border border-ink-200 bg-ink-50 px-2 py-1 text-xs font-medium text-ink-700">
                  {v.id}
                </span>
              ))}
            </div>
          )}
        </div>

        {evComments.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-400">Comments ({evComments.length})</h4>
            <div className="mt-2 space-y-2">
              {evComments.map((c) => (
                <div key={c.id} className="rounded-md border border-ink-100 bg-ink-50 p-2.5">
                  <div className="text-xs"><span className="font-semibold text-ink-900">{c.author_name}</span> <span className="text-ink-400">· {fmtDate(c.created_at)}</span></div>
                  <p className="mt-0.5 text-sm text-ink-700">{c.body}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 border-t border-ink-100 pt-4">
          <Button variant="secondary" size="sm" className="w-full whitespace-nowrap"><Download size={14} /> Download</Button>
          <Button variant="secondary" size="sm" className="w-full whitespace-nowrap" disabled={isLocked || evidence.status !== 'active'}
            onClick={() => { replaceEvidence(evidence.id, { file_size: evidence.file_size + 120_000 }); onClose(); }}>
            <RefreshCw size={14} /> Replace version
          </Button>
          {evidence.kind === 'image' && evidence.status === 'active' && pdd && (
            <Button variant="secondary" size="sm" className="w-full whitespace-nowrap" disabled={isCover}
              onClick={() => savePddDraft(pdd.id, { ...pdd.section_data, cover_evidence_id: evidence.id }, pdd.evidence_ids)}>
              <ImageIcon size={14} /> {isCover ? 'PDD cover ✓' : 'Set as PDD cover'}
            </Button>
          )}
          {evidence.status === 'active' && !isLocked && (
            <Button variant="ghost" size="sm" className="w-full whitespace-nowrap text-ink-500"
              onClick={() => { archiveEvidence(evidence.id); onClose(); }}>
              <Archive size={14} /> Archive
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
