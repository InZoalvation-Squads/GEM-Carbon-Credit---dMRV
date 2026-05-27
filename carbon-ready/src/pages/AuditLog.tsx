import { useState } from 'react';
import { Card, CardBody } from '../components/Card';
import { Table, THead, TR, TH, TD } from '../components/Table';
import { Badge } from '../components/Badge';
import { Select } from '../components/Select';
import { Input } from '../components/Input';
import { PageHeader } from '../components/PageHeader';
import { useStore } from '../store';
import { fmtDateTime } from '../lib/date';
import type { AuditAction, EntityType } from '../types';

const ACTIONS: AuditAction[] = ['PROJECT_CREATED', 'PROJECT_UPDATED', 'CSV_UPLOADED', 'CALCULATION_EXECUTED', 'EMISSION_FACTOR_ADDED'];
const ENTITIES: EntityType[] = ['project', 'monitoring', 'factor', 'calculation'];

export function AuditLogPage() {
  const audit = useStore((s) => s.audit);
  const user = useStore((s) => s.currentUser);
  const [action, setAction] = useState<'' | AuditAction>('');
  const [entity, setEntity] = useState<'' | EntityType>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const filtered = audit.filter((a) => {
    if (action && a.action !== action) return false;
    if (entity && a.entity_type !== entity) return false;
    if (from && a.created_at < from) return false;
    if (to && a.created_at > to + 'T23:59:59Z') return false;
    return true;
  });

  return (
    <div>
      <PageHeader title="Audit Log" subtitle="Append-only chronological record of state changes. Ready for Hedera Consensus Service anchoring in Sprint 3." />

      <Card className="mb-4 p-4 grid grid-cols-1 sm:grid-cols-4 gap-3">
        <Select label="Action" value={action} onChange={(e) => setAction(e.target.value as AuditAction | '')}>
          <option value="">All actions</option>
          {ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
        </Select>
        <Select label="Entity" value={entity} onChange={(e) => setEntity(e.target.value as EntityType | '')}>
          <option value="">All entities</option>
          {ENTITIES.map((e) => <option key={e} value={e}>{e}</option>)}
        </Select>
        <Input label="From" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <Input label="To" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
      </Card>

      <Card>
        <CardBody className="p-0">
          <Table>
            <THead><TR><TH>Timestamp</TH><TH>User</TH><TH>Action</TH><TH>Entity</TH><TH>Payload</TH></TR></THead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={5} className="px-5 py-8 text-center text-ink-500">No matching entries</td></tr>
              )}
              {filtered.map((a) => (
                <TR key={a.id}>
                  <TD className="whitespace-nowrap text-xs text-ink-500">{fmtDateTime(a.created_at)}</TD>
                  <TD>{user.id === a.user_id ? user.name : a.user_id}</TD>
                  <TD><Badge tone={actionTone(a.action)}>{a.action}</Badge></TD>
                  <TD className="text-ink-500">{a.entity_type}</TD>
                  <TD><pre className="text-xs whitespace-pre-wrap break-all max-w-md text-ink-500">{JSON.stringify(a.payload)}</pre></TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </CardBody>
      </Card>
    </div>
  );
}

function actionTone(a: AuditAction) {
  switch (a) {
    case 'PROJECT_CREATED': return 'green' as const;
    case 'PROJECT_UPDATED': return 'blue' as const;
    case 'CSV_UPLOADED': return 'blue' as const;
    case 'CALCULATION_EXECUTED': return 'amber' as const;
    case 'EMISSION_FACTOR_ADDED': return 'gray' as const;
  }
}
