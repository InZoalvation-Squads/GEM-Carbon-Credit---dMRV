import { useStore } from '../store';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { BlockRow, ChainList } from '../components/ui/BlockRow';
import { EmptyState } from '../components/ui/EmptyState';
import { fmtDate } from '../lib/date';

export function ValidationQueue() {
  const queue = useStore((s) => s.validationQueue());
  const projects = useStore((s) => s.projects);
  const methodologies = useStore((s) => s.methodologies);
  const projName = (id: string) => projects.find((p) => p.id === id)?.name ?? id;
  const methLabel = (methodologyId: string, snapshot: string) => {
    const m = methodologies.find((x) => x.id === methodologyId);
    return m ? `${m.code} ${m.version}` : snapshot || '—';
  };
  return <div>
    <PageHeader title="Validation Queue" subtitle="PDDs and REC registrations awaiting review before a project can be registered" />
    {queue.length ? <ChainList>{queue.map((p) => <BlockRow key={p.id} blockId={p.id}
      to={`/validation/${p.id}`} figure={projName(p.project_id)} source={methLabel(p.methodology_id, p.methodology_snapshot)}
      state={p.state} hash={p.content_hash ?? undefined}>
      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
        <div><dt className="text-ink-meta">Submitted</dt><dd className="font-mono">{p.submitted_at ? fmtDate(p.submitted_at.slice(0, 10)) : '—'}</dd></div>
        <div><dt className="text-ink-meta">Validator</dt><dd>{p.assigned_validator_name}</dd></div>
      </dl>
    </BlockRow>)}</ChainList> : <Card><EmptyState title="Queue is empty" hint="No PDDs or REC registrations are currently awaiting review." /></Card>}
  </div>;
}
