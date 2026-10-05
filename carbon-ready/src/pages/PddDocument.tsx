import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Printer, ArrowLeft, Lock, Eye, EyeOff, FileText, Link2 } from 'lucide-react';
import { useStore } from '../store';
import { Card } from '../components/ui/Card';
import { Button, LinkButton } from '../components/ui/Button';
import { PddStatusBadge } from '../components/ui/StatusBadge';
import { EmptyState } from '../components/ui/EmptyState';
import { HashChip } from '../components/ui/HashChip';
import { isFieldVisible, resolveComputed } from '../lib/pdd';
import { OFFICIAL_FORMS } from '../templates/registry';
import type { PddComputedSource } from '../types';
import clsx from 'clsx';
import { displayHcs } from '../lib/guardian';
import { IpfsJsonModal } from '../components/evidence/IpfsJsonModal';

export function PddDocument({ pddId: pddIdProp, embedded = false }: { pddId?: string; embedded?: boolean } = {}) {
  const params = useParams();
  const pddId = pddIdProp ?? params.pddId;
  const pdd = useStore((s) => s.pdds.find((p) => p.id === pddId));
  const [showIpfs, setShowIpfs] = useState(false);
  const credential = useStore((s) => s.credentials.find((c) => c.id === pdd?.credential_id));
  const methodology = useStore((s) => s.methodologies.find((m) => m.id === pdd?.methodology_id));
  const project = useStore((s) => s.projects.find((p) => p.id === pdd?.project_id));
  const factors = useStore((s) => s.factors);
  // Renders the document as the public VP would: sensitive values masked.
  const [publicView, setPublicView] = useState(false);

  if (!pdd || !methodology || !project) return <EmptyState illustration="/illustrations/empty-document.webp" title="PDD not found" hint="This document does not exist." />;
  const ctx = { project, factors, sectionData: pdd.section_data };

  function display(fieldKey: string, source?: PddComputedSource) {
    if (source) { const v = resolveComputed(source, ctx); return v === null || v === undefined ? '—' : String(v); }
    const v = pdd!.section_data[fieldKey];
    if (v === undefined || v === null || v === '') return '—';
    if (v === true) return 'Yes'; if (v === false) return 'No';
    return String(v);
  }

  const Heading = embedded ? 'h2' : 'h1';
  const SectionHeading = embedded ? 'h3' : 'h2';

  return (
    <div className={embedded ? '' : 'mx-auto max-w-3xl'}>
      <div className={clsx('mb-4 flex flex-wrap items-center gap-3 print:hidden', embedded ? 'justify-end' : 'justify-between')}>
        {!embedded && <LinkButton to={`/registration/${pdd.id}`} variant="ghost"><ArrowLeft size={16} /> Back to editor</LinkButton>}
        <div className="flex flex-wrap items-center gap-2">
          {methodology.document_template && (
            <LinkButton to={`/registration/${pdd.id}/official`} variant="ghost"><FileText size={16} /> {OFFICIAL_FORMS[methodology.document_template].buttonLabel}</LinkButton>
          )}
          <Button variant="ghost" onClick={() => setPublicView((v) => !v)}>
            {publicView ? <EyeOff size={16} /> : <Eye size={16} />} Public view
          </Button>
          <Button onClick={() => window.print()}><Printer size={16} /> Print / Export</Button>
        </div>
      </div>

      <Card className="space-y-8 p-8">
        <header className="border-b border-rule pb-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Heading className="text-2xl font-semibold text-ink">Project Design Document</Heading>
            <PddStatusBadge state={pdd.state} />
          </div>
          <p className="mt-1 text-sm text-ink-meta">{project.name} · {methodology.code} {methodology.version}</p>
          {pdd.content_hash && <p className="mt-1 flex items-center gap-1 font-mono text-xs text-ink-meta">hash: <HashChip value={pdd.content_hash} /></p>}
          {pdd.ipfs_cid && (
            <p className="font-mono text-xs text-ink-meta">
              ipfs:{' '}
              <button onClick={() => setShowIpfs(true)} title={pdd.ipfs_cid} className="min-h-8 text-brand-600 hover:underline">
                {pdd.ipfs_cid.length > 24 ? `${pdd.ipfs_cid.slice(0, 14)}…${pdd.ipfs_cid.slice(-6)}` : pdd.ipfs_cid}
              </button>{' '}
              <span className="text-ink-meta">· คลิกเพื่อดู JSON + ตรวจ hash</span>
            </p>
          )}
          {credential && (
            <p className="flex flex-wrap items-center gap-1 font-mono text-xs text-ink-meta">
              vc: <HashChip value={credential.id} /> ·{' '}
              <a href={displayHcs(credential).explorer_url} target="_blank" rel="noreferrer" className="min-h-8 text-brand-600 hover:underline">
                HCS message #{displayHcs(credential).sequence_number}{displayHcs(credential).real ? <><Link2 size={14} aria-hidden /> on-chain</> : ' (simulated)'}
              </a>
            </p>
          )}
        </header>
        {showIpfs && pdd.ipfs_cid && (
          <IpfsJsonModal cid={pdd.ipfs_cid} expectedHash={pdd.content_hash} onClose={() => setShowIpfs(false)} />
        )}

        {methodology.pdd_sections.map((section) => (
          <section key={section.key}>
            <SectionHeading className="mb-3 text-lg font-semibold text-ink">{section.title}</SectionHeading>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
              {section.fields.filter((f) => isFieldVisible(f, pdd.section_data)).map((f) => (
                <div key={f.key}>
                  <dt className="text-xs font-medium text-ink-meta">
                    {f.label}{f.unit ? ` (${f.unit})` : ''}
                    {f.sensitive && (
                      <span className="ml-1 inline-flex items-center gap-0.5 rounded bg-state-revision/5 px-1 py-0.5 text-xs font-medium normal-case tracking-normal text-state-revision">
                        <Lock size={10} /> Restricted
                      </span>
                    )}
                  </dt>
                  <dd className="mt-0.5 text-sm text-ink">{f.sensitive && publicView ? '•••' : display(f.key, f.source)}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </Card>
    </div>
  );
}
