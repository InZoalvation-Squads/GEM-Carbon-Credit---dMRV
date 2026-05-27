import { useParams, Link } from 'react-router-dom';
import { useStore } from '../store';
import { Card, CardBody, CardHeader } from '../components/Card';
import { Badge } from '../components/Badge';
import { Table, THead, TR, TH, TD } from '../components/Table';
import { PageHeader } from '../components/PageHeader';
import { Button } from '../components/Button';
import { fmtDate } from '../lib/date';
import { formatNumber } from '../lib/format';
import { ChevronLeft, Upload as UploadIcon } from 'lucide-react';

export function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const project = useStore((s) => s.projects.find((p) => p.id === id));
  const records = useStore((s) =>
    s.records.filter((r) => r.project_id === id).sort((a, b) => b.record_date.localeCompare(a.record_date))
  );

  if (!project) return <div className="text-sm text-ink-500">Project not found. <Link to="/projects" className="text-brand-700 underline">Back to list</Link></div>;

  const totalKwh = records.reduce((s, r) => s + r.generation_kwh, 0);

  return (
    <div>
      <div className="mb-4">
        <Link to="/projects" className="text-sm text-ink-500 hover:text-ink-900 inline-flex items-center gap-1"><ChevronLeft size={14} /> Projects</Link>
      </div>
      <PageHeader
        title={project.name}
        subtitle={`${project.location} • ${project.capacity_kwp} kWp • commissioned ${fmtDate(project.commission_date)}`}
        action={<Link to="/upload"><Button><UploadIcon size={16} /> Upload Data</Button></Link>}
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Card className="p-5">
          <div className="text-xs uppercase tracking-wide text-ink-500">Status</div>
          <div className="mt-2"><Badge tone={project.status === 'active' ? 'green' : 'gray'}>{project.status}</Badge></div>
        </Card>
        <Card className="p-5">
          <div className="text-xs uppercase tracking-wide text-ink-500">Records</div>
          <div className="mt-2 text-2xl font-semibold">{records.length}</div>
        </Card>
        <Card className="p-5">
          <div className="text-xs uppercase tracking-wide text-ink-500">Total Generation</div>
          <div className="mt-2 text-2xl font-semibold">{formatNumber(totalKwh, 1)} kWh</div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Monitoring Records" />
        <CardBody className="p-0">
          {records.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-ink-500">No records uploaded yet.</div>
          ) : (
            <Table>
              <THead><TR><TH>Date</TH><TH className="text-right">Generation (kWh)</TH><TH>Source</TH></TR></THead>
              <tbody>
                {records.slice(0, 50).map((r) => (
                  <TR key={r.id}>
                    <TD>{fmtDate(r.record_date)}</TD>
                    <TD className="text-right">{formatNumber(r.generation_kwh, 1)}</TD>
                    <TD className="text-ink-500">{r.source}</TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
