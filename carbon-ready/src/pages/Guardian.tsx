import { useState } from 'react';
import { ShieldCheck, FileJson, ExternalLink } from 'lucide-react';
import { Card, CardBody, CardHeader } from '../components/Card';
import { Table, THead, TR, TH, TD } from '../components/Table';
import { Badge } from '../components/Badge';
import { PageHeader } from '../components/PageHeader';
import { EmptyState } from '../components/EmptyState';
import { useStore } from '../store';
import { MRV_APPROVAL_SCHEMA_V1 } from '../lib/guardian-schema';
import { fmtDateTime } from '../lib/date';
import { formatNumber } from '../lib/format';
import clsx from 'clsx';

type Tab = 'schema' | 'registry';

export function Guardian() {
  const credentials = useStore((s) => s.credentials);
  const config = useStore((s) => s.guardianConfig);
  const verifications = useStore((s) => s.verifications);
  const [tab, setTab] = useState<Tab>('schema');

  return (
    <div>
      <PageHeader title="Guardian" subtitle="Credential schema and the registry of anchored verification results. Simulated — not a live Hedera connection." />

      <Card className="mb-4 border-brand-200 bg-brand-50">
        <CardBody className="flex flex-wrap items-center gap-x-6 gap-y-1 py-3 text-sm">
          <span className="flex items-center gap-2 font-medium text-brand-800"><ShieldCheck size={16} /> Guardian (mock)</span>
          <span className="text-brand-700">Network: <strong>{config.network}</strong></span>
          <span className="text-brand-700 font-mono text-xs">Topic {config.topic_id}</span>
          <span className="text-brand-700 font-mono text-xs truncate">{config.issuer_did}</span>
        </CardBody>
      </Card>

      <div className="mb-4 flex items-center gap-1 border-b border-ink-200">
        {([['schema', 'Schema'], ['registry', 'Credential Registry']] as [Tab, string][]).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={clsx('relative px-4 py-2.5 text-sm font-medium transition-colors', tab === key ? 'text-brand-700' : 'text-ink-500 hover:text-ink-900')}>
            {label}
            {key === 'registry' && credentials.length > 0 && <span className="ml-1.5 rounded-full bg-ink-100 px-1.5 py-0.5 text-[11px] text-ink-600">{credentials.length}</span>}
            {tab === key && <span className="absolute inset-x-0 -bottom-px h-0.5 bg-brand-600" />}
          </button>
        ))}
      </div>

      {tab === 'schema' ? (
        <Card>
          <CardHeader title={<span className="flex items-center gap-2"><FileJson size={16} /> {MRV_APPROVAL_SCHEMA_V1.name} <Badge tone="gray">v{MRV_APPROVAL_SCHEMA_V1.version}</Badge></span>} />
          <CardBody className="p-0">
            <Table>
              <THead><TR><TH>Property</TH><TH>Type</TH><TH>Description</TH></TR></THead>
              <tbody>
                {MRV_APPROVAL_SCHEMA_V1.properties.map((p) => (
                  <TR key={p.key}>
                    <TD className="font-mono text-xs text-ink-900">{p.key}</TD>
                    <TD><Badge tone="blue">{p.type}</Badge></TD>
                    <TD className="text-ink-500">{p.description}</TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          </CardBody>
        </Card>
      ) : (
        <Card>
          <CardBody className="p-0">
            {credentials.length === 0 ? (
              <EmptyState icon={<ShieldCheck size={32} />} title="No credentials anchored yet" hint="Approve a verification package, then click Anchor to Hedera Guardian on its review page." />
            ) : (
              <Table>
                <THead><TR><TH>Credential</TH><TH>Project</TH><TH className="text-right">Reduction</TH><TH>HCS</TH><TH>Anchored</TH><TH><span className="sr-only">Explorer</span></TH></TR></THead>
                <tbody>
                  {credentials.map((c) => {
                    const v = verifications.find((x) => x.id === (c.subject.verification_id as string));
                    return (
                      <TR key={c.id}>
                        <TD className="font-mono text-xs text-ink-900">{c.id}</TD>
                        <TD className="text-ink-700">{v?.project_id ?? (c.subject.project_id as string)}</TD>
                        <TD className="text-right">{formatNumber(Number(c.subject.reduction_tco2e), 2)} tCO₂e</TD>
                        <TD className="font-mono text-xs text-ink-500">{c.hcs.topic_id} · #{c.hcs.sequence_number}</TD>
                        <TD className="whitespace-nowrap text-xs text-ink-500">{fmtDateTime(c.issued_at)}</TD>
                        <TD><a className="inline-flex items-center gap-1 text-brand-700 hover:underline text-xs" href={c.hcs.explorer_url} target="_blank" rel="noreferrer">HashScan <ExternalLink size={12} /></a></TD>
                      </TR>
                    );
                  })}
                </tbody>
              </Table>
            )}
          </CardBody>
        </Card>
      )}
    </div>
  );
}
