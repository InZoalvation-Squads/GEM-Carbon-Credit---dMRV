import { useMemo, useState } from 'react';
import { ShieldCheck, ShieldAlert } from 'lucide-react';
import { Card, CardBody } from '../components/ui/Card';
import { Table, THead, TR, TH, TD } from '../components/ui/Table';
import { Badge } from '../components/ui/Badge';
import { Select } from '../components/ui/Select';
import { Input } from '../components/ui/Input';
import { PageHeader } from '../components/layout/PageHeader';
import { EmptyState } from '../components/ui/EmptyState';
import { HashChip } from '../components/ui/HashChip';
import { useStore } from '../store';
import { auditRowHash } from '../store/audit';
import { fmtDateTime } from '../lib/date';
import { ACTION_LABEL, ENTITY_LABEL, ROLE_LABEL } from '../lib/labels';
import type { AuditAction, AuditLog, EntityType } from '../types';

const ACTIONS: AuditAction[] = [
  'PROJECT_CREATED', 'PROJECT_UPDATED', 'CSV_UPLOADED', 'CALCULATION_EXECUTED', 'EMISSION_FACTOR_ADDED',
  'EVIDENCE_UPLOADED', 'EVIDENCE_REPLACED', 'EVIDENCE_ARCHIVED',
  'VERIFICATION_SUBMITTED', 'REVIEW_STARTED', 'COMMENT_ADDED', 'REVISION_REQUESTED',
  'VERIFICATION_APPROVED', 'VERIFICATION_REJECTED', 'VERIFICATION_ANCHORED',
  'METHODOLOGY_SELECTED', 'METHODOLOGY_IMPORTED', 'PDD_SUBMITTED', 'VALIDATION_STARTED',
  'PDD_REVISION_REQUESTED', 'PROJECT_REGISTERED', 'PDD_REJECTED', 'TOKEN_MINTED',
];
const ENTITIES: EntityType[] = ['project', 'monitoring', 'factor', 'calculation', 'evidence', 'verification', 'methodology', 'pdd', 'token'];

const TONE: Partial<Record<AuditAction, 'green' | 'amber' | 'red' | 'gray' | 'blue' | 'violet'>> = {
  PROJECT_CREATED: 'green',
  PROJECT_UPDATED: 'blue',
  CSV_UPLOADED: 'blue',
  CALCULATION_EXECUTED: 'amber',
  EMISSION_FACTOR_ADDED: 'gray',
  EVIDENCE_UPLOADED: 'blue',
  EVIDENCE_REPLACED: 'blue',
  EVIDENCE_ARCHIVED: 'amber',
  VERIFICATION_SUBMITTED: 'blue',
  REVIEW_STARTED: 'violet',
  COMMENT_ADDED: 'gray',
  REVISION_REQUESTED: 'amber',
  VERIFICATION_APPROVED: 'green',
  VERIFICATION_REJECTED: 'red',
  VERIFICATION_ANCHORED: 'green',
  METHODOLOGY_SELECTED: 'blue',
  METHODOLOGY_IMPORTED: 'blue',
  PDD_SUBMITTED: 'blue',
  VALIDATION_STARTED: 'violet',
  PDD_REVISION_REQUESTED: 'amber',
  PROJECT_REGISTERED: 'green',
  PDD_REJECTED: 'red',
  TOKEN_MINTED: 'green',
};

// Recompute the chain (oldest→newest) and confirm each row_hash matches.
function verifyChain(audit: AuditLog[]): { ok: boolean; checked: number } {
  const chrono = [...audit].reverse();
  let prev: string | null = null;
  let checked = 0;
  for (const a of chrono) {
    if (a.row_hash == null) { prev = a.row_hash ?? prev; continue; }
    const core = {
      user_id: a.user_id,
      user_role: a.user_role ?? null,
      action: a.action,
      entity_type: a.entity_type,
      entity_id: a.entity_id,
      previous_value: a.previous_value ?? null,
      new_value: a.new_value ?? null,
      ip_address: a.ip_address ?? null,
      created_at: a.created_at,
    };
    if (auditRowHash(prev, core) !== a.row_hash) return { ok: false, checked };
    prev = a.row_hash;
    checked++;
  }
  return { ok: true, checked };
}

