import { useMemo, useState } from 'react';
import { Plus, FolderSearch } from 'lucide-react';
import clsx from 'clsx';
import { Card, CardBody } from '../ui/Card';
import { Button } from '../ui/Button';
import { BlockRow, ChainList } from '../ui/BlockRow';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { EmptyState } from '../ui/EmptyState';
import { CategoryChip, FileKindIcon } from '../ui/StatusBadge';
import { EvidenceUploadModal } from '../evidence/EvidenceUploadModal';
import { EvidenceDetailModal } from '../evidence/EvidenceDetailModal';
import { useStore } from '../../store';
import { CATEGORY_LABEL, EVIDENCE_CATEGORIES } from '../../lib/labels';
import { fmtDate } from '../../lib/date';
import { formatBytes } from '../../lib/format';
import type { EvidenceCategory, EvidenceFile, UUID } from '../../types';

export function ProjectEvidenceTab({ projectId }: { projectId: UUID }) {
  const evidence = useStore((s) => s.evidence);
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState<EvidenceCategory | 'all'>('all');
  const [showArchived, setShowArchived] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [selected, setSelected] = useState<EvidenceFile | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const rows = useMemo(() => {
    return evidence
      .filter((e) => e.project_id === projectId)
      .filter((e) => e.status !== 'superseded')
      .filter((e) => (showArchived ? true : e.status !== 'archived'))
      .filter((e) => (cat === 'all' ? true : e.category === cat))
      .filter((e) => {
        if (!query) return true;
        const q = query.toLowerCase();
        return e.file_name.toLowerCase().includes(q) || (e.description ?? '').toLowerCase().includes(q);
      })
      .sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at));
  }, [evidence, projectId, query, cat, showArchived]);

  const total = evidence.filter((e) => e.project_id === projectId && e.status === 'active').length;

  const notify = (count: number) => {
    setToast(`${count} file${count > 1 ? 's' : ''} uploaded · audit log updated`);
    setTimeout(() => setToast(null), 3000);
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2.5 mb-4">
        <div className="min-w-0 flex-1">
          <Input label="Search evidence" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search file name or description…" />
        </div>
        <Select label="Category" value={cat} onChange={(e) => setCat(e.target.value as EvidenceCategory | 'all')}>
          <option value="all">All categories</option>
          {EVIDENCE_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
        </Select>
        <button aria-pressed={showArchived} onClick={() => setShowArchived((s) => !s)}
          className={clsx('h-10 rounded-md border px-3 text-sm font-medium transition-colors',
            showArchived ? 'border-petrol-100 bg-petrol-50 text-petrol-700' : 'border-rule bg-white text-ink-meta hover:text-ink')}>
          {showArchived ? 'Showing archived' : 'Show archived'}
        </button>
        <Button onClick={() => setUploadOpen(true)}><Plus size={16} /> Upload Evidence</Button>
      </div>

      <Card>
        <CardBody className="p-0">
          {rows.length === 0 ? (
            <EmptyState
              illustration={total === 0 ? "/illustrations/empty-document.webp" : "/illustrations/empty-filter.webp"}
              icon={<FolderSearch size={32} />}
              title={total === 0 ? 'No evidence uploaded yet' : 'No evidence matches your filters'}
              hint={total === 0 ? 'Upload meter readings, utility bills, site photos and reports to build a verification package.' : 'Try clearing the search or category filter.'}
              action={total === 0 ? <Button onClick={() => setUploadOpen(true)}><Plus size={16} /> Upload Evidence</Button> : undefined}
            />
          ) : (
            <ChainList framed={false}>{rows.map((e) => <BlockRow key={e.id} blockId={e.id} state={e.status} hash={e.content_hash}
              figure={<button className="inline-flex min-h-8 items-center gap-2 text-left text-base text-petrol-600 hover:underline" onClick={() => setSelected(e)}><FileKindIcon kind={e.kind} />{e.file_name}</button>}
              source={<><CategoryChip category={e.category} /> · <span className="font-mono text-xs">v{e.version_number}</span> · {formatBytes(e.file_size)}</>}>
              <div className="mt-2 text-sm text-ink-secondary">{e.uploaded_by_name.split(' ')[0]} · <span className="font-mono text-xs">{fmtDate(e.uploaded_at)}</span></div>
            </BlockRow>)}</ChainList>

          )}
        </CardBody>
      </Card>

      <EvidenceUploadModal open={uploadOpen} onClose={() => setUploadOpen(false)} projectId={projectId} onUploaded={notify} />
      <EvidenceDetailModal evidence={selected} onClose={() => setSelected(null)} />

      {toast && (
        <div role="status" className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 rounded-full bg-ink px-4 py-2 text-sm font-medium text-white">
          {toast}
        </div>
      )}
    </div>
  );
}
