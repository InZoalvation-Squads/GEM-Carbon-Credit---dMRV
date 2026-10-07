import { useRef, useState } from 'react';
import { Download, RefreshCw, Archive, FileText, Image as ImageIcon } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { CategoryChip, EvidenceStatusDot } from '../ui/StatusBadge';
import { useStore } from '../../store';
import { api } from '../../lib/api';
import { toast } from '../layout/Toast';
import { fmtDate } from '../../lib/date';
import { formatBytes } from '../../lib/format';
import { hashFileBytes } from '../../lib/hash';
import { MAX_SIZE } from './EvidenceUploadModal';
import type { EvidenceFile } from '../../types';

function Preview({ ev }: { ev: EvidenceFile }) {
  if (ev.kind === 'image') {
    return (
      <div className="grid place-items-center aspect-[16/10] rounded-sheet bg-surface-sunk text-center text-ink">
        <div>
          <div className="text-lg font-semibold">{ev.file_name.split('.')[0]}</div>
          <div className="mt-1 text-xs text-ink-secondary">Image preview · {formatBytes(ev.file_size)}</div>
        </div>
      </div>
    );
  }
  if (ev.kind === 'pdf') {
    return (
      <div className="grid place-items-center aspect-[16/10] rounded-sheet border border-rule bg-ground text-center text-ink-meta">
        <div>
          <FileText className="mx-auto text-state-rejected" size={32} />
          <div className="mt-2 text-sm font-medium text-ink-secondary">PDF preview (page 1)</div>
          <div className="text-xs">rendered via pdf.js · {formatBytes(ev.file_size)}</div>
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-sheet border border-rule bg-ground p-4 text-sm">
      <div className="grid grid-cols-2 gap-3">
        <Meta k="File size" v={formatBytes(ev.file_size)} />
        <Meta k="Format" v="XLSX (Office Open XML)" />
        <Meta k="Sheets" v="3" />
        <Meta k="Uploaded" v={fmtDate(ev.uploaded_at)} />
      </div>
      <p className="mt-3 text-xs text-ink-meta">Spreadsheets aren't previewed inline — download to inspect.</p>
    </div>
  );
}

function Meta({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <div className="text-xs text-ink-meta">{k}</div>
      <div className="font-medium text-ink">{v}</div>
    </div>
  );
}

export function EvidenceDetailModal({ evidence, onClose }: { evidence: EvidenceFile | null; onClose: () => void }) {
  const allEvidence = useStore((s) => s.evidence);
  const verifications = useStore((s) => s.verifications);
  const comments = useStore((s) => s.comments);
  const pdd = useStore((s) => s.pdds.find((p) => p.project_id === evidence?.project_id));
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  if (!evidence) return null;

  // Both go through api.ts, which writes to the server in server mode — the
  // dialog only closes once the write has landed, and stays open on failure.
  const run = async (label: string, write: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await write();
      onClose();
    } catch (e) {
      toast.error(`${label} failed`, e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const onReplaceFile = async (file: File | undefined) => {
    if (fileRef.current) fileRef.current.value = '';
    if (!file) return;
    if (file.size > MAX_SIZE) {
      toast.error('File too large', `${file.name} exceeds 25 MB.`);
      return;
    }
    await run('Replace', async () => {
      // Same rule as the upload dialog: hash the real bytes, fall back to the
      // store's metadata hash if the file cannot be read.
      const content_hash = await hashFileBytes(file).catch(() => undefined);
      await api.replaceEvidence(evidence.id, { file, file_name: file.name, file_size: file.size, content_hash });
    });
  };

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
          <span className="rounded-full bg-surface-sunk px-2 py-0.5 text-xs font-medium text-ink-secondary">v{evidence.version_number}</span>
          <EvidenceStatusDot status={evidence.status} />
          {isCover && <span className="rounded-full bg-brand-100 px-2 py-0.5 text-xs font-medium text-brand-700">PDD cover</span>}
        </div>
        <div className="text-xs text-ink-meta">
          {formatBytes(evidence.file_size)} · uploaded {fmtDate(evidence.uploaded_at)} by {evidence.uploaded_by_name}
        </div>

        <Preview ev={evidence} />

        {evidence.description && (
          <div>
            <h3 className="text-xs font-semibold text-ink-meta">Description</h3>
            <p className="mt-1 text-sm text-ink-secondary">{evidence.description}</p>
          </div>
        )}

        <div className="flex items-center gap-2 rounded-md bg-ground px-3 py-2 font-mono text-xs text-ink-meta">
          <span className="text-ink-meta">content_hash</span>
          <span className="truncate text-ink-secondary">{evidence.content_hash}</span>
        </div>

        <div>
          <h3 className="text-xs font-semibold text-ink-meta">Version history</h3>
          <ul className="mt-2 space-y-1">
            {chain.map((v) => (
              <li key={v.id} className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-ground">
                <span className="font-mono text-xs font-medium text-ink">v{v.version_number}</span>
                <EvidenceStatusDot status={v.status} />
                <span className="text-xs text-ink-meta">{v.uploaded_by_name} · {fmtDate(v.uploaded_at)}</span>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="text-xs font-semibold text-ink-meta">Linked verifications</h3>
          {linked.length === 0 ? (
            <p className="mt-1 text-sm text-ink-meta">Not yet part of a verification package.</p>
          ) : (
            <div className="mt-2 flex flex-wrap gap-2">
              {linked.map((v) => (
                <span key={v.id} className="rounded-md border border-rule bg-ground px-2 py-1 text-xs font-medium text-ink-secondary">
                  {v.id}
                </span>
              ))}
            </div>
          )}
        </div>

        {evComments.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-ink-meta">Comments ({evComments.length})</h3>
            <div className="mt-2 space-y-2">
              {evComments.map((c) => (
                <div key={c.id} className="border-b border-rule py-3">
                  <div className="text-xs"><span className="font-semibold text-ink">{c.author_name}</span> <span className="text-ink-meta">· {fmtDate(c.created_at)}</span></div>
                  <p className="mt-0.5 text-sm text-ink-secondary">{c.body}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 border-t border-rule pt-4">
          <Button variant="secondary" size="sm" className="w-full whitespace-nowrap"><Download size={14} /> Download</Button>
          <Button variant="secondary" size="sm" className="w-full whitespace-nowrap" disabled={busy || isLocked || evidence.status !== 'active'}
            onClick={() => fileRef.current?.click()}>
            <RefreshCw size={14} /> Replace version
          </Button>
          <input
            ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.xlsx" className="hidden"
            aria-label={`Choose a new version of ${evidence.file_name}`}
            onChange={(e) => void onReplaceFile(e.target.files?.[0])}
          />
          {evidence.kind === 'image' && evidence.status === 'active' && pdd && (
            <Button variant="secondary" size="sm" className="w-full whitespace-nowrap" disabled={isCover}
              onClick={() => void api.savePddDraft(pdd.id, { ...pdd.section_data, cover_evidence_id: evidence.id }, pdd.evidence_ids).catch(() => toast.error('Cannot set cover', 'PDD ล็อกแล้ว (แก้ได้เฉพาะสถานะ draft)'))}>
              <ImageIcon size={14} /> {isCover ? 'PDD cover ✓' : 'Set as PDD cover'}
            </Button>
          )}
          {evidence.status === 'active' && !isLocked && (
            <Button variant="ghost" size="sm" className="w-full whitespace-nowrap text-ink-meta" disabled={busy}
              onClick={() => void run('Archive', () => api.archiveEvidence(evidence.id))}>
              <Archive size={14} /> Archive
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
