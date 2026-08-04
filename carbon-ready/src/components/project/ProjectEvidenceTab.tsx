import { useMemo, useState } from 'react';
import { Plus, Search, FolderSearch } from 'lucide-react';
import clsx from 'clsx';
import { Card, CardBody } from '../ui/Card';
import { Button } from '../ui/Button';
import { Table, THead, TR, TH, TD } from '../ui/Table';
import { EmptyState } from '../ui/EmptyState';
import { CategoryChip, EvidenceStatusDot, FileKindIcon } from '../ui/StatusBadge';
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
        <label className="relative flex-1 min-w-[220px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" size={16} />
          <input
            value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Search file name or description…"
            className="h-10 w-full rounded-md border border-ink-200 bg-white pl-9 pr-3 text-sm shadow-sm placeholder:text-ink-400 focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
          />
        </label>
        <select value={cat} onChange={(e) => setCat(e.target.value as EvidenceCategory | 'all')}
          className="h-10 rounded-md border border-ink-200 bg-white px-3 text-sm shadow-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500">
          <option value="all">All categories</option>
          {EVIDENCE_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
        </select>
        <button onClick={() => setShowArchived((s) => !s)}
          className={clsx('h-10 rounded-md border px-3 text-sm font-medium transition-colors',
            showArchived ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-ink-200 bg-white text-ink-500 hover:text-ink-900')}>
          {showArchived ? 'Showing archived' : 'Show archived'}
        </button>
        <Button onClick={() => setUploadOpen(true)}><Plus size={16} /> Upload Evidence</Button>
      </div>

      <Card>
        <CardBody className="p-0">
          {rows.length === 0 ? (
            <EmptyState
              icon={<FolderSearch size={32} />}
              title={total === 0 ? 'No evidence uploaded yet' : 'No evidence matches your filters'}
              hint={total === 0 ? 'Upload meter readings, utility bills, site photos and reports to build a verification package.' : 'Try clearing the search or category filter.'}
              action={total === 0 ? <Button onClick={() => setUploadOpen(true)}><Plus size={16} /> Upload Evidence</Button> : undefined}
            />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Name</TH>
                  <TH className="hidden sm:table-cell">Category</TH>
                  <TH>Ver</TH>
                  <TH className="hidden md:table-cell text-right">Size</TH>
                  <TH className="hidden lg:table-cell">Status</TH>
                  <TH>Uploaded</TH>
                </TR>
              </THead>
              <tbody>
                {rows.map((e) => (
                  <TR key={e.id} className="cursor-pointer hover:bg-brand-50/40" >
                    <TD className="font-medium text-ink-900">
                      <button onClick={() => setSelected(e)} className="flex items-center gap-2.5 text-left">
                        <FileKindIcon kind={e.kind} />
                        <span className="truncate">{e.file_name}</span>
                      </button>
                    </TD>
                    <TD className="hidden sm:table-cell"><CategoryChip category={e.category} /></TD>
                    <TD className="font-mono text-xs text-ink-500">v{e.version_number}</TD>
                    <TD className="hidden md:table-cell text-right">{formatBytes(e.file_size)}</TD>
                    <TD className="hidden lg:table-cell"><EvidenceStatusDot status={e.status} /></TD>
                    <TD>
                      <div className="text-ink-700">{e.uploaded_by_name.split(' ')[0]}</div>
                      <div className="text-xs text-ink-400">{fmtDate(e.uploaded_at)}</div>
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          )}
        </CardBody>
      </Card>

      <EvidenceUploadModal open={uploadOpen} onClose={() => setUploadOpen(false)} projectId={projectId} onUploaded={notify} />
      <EvidenceDetailModal evidence={selected} onClose={() => setSelected(null)} />

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 rounded-full bg-ink-900 px-4 py-2 text-sm font-medium text-white shadow-xl">
          {toast}
        </div>
      )}
    </div>
  );
}