export function AuditLogPage() {
  const audit = useStore((s) => s.audit);
  const user = useStore((s) => s.currentUser);
  const projects = useStore((s) => s.projects);
  const pdds = useStore((s) => s.pdds);
  const verifications = useStore((s) => s.verifications);
  const evidence = useStore((s) => s.evidence);
  const methodologies = useStore((s) => s.methodologies);
  const factors = useStore((s) => s.factors);
  const [action, setAction] = useState<'' | AuditAction>('');
  const [entity, setEntity] = useState<'' | EntityType>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  // Best-effort join entity_id → something a reviewer can recognise. Rows for
  // monitoring/calculation carry the PROJECT id as entity_id (see audit_write
  // call sites), so those resolve through the project list too.
  const projectName = (id: string) => projects.find((p) => p.id === id)?.name;
  function entityName(a: AuditLog): string | null {
    switch (a.entity_type) {
      case 'project':
      case 'monitoring':
      case 'calculation':
        return projectName(a.entity_id) ?? null;
      case 'pdd': {
        const pdd = pdds.find((p) => p.id === a.entity_id);
        return pdd ? projectName(pdd.project_id) ?? null : null;
      }
      case 'verification': {
        const v = verifications.find((x) => x.id === a.entity_id);
        return v ? projectName(v.project_id) ?? null : null;
      }
      case 'evidence':
        return evidence.find((e) => e.id === a.entity_id)?.file_name ?? null;
      case 'methodology':
        return methodologies.find((m) => m.id === a.entity_id)?.name ?? null;
      case 'factor': {
        const f = factors.find((x) => x.id === a.entity_id);
        return f ? `${f.country} · ${f.source} v${f.version}` : null;
      }
      default:
        return null;
    }
  }

  const integrity = useMemo(() => verifyChain(audit), [audit]);

  const filtered = audit.filter((a) => {
    if (action && a.action !== action) return false;
    if (entity && a.entity_type !== entity) return false;
    if (from && a.created_at < from) return false;
    if (to && a.created_at > to + 'T23:59:59Z') return false;
    return true;
  });

  return (
    <div>
      <PageHeader title="Audit Log" subtitle="Append-only, tamper-evident record of state changes. Each row is hash-chained to the previous one, ready for Hedera Consensus Service anchoring in Sprint 3." />

      <Card className={'mb-4 ' + (integrity.ok ? 'border-brand-200 bg-brand-50' : 'border-red-200 bg-red-50')}>
        <CardBody className="flex items-center gap-3 py-3">
          {integrity.ok ? <ShieldCheck size={18} className="text-brand-700" /> : <ShieldAlert size={18} className="text-red-600" />}
          <div className="text-sm">
            {integrity.ok ? (
              <><span className="font-semibold text-brand-800">Hash chain verified</span><span className="text-brand-700"> · {integrity.checked} rows checked · SHA-256 linked</span></>
            ) : (
              <><span className="font-semibold text-red-700">Hash chain broken</span><span className="text-red-600"> · tampering detected after {integrity.checked} rows</span></>
            )}
          </div>
        </CardBody>
      </Card>

      <Card className="mb-4 p-4 grid grid-cols-1 sm:grid-cols-4 gap-3">
        <Select label="Action" value={action} onChange={(e) => setAction(e.target.value as AuditAction | '')}>
          <option value="">All actions</option>
          {ACTIONS.map((a) => <option key={a} value={a}>{ACTION_LABEL[a]}</option>)}
        </Select>
        <Select label="Entity" value={entity} onChange={(e) => setEntity(e.target.value as EntityType | '')}>
          <option value="">All entities</option>
          {ENTITIES.map((e) => <option key={e} value={e}>{ENTITY_LABEL[e]}</option>)}
        </Select>
        <Input label="From" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <Input label="To" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
      </Card>

      <Card>
        <CardBody className="p-0">
          <Table>
            <THead><TR><TH>Timestamp</TH><TH>Role</TH><TH>Action</TH><TH>Entity</TH><TH>Change</TH><TH className="hidden lg:table-cell">row_hash</TH></TR></THead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="p-0">
                  <EmptyState title="No matching entries" hint="Try widening the date range or clearing the action/entity filters." />
                </td></tr>
              )}
              {filtered.map((a) => {
                const name = entityName(a);
                return (
                <TR key={a.id}>
                  <TD className="whitespace-nowrap text-xs text-ink-500">{fmtDateTime(a.created_at)}</TD>
                  <TD className="text-ink-600">{a.user_role ? ROLE_LABEL[a.user_role] : (user.id === a.user_id ? user.name : '—')}</TD>
                  <TD><Badge tone={TONE[a.action] ?? 'gray'}>{ACTION_LABEL[a.action] ?? a.action}</Badge></TD>
                  <TD>
                    <div className="text-[11px] uppercase tracking-wide text-ink-400">{ENTITY_LABEL[a.entity_type] ?? a.entity_type}</div>
                    {name && <div className="text-ink-700">{name}</div>}
                  </TD>
                  <TD>
                    {a.previous_value || a.new_value ? (
                      <Diff prev={a.previous_value} next={a.new_value} />
                    ) : (
                      <pre className="text-xs whitespace-pre-wrap break-all max-w-xs text-ink-500">{JSON.stringify(a.payload)}</pre>
                    )}
                  </TD>
                  <TD className="hidden lg:table-cell">{a.row_hash ? <HashChip value={a.row_hash} /> : <span className="text-ink-400">—</span>}</TD>
                </TR>
                );
              })}
            </tbody>
          </Table>
        </CardBody>
      </Card>
    </div>
  );
}

function Diff({ prev, next }: { prev?: Record<string, unknown> | null; next?: Record<string, unknown> | null }) {
  const keys = Array.from(new Set([...Object.keys(prev ?? {}), ...Object.keys(next ?? {})]));
  return (
    <div className="space-y-0.5 text-xs max-w-xs">
      {keys.map((k) => {
        const b = prev?.[k];
        const a = next?.[k];
        const changed = JSON.stringify(b) !== JSON.stringify(a);
        return (
          <div key={k} className="flex flex-wrap items-baseline gap-1.5">
            <span className="font-mono text-ink-400">{k}</span>
            {b !== undefined && <span className={'font-mono ' + (changed ? 'text-red-500 line-through' : 'text-ink-600')}>{fmt(b)}</span>}
            {changed && b !== undefined && a !== undefined && <span className="text-ink-300">→</span>}
            {a !== undefined && <span className={'font-mono ' + (changed ? 'text-brand-700' : 'text-ink-600')}>{fmt(a)}</span>}
          </div>
        );
      })}
    </div>
  );
}

function fmt(v: unknown): string {
  if (v === null) return '∅';
  if (typeof v === 'string') return v.length > 32 ? `"${v.slice(0, 32)}…"` : `"${v}"`;
  if (typeof v === 'number') return v.toLocaleString();
  return JSON.stringify(v);
}
