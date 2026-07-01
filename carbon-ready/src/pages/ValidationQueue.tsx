import { useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/Card';
import { Table, THead, TR, TH, TD } from '../components/Table';
import { PddStatusBadge } from '../components/StatusBadge';
import { EmptyState } from '../components/EmptyState';
import { fmtDate } from '../lib/date';

export function ValidationQueue() {
  const navigate = useNavigate();
  const queue = useStore((s) => s.validationQueue());
  const projects = useStore((s) => s.projects);
  const projName = (id: string) => projects.find((p) => p.id === id)?.name ?? id;

  return (
    <div>
      <PageHeader title="Validation Queue" subtitle="PDDs awaiting validation by the VVB before a project can be registered" />
      <Card>
        {queue.length === 0 ? (
          <EmptyState title="Queue is empty" hint="No PDDs are currently awaiting validation." />
        ) : (
          <Table>
            <THead>
              <TR><TH>PDD</TH><TH>Project</TH><TH>Methodology</TH><TH>State</TH><TH>Submitted</TH><TH>Validator</TH></TR>
            </THead>
            <tbody>
              {queue.map((p) => (
                <TR key={p.id} hover>
                  <TD className="font-mono text-sm"><button className="text-brand-700 hover:underline" onClick={() => navigate(`/validation/${p.id}`)}>{p.id}</button></TD>
                  <TD className="font-medium">{projName(p.project_id)}</TD>
                  <TD>{p.methodology_snapshot || '—'}</TD>
                  <TD><PddStatusBadge state={p.state} /></TD>
                  <TD>{p.submitted_at ? fmtDate(p.submitted_at.slice(0, 10)) : '—'}</TD>
                  <TD>{p.assigned_validator_name}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
