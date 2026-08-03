import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Printer, ArrowLeft, Lock, Eye, EyeOff, FileText } from 'lucide-react';
import { useStore } from '../store';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { PddStatusBadge } from '../components/StatusBadge';
import { EmptyState } from '../components/EmptyState';
import { isFieldVisible, resolveComputed } from '../lib/pdd';
import type { PddComputedSource } from '../types';
import clsx from 'clsx';

export function PddDocument({ pddId: pddIdProp, embedded = false }: { pddId?: string; embedded?: boolean } = {}) {
  const params = useParams();
  const pddId = pddIdProp ?? params.pddId;
  const pdd = useStore((s) => s.pdds.find((p) => p.id === pddId));
  const credential = useStore((s) => s.credentials.find((c) => c.id === pdd?.credential_id));
  const methodology = useStore((s) => s.methodologies.find((m) => m.id === pdd?.methodology_id));
  const project = useStore((s) => s.projects.find((p) => p.id === pdd?.project_id));
  const factors = useStore((s) => s.factors);
  // Renders the document as the public VP would: sensitive values masked.
  const [publicView, setPublicView] = useState(false);

  if (!pdd || !methodology || !project) return <EmptyState title="PDD not found" hint="This document does not exist." />;
  const ctx = { project, factors, sectionData: pdd.section_data };

  function display(fieldKey: string, source?: PddComputedSource) {
    if (source) { const v = resolveComputed(source, ctx); return v === null || v === undefined ? '—' : String(v); }
    const v = pdd!.section_data[fieldKey];
    if (v === undefined || v === null || v === '') return '—';
    if (v === true) return 'Yes'; if (v === false) return 'No';
    return String(v);
  }

  return (
    <div className={embedded ? '' : 'mx-auto max-w-3xl'}>
      <div className={clsx('mb-4 flex items-center print:hidden', embedded ? 'justify-end' : 'justify-between')}>
        {!embedded && <Link to={`/registration/${pdd.id}`}><Button variant="ghost"><ArrowLeft size={16} /> Back to editor</Button></Link>}
        <div className="flex items-center gap-2">
          {methodology.document_template === 'T-VER-S-F001-PDD' && (
            <Link to={`/registration/${pdd.id}/official`}>
              <Button variant="ghost"><FileText size={16} /> เอกสารฟอร์ม อบก.</Button>
            </Link>
          )}
          <Button variant="ghost" onClick={() => setPublicView((v) => !v)}>
            {publicView ? <EyeOff size={16} /> : <Eye size={16} />} Public view
          </Button>
          <Button onClick={() => window.print()}><Printer size={16} /> Print / Export</Button>
        </div>
      </div>

      <Card className="space-y-8 p-8">
        <header className="border-b border-ink-200 pb-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-ink-900">Project Design Document</h1>
            <PddStatusBadge state={pdd.state} />
          </div>
          <p className="mt-1 text-sm text-ink-500">{project.name} · {methodology.code} {methodology.version}</p>
          {pdd.content_hash && <p className="mt-1 font-mono text-xs text-ink-400">hash: {pdd.content_hash}</p>}
          {pdd.ipfs_cid && <p className="font-mono text-xs text-ink-400">ipfs: {pdd.ipfs_cid}</p>}
          {credential && (
            <p className="font-mono text-xs text-ink-400">
              vc: {credential.id} ·{' '}
              <a href={credential.hcs.explorer_url} target="_blank" rel="noreferrer" className="text-brand-600 hover:underline">
                HCS message #{credential.hcs.sequence_number}
              </a>
            </p>
          )}
        </header>

        {methodology.pdd_sections.map((section) => (
          <section key={section.key}>
            <h2 className="mb-3 text-lg font-semibold text-ink-900">{section.title}</h2>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
              {section.fields.filter((f) => isFieldVisible(f, pdd.section_data)).map((f) => (
                <div key={f.key}>
                  <dt className="text-xs font-medium uppercase tracking-wide text-ink-400">
                    {f.label}{f.unit ? ` (${f.unit})` : ''}
                    {f.sensitive && (
                      <span className="ml-1 inline-flex items-center gap-0.5 rounded bg-amber-50 px-1 py-0.5 text-[10px] font-medium normal-case tracking-normal text-amber-700">
                        <Lock size={10} /> Restricted
                      </span>
                    )}
                  </dt>
                  <dd className="mt-0.5 text-sm text-ink-800">{f.sensitive && publicView ? '•••' : display(f.key, f.source)}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </Card>
    </div>
  );
}
