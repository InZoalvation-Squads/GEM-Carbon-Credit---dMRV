import { useDeferredValue, useMemo, useState } from 'react';
import { Link2, ShieldAlert } from 'lucide-react';
import { Card, CardBody } from '../components/ui/Card';
import { BlockRow, ChainList } from '../components/ui/BlockRow';
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
        return a.entity_id ? projectName(a.entity_id) ?? null : null;
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

  const deferredAction = useDeferredValue(action);
  const deferredEntity = useDeferredValue(entity);
  const deferredFrom = useDeferredValue(from);
  const deferredTo = useDeferredValue(to);
  const filtered = useMemo(() => audit.filter((a) => {
    if (deferredAction && a.action !== deferredAction) return false;
    if (deferredEntity && a.entity_type !== deferredEntity) return false;
    if (deferredFrom && a.created_at < deferredFrom) return false;
    if (deferredTo && a.created_at > deferredTo + 'T23:59:59Z') return false;
    return true;
  }), [audit, deferredAction, deferredEntity, deferredFrom, deferredTo]);

  return (
    <div>
      <PageHeader title="Audit Log" subtitle="Append-only, tamper-evident record of state changes. Each row is hash-chained to the previous one, ready for Hedera Consensus Service anchoring in Sprint 3." />

      <Card className={'mb-4 ' + (integrity.ok ? 'border-rule bg-surface' : 'border-state-rejected/30 bg-state-rejected/5')}>
        <CardBody className="flex items-center gap-3 py-3">
          {integrity.ok ? <Link2 size={18} className="text-brand-700" /> : <ShieldAlert size={18} className="text-state-rejected" />}
          <div className="text-sm">
            {integrity.ok ? (
              <><span className="font-semibold text-brand-700">Hash chain verified</span><span className="text-brand-700"> · {integrity.checked} rows checked · SHA-256 linked</span></>
            ) : (
              <><span className="font-semibold text-state-rejected">Hash chain broken</span><span className="text-state-rejected"> · tampering detected after {integrity.checked} rows</span></>
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

      {filtered.length ? <ChainList>{filtered.map((a) => {
        const name = entityName(a);
        return <BlockRow key={a.id} blockId={a.id} hash={a.row_hash ?? undefined}
          state={a.hcs_sequence_number != null ? 'anchored' : integrity.ok && a.row_hash ? 'verified' : 'draft'}
          statusLabel={a.hcs_sequence_number != null ? 'Anchored' : integrity.ok && a.row_hash ? 'Verified' : '—'}
          figure={ACTION_LABEL[a.action] ?? a.action}
          source={<><span className="font-mono text-xs">{fmtDateTime(a.created_at)}</span> · {a.user_role ? ROLE_LABEL[a.user_role] : (user.id === a.user_id ? user.name : '—')} · {ENTITY_LABEL[a.entity_type] ?? a.entity_type}{name && <> · <span>{name}</span></>}</>}>
          <div className="mt-3 border-t border-rule pt-3">
            {a.previous_value || a.new_value ? <Diff prev={a.previous_value} next={a.new_value} /> :
              <pre className="max-w-full whitespace-pre-wrap break-all text-xs text-ink-meta">{JSON.stringify(a.payload)}</pre>}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-ink-meta">
            <span>prev_row_hash</span>{a.prev_row_hash ? <HashChip value={a.prev_row_hash} /> : <span>—</span>}
            <span>→ row_hash</span>
          </div>
        </BlockRow>;
      })}</ChainList> : <Card><EmptyState illustration="/illustrations/empty-filter.webp" title="No matching entries" hint="Try widening the date range or clearing the action/entity filters." /></Card>}
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
            <span className="font-mono text-ink-meta">{k}</span>
            {b !== undefined && <span className={'font-mono ' + (changed ? 'text-state-rejected line-through' : 'text-ink-secondary')}>{fmt(b)}</span>}
            {changed && b !== undefined && a !== undefined && <span className="text-ink-meta">→</span>}
            {a !== undefined && <span className={'font-mono ' + (changed ? 'text-brand-700' : 'text-ink-secondary')}>{fmt(a)}</span>}
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
