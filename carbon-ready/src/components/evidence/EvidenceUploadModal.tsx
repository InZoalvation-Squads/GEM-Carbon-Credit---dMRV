import { useRef, useState } from 'react';
import { CloudUpload, X, AlertTriangle } from 'lucide-react';
import clsx from 'clsx';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Textarea } from '../ui/Textarea';
import { FileKindIcon } from '../ui/StatusBadge';
import { CATEGORY_LABEL, EVIDENCE_CATEGORIES } from '../../lib/labels';
import { formatBytes } from '../../lib/format';
import { hashFileBytes } from '../../lib/hash';
import { serverMode, evidenceApi } from '../../lib/server-api';
import { toast } from '../layout/Toast';
import { useStore } from '../../store';
import type { EvidenceCategory, FileKind, UUID } from '../../types';

const MAX_SIZE = 25 * 1024 * 1024; // matches the server multipart cap (MAX_UPLOAD_BYTES)

interface Staged {
  key: string;
  file_name: string;
  file_size: number;
  kind: FileKind;
  category: EvidenceCategory;
  tooBig: boolean;
  /** Real browser File when the user dropped/browsed one; absent for demo samples. */
  file?: File;
}

function kindFromName(name: string): FileKind {
  const ext = name.split('.').pop()?.toLowerCase();
  if (ext === 'xlsx') return 'xlsx';
  if (ext === 'jpg' || ext === 'jpeg' || ext === 'png') return 'image';
  return 'pdf';
}

function guessCategory(name: string): EvidenceCategory {
  const n = name.toLowerCase();
  if (n.includes('meter')) return 'meter_reading';
  if (n.includes('bill') || n.includes('utility')) return 'utility_bill';
  if (n.includes('commission')) return 'commissioning_report';
  if (n.includes('maint') || n.includes('inverter') || n.includes('om-')) return 'maintenance_report';
  if (n.includes('photo') || n.includes('rooftop') || n.includes('array') || n.includes('drone')) return 'site_photo';
  if (n.includes('verif')) return 'verification_report';
  return 'supporting_evidence';
}

const SAMPLE = [
  'may-2026-revenue-meter.pdf',
  'may-2026-utility-bill.pdf',
  'rooftop-cleaning-may.jpg',
  'inverter-log-may.xlsx',
];

