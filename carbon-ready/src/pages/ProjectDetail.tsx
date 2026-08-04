import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useStore } from '../store';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Table, THead, TR, TH, TD } from '../components/ui/Table';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { ProjectEvidenceTab } from '../components/project/ProjectEvidenceTab';
import { ProjectCreditsTab } from '../components/project/ProjectCreditsTab';
import { PddDocument } from './PddDocument';
import { EmptyState } from '../components/ui/EmptyState';
import { fmtDate } from '../lib/date';
import { formatNumber } from '../lib/format';
import { PROJECT_STATUS_LABEL, sourceLabel } from '../lib/labels';
import { ChevronLeft, Upload as UploadIcon, FileText } from 'lucide-react';
import clsx from 'clsx';
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
  const [tab, setTab] = useState<Tab>('overview');

  if (!project) return <div className="text-sm text-ink-500">Project not found. <Link to="/projects" className="text-brand-700 underline">Back to list</Link></div>;

  const totalKwh = records.reduce((s, r) => s + r.generation_kwh, 0);

  return (
    <div>
      <div className="mb-4">
        <Link to="/projects" className="text-sm text-ink-500 hover:text-ink-900 inline-flex items-center gap-1"><ChevronLeft size={14} /> Projects</Link>
      </div>
      <PageHeader
        title={project.name}
        subtitle={`${project.location} • ${formatNumber(project.capacity_kwp, 2)} kWp • commissioned ${fmtDate(project.commission_date)}`}
        action={<Link to="/upload"><Button><UploadIcon size={16} /> Upload Data</Button></Link>}
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <Card className="p-5">
          <div className="text-xs uppercase tracking-wide text-ink-500">Status</div>
          <div className="mt-2"><Badge tone={project.status === 'active' ? 'green' : 'gray'}>{PROJECT_STATUS_LABEL[project.status]}</Badge></div>
        </Card>
        <Card className="p-5">
          <div className="text-xs uppercase tracking-wide text-ink-500">Records</div>
          <div className="mt-2 text-2xl font-semibold">{records.length}</div>
        </Card>
        <Card className="p-5">
          <div className="text-xs uppercase tracking-wide text-ink-500">Total Generation</div>
          <div className="mt-2 text-2xl font-semibold">{formatNumber(totalKwh, 1)} <span className="text-sm text-ink-400">kWh</span></div>
        </Card>
        <Card className="p-5">
          <div className="text-xs uppercase tracking-wide text-ink-500">Evidence</div>
          <div className="mt-2 text-2xl font-semibold">{evidenceCount}</div>
        </Card>
      </div>

      {/* Tabs */}
      <div className="mb-4 flex items-center gap-1 border-b border-ink-200">
        {([['overview', 'Monitoring'], ['evidence', 'Evidence'], ['credits', 'Credits'], ['pdd', 'PDD Document']] as [Tab, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={clsx(
              'relative px-4 py-2.5 text-sm font-medium transition-colors',
              tab === key ? 'text-brand-700' : 'text-ink-500 hover:text-ink-900'
            )}
          >
            {label}
            {key === 'evidence' && evidenceCount > 0 && (
              <span className="ml-1.5 rounded-full bg-ink-100 px-1.5 py-0.5 text-[11px] text-ink-600">{evidenceCount}</span>
            )}
            {tab === key && <span className="absolute inset-x-0 -bottom-px h-0.5 bg-brand-600" />}
          </button>
        ))}
      </div>

      {/* PDD Document is available regardless of the registration gate so auditors
          can review the registered design document as a standalone record. */}
      {tab === 'pdd' ? (
        pdd ? (
          <Card><CardBody className="p-6"><PddDocument pddId={pdd.id} embedded /></CardBody></Card>
        ) : (
          <Card><CardBody className="p-0">
            <EmptyState icon={<FileText size={32} />} title="No PDD yet" hint="This project has not started registration. Register it under a methodology to generate its Project Design Document." />
          </CardBody></Card>
        )
      ) : (
        <RegistrationGate projectId={project.id}>
          {tab === 'credits' ? (
            <ProjectCreditsTab projectId={project.id} />
          ) : tab === 'overview' ? (
            <Card>
              <CardHeader title="Monitoring Records" />
              <CardBody className="p-0">
                {records.length === 0 ? (
                  <div className="px-5 py-12 text-center text-sm text-ink-500">No records uploaded yet.</div>
                ) : (
                  <>
                  <Table>
                    <THead><TR><TH>Date</TH><TH className="text-right">Generation (kWh)</TH><TH>Source</TH></TR></THead>
                    <tbody>
                      {records.slice(0, 50).map((r) => (
                        <TR key={r.id}>
                          <TD>{fmtDate(r.record_date)}</TD>
                          <TD className="text-right">{formatNumber(r.generation_kwh, 1)}</TD>
                          <TD className="text-ink-500">{sourceLabel(r.source)}</TD>
                        </TR>
                      ))}
                    </tbody>
                  </Table>
                  {records.length > 50 && (
                    <div className="border-t border-ink-100 px-5 py-2 text-xs text-ink-400">
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
      )}
    </div>
  );
}
