import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useStore } from '../store';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { StatusBadge } from '../components/ui/StatusBadge';
import { HeadBlock } from '../components/ui/HeadBlock';
import { Tabs } from '../components/ui/Tabs';
import { BlockRow, ChainList } from '../components/ui/BlockRow';
import { Table, THead, TR, TH, TD } from '../components/ui/Table';
import { PageHeader } from '../components/layout/PageHeader';
import { LinkButton } from '../components/ui/Button';
import { ProjectEvidenceTab } from '../components/project/ProjectEvidenceTab';
import { ProjectCreditsTab } from '../components/project/ProjectCreditsTab';
import { PddDocument } from './PddDocument';
import { EmptyState } from '../components/ui/EmptyState';
import { fmtDate, fmtDateTime } from '../lib/date';
import { formatNumber } from '../lib/format';
import { PROJECT_STATUS_LABEL, ACTION_LABEL, sourceLabel } from '../lib/labels';
import { ChevronLeft, Upload as UploadIcon, FileText } from 'lucide-react';
import { RegistrationGate } from '../components/project/RegistrationGate';

type Tab = 'overview' | 'evidence' | 'credits' | 'pdd';

export function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const project = useStore((s) => s.projects.find((p) => p.id === id));
  const records = useStore((s) =>
    s.records.filter((r) => r.project_id === id).sort((a, b) => b.record_date.localeCompare(a.record_date))
  );
  const evidenceCount = useStore((s) => s.evidence.filter((e) => e.project_id === id && e.status === 'active').length);
  const pdd = useStore((s) => s.pdds.find((p) => p.project_id === id));
  const activity = useStore((s) => s.audit.filter((a) => a.entity_id === id));
  const [tab, setTab] = useState<Tab>('overview');

  if (!project) return <div className="text-sm text-ink-meta">Project not found. <Link to="/projects" className="text-petrol-700 underline">Back to list</Link></div>;

  const totalKwh = records.reduce((s, r) => s + r.generation_kwh, 0);

  return (
    <div>
      <div className="mb-4">
        <Link to="/projects" className="text-sm text-ink-meta hover:text-ink inline-flex items-center gap-1"><ChevronLeft size={14} /> Projects</Link>
      </div>
      <PageHeader
        title={project.name}
        subtitle={`${project.location} • ${formatNumber(project.capacity_kwp, 2)} kWp • commissioned ${fmtDate(project.commission_date)}`}
        action={<LinkButton to="/upload"><UploadIcon size={16} /> Upload Data</LinkButton>}
      />

      <dl className="mb-4 grid grid-cols-12 gap-x-6 divide-y divide-rule border-y border-rule text-sm sm:divide-y-0">
        <div className="col-span-12 py-3 sm:col-span-4"><dt className="text-ink-meta">Location</dt><dd>{project.location}</dd></div>
        <div className="col-span-12 py-3 sm:col-span-4"><dt className="text-ink-meta">Capacity</dt><dd className="font-mono">{formatNumber(project.capacity_kwp, 2)} kWp</dd></div>
        <div className="col-span-12 py-3 sm:col-span-4"><dt className="text-ink-meta">Commissioned</dt><dd className="font-mono">{fmtDate(project.commission_date)}</dd></div>
      </dl>
      <HeadBlock className="mb-6" figures={[
        { label: 'Status', value: <StatusBadge state={project.status} label={PROJECT_STATUS_LABEL[project.status]} /> },
        { label: 'Records', value: records.length },
        { label: 'Total Generation', value: formatNumber(totalKwh, 1), unit: 'kWh' },
        { label: 'Evidence', value: evidenceCount },
      ]} />
      <Tabs label="Project" value={tab} onChange={setTab} items={([
        ['overview', 'Monitoring'], ['evidence', <>Evidence{evidenceCount > 0 && <span className="ml-1.5 text-xs">{evidenceCount}</span>}</>], ['credits', 'Credits'], ['pdd', 'PDD Document'],
      ] as const).map(([key, label]) => ({ value: key, label, content: (
      /* PDD remains available outside the registration gate. */
      key === 'pdd' ? (
        pdd ? (
          <PddDocument pddId={pdd.id} embedded />
        ) : (
          <Card><CardBody className="p-0">
            <EmptyState icon={<FileText size={32} />} illustration="/illustrations/empty-document.webp" title="No PDD yet" hint="This project has not started registration. Register it under a methodology to generate its Project Design Document." />
          </CardBody></Card>
        )
      ) : (
        <RegistrationGate projectId={project.id}>
          {key === 'credits' ? (
            <ProjectCreditsTab projectId={project.id} />
          ) : key === 'overview' ? (
            <Card>
              <CardHeader title="Monitoring Records" />
              <CardBody className="p-0">
                {records.length === 0 ? (
                  <div className="px-5 py-12 text-center text-sm text-ink-meta">No records uploaded yet.</div>
                ) : (
                  <>
                  <Table mobileLabels={["Date", "Generation (kWh)", "Source"]}>
                    <THead><TR><TH>Date</TH><TH className="text-right">Generation (kWh)</TH><TH>Source</TH></TR></THead>
                    <tbody>
                      {records.slice(0, 50).map((r) => (
                        <TR key={r.id}>
                          <TD>{fmtDate(r.record_date)}</TD>
                          <TD className="text-right">{formatNumber(r.generation_kwh, 1)}</TD>
                          <TD className="text-ink-meta">{sourceLabel(r.source)}</TD>
                        </TR>
                      ))}
                    </tbody>
                  </Table>
                  {records.length > 50 && (
                    <div className="border-t border-rule px-5 py-2 text-xs text-ink-meta">
                      Showing 50 of {records.length} records (newest first) — use Calculations for full-period rollups.
                    </div>
                  )}
                  </>
                )}
              </CardBody>
            </Card>
          ) : (
            <ProjectEvidenceTab projectId={project.id} />
          )}
        </RegistrationGate>
      )
      ) }))} />
      <section className="mt-6">
        <h2 className="mb-3 text-lg font-semibold">Recent Activity</h2>
        {activity.length ? <ChainList>{activity.map((a) => <BlockRow key={a.id} blockId={a.id}
          figure={ACTION_LABEL[a.action] ?? a.action} source={<span className="font-mono text-xs">{fmtDateTime(a.created_at)}</span>}
          state={a.hcs_sequence_number != null ? 'anchored' : 'active'} statusLabel={a.hcs_sequence_number != null ? 'Anchored' : '—'} hash={a.row_hash ?? undefined} />)}</ChainList> :
          <p className="text-sm text-ink-meta">No activity recorded yet.</p>}
      </section>
    </div>
  );
}