export function EvidenceUploadModal({
  open, onClose, projectId, onUploaded,
}: {
  open: boolean;
  onClose: () => void;
  projectId: UUID;
  onUploaded: (count: number) => void;
}) {
  const uploadEvidence = useStore((s) => s.uploadEvidence);
  const ingestEvidence = useStore((s) => s.ingestEvidence);
  const [staged, setStaged] = useState<Staged[]>([]);
  const [desc, setDesc] = useState('');
  const [hover, setHover] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const add = (files: { name: string; size: number; file?: File }[]) =>
    setStaged((prev) => [
      ...prev,
      ...files.map((f) => ({
        key: Math.random().toString(36).slice(2),
        file_name: f.name, file_size: f.size, kind: kindFromName(f.name),
        category: guessCategory(f.name), tooBig: f.size > MAX_SIZE, file: f.file,
      })),
    ]);

  const reset = () => { setStaged([]); setDesc(''); setBusy(false); };
  const close = () => { reset(); onClose(); };
  const valid = staged.filter((s) => !s.tooBig);

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    // Hash every real File first, then commit the uploads, so a hashing failure
    // can never leave the batch half-uploaded. Demo samples (no File) and files
    // whose bytes cannot be read fall back to the store's metadata hash.
    const hashes = await Promise.all(
      valid.map(async (s) => {
        if (!s.file) return undefined;
        try { return await hashFileBytes(s.file); } catch { return undefined; }
      })
    );
    let done = 0;
    for (let i = 0; i < valid.length; i++) {
      const s = valid[i];
      // Server mode: push real bytes to the API so /evidence/:id/file can
      // serve them back (document figures, PDD cover). Demo samples have no
      // File and stay local-store only in either mode.
      if (serverMode() && s.file) {
        try {
          const row = await evidenceApi.upload(projectId, s.file, {
            category: s.category, description: desc || undefined, client_hash: hashes[i],
          });
          ingestEvidence(row);
          done++;
        } catch {
          toast.error('Upload failed', s.file_name);
        }
      } else {
        uploadEvidence(projectId, {
          file_name: s.file_name, kind: s.kind, file_size: s.file_size,
          category: s.category, description: desc || undefined, content_hash: hashes[i],
        });
        done++;
      }
    }
    if (done > 0) onUploaded(done);
    close();
  };

  return (
    <Modal open={open} onClose={close} title="Upload Evidence">
      <div className="space-y-4">
        <div
          role="button" tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setHover(true); }}
          onDragLeave={() => setHover(false)}
          onDrop={(e) => {
            e.preventDefault(); setHover(false);
            add(Array.from(e.dataTransfer.files).map((f) => ({ name: f.name, size: f.size, file: f })));
          }}
          className={clsx(
            'cursor-pointer rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors',
            hover ? 'border-brand-500 bg-brand-50' : 'border-ink-200 hover:border-brand-500'
          )}
        >
          <CloudUpload className="mx-auto text-ink-400" size={28} />
          <div className="mt-2 text-sm font-medium text-ink-900">Drop files here, or click to browse</div>
          <div className="mt-1 text-xs text-ink-500">PDF · JPG · PNG · XLSX — up to 25 MB each</div>
        </div>
        <input
          ref={inputRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.xlsx" className="hidden"
          onChange={(e) => { add(Array.from(e.target.files ?? []).map((f) => ({ name: f.name, size: f.size, file: f }))); e.target.value = ''; }}
        />

        {staged.length === 0 && (
          <button onClick={() => add(SAMPLE.map((name) => ({ name, size: Math.floor(400_000 + Math.random() * 3_500_000) })))}
            className="text-xs font-medium text-brand-700 hover:underline">
            + Add sample files (demo)
          </button>
        )}

        {staged.length > 0 && (
          <div className="space-y-1.5 max-h-52 overflow-y-auto">
            <div className="text-xs font-medium text-ink-500">Selected ({staged.length})</div>
            {staged.map((s) => (
              <div key={s.key} className={clsx('flex items-center gap-3 rounded-md border px-3 py-2',
                s.tooBig ? 'border-red-200 bg-red-50' : 'border-ink-200 bg-ink-50')}>
                <FileKindIcon kind={s.kind} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-ink-900">{s.file_name}</div>
                  <div className={clsx('text-xs', s.tooBig ? 'text-red-600' : 'text-ink-500')}>
                    {formatBytes(s.file_size)}{s.tooBig && ' · exceeds 25 MB, skipped'}
                  </div>
                </div>
                {!s.tooBig && (
                  <select value={s.category}
                    onChange={(e) => setStaged((prev) => prev.map((x) => x.key === s.key ? { ...x, category: e.target.value as EvidenceCategory } : x))}
                    className="h-8 rounded-md border border-ink-200 bg-white px-2 text-xs">
                    {EVIDENCE_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
                  </select>
                )}
                <button onClick={() => setStaged((prev) => prev.filter((x) => x.key !== s.key))}
                  aria-label={`Remove ${s.file_name}`} className="text-ink-400 hover:text-ink-900">
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        {staged.length > 0 && (
          <Textarea label="Description (optional, applies to all)" rows={2}
            value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="e.g. May 2026 monitoring cycle" />
        )}

        {staged.some((s) => s.tooBig) && (
          <div className="flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
            <AlertTriangle size={14} /> {staged.filter((s) => s.tooBig).length} file(s) exceed 25 MB and will be skipped.
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={close} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={valid.length === 0 || busy}>
            {busy ? 'Uploading…' : `Upload ${valid.length > 0 ? `${valid.length} file${valid.length > 1 ? 's' : ''}` : 'files'}`}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
