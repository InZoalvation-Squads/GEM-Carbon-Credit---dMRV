import { useMemo, useState } from 'react';
import { ShieldCheck, FileJson, ExternalLink, Coins, GitBranch, Check } from 'lucide-react';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { Table, THead, TR, TH, TD } from '../components/ui/Table';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { PageHeader } from '../components/layout/PageHeader';
import { EmptyState } from '../components/ui/EmptyState';
import { useStore } from '../store';
import { serverMode } from '../lib/server-api';
import { MRV_APPROVAL_SCHEMA_V1 } from '../lib/guardian-schema';
import { verifyCredential, type VcVerdict } from '../lib/vc';
import { issuerIdentity } from '../lib/identity';
import { fmtDateTime } from '../lib/date';
import { formatNumber } from '../lib/format';
import { displayHcs } from '../lib/guardian';
import { api } from '../lib/api';
import type { GuardianToken, VerifiableCredential } from '../types';
import clsx from 'clsx';

type Tab = 'schema' | 'registry' | 'tokens' | 'trust';

export function Guardian() {
  const credentials = useStore((s) => s.credentials);
  const tokens = useStore((s) => s.tokens);
  const config = useStore((s) => s.guardianConfig);
  const organization = useStore((s) => s.organization);
  const verifications = useStore((s) => s.verifications);
  const role = useStore((s) => s.currentUser.role);

  const [tab, setTab] = useState<Tab>('schema');

  const isRegistry = role === 'admin'; // Standard Registry
  const mintedFor = (credentialId: string) => tokens.find((t) => t.credential_id === credentialId);

  const TABS: [Tab, string, number?][] = [
    ['schema', 'Schema'],
    ['registry', 'Credential Registry', credentials.length],
    ['tokens', 'Token History', tokens.length],
    ['trust', 'Trust Chain'],
  ];

  return (
    <div>
      <PageHeader
        title="Guardian"
        subtitle={serverMode()
          ? 'Credential schema, issued credentials, minted VCU tokens and their trust chain — anchored live on Hedera testnet.'
          : 'Credential schema, issued credentials, minted VCU tokens and their trust chain. Simulated — not a live Hedera connection.'}
      />

      <Card className="mb-4 border-brand-200 bg-brand-50">
        <CardBody className="flex flex-wrap items-center gap-x-6 gap-y-1 py-3 text-sm">
          <span className="flex items-center gap-2 font-medium text-brand-800">
            <ShieldCheck size={16} /> {serverMode() ? 'Hedera ⛓ live' : 'Guardian (mock)'}
          </span>
          <span className="text-brand-700">Network: <strong>{config.network}</strong></span>
          {serverMode() ? (
            <>
              {/* Tokens are minted per project — the treasury account page lists them all. */}
              <a className="font-mono text-xs text-brand-700 underline" href="https://hashscan.io/testnet/account/0.0.9651712" target="_blank" rel="noreferrer">Treasury 0.0.9651712</a>
              <a className="font-mono text-xs text-brand-700 underline" href="https://hashscan.io/testnet/contract/0xEF87e486b77D6ed63BE632a731b73aE1225F1130" target="_blank" rel="noreferrer">ERC-1155 0xEF87…1130</a>
            </>
          ) : (
            <>
              <span className="text-brand-700 font-mono text-xs">Topic {config.topic_id}</span>
              <span className="text-brand-700 font-mono text-xs truncate">{issuerIdentity(organization.id).did}</span>
            </>
          )}
        </CardBody>
      </Card>

      <div className="mb-4 flex items-center gap-1 border-b border-ink-200">
        {TABS.map(([key, label, count]) => (
          <button key={key} onClick={() => setTab(key)}
            className={clsx('relative px-4 py-2.5 text-sm font-medium transition-colors', tab === key ? 'text-brand-700' : 'text-ink-500 hover:text-ink-900')}>
            {label}
            {count != null && count > 0 && <span className="ml-1.5 rounded-full bg-ink-100 px-1.5 py-0.5 text-[11px] text-ink-600">{count}</span>}
            {tab === key && <span className="absolute inset-x-0 -bottom-px h-0.5 bg-brand-600" />}
          </button>
        ))}
      </div>

      {tab === 'schema' && <SchemaTab />}
      {tab === 'registry' && (
        <RegistryTab
          credentials={credentials}
          verifications={verifications}
          isRegistry={isRegistry}
          mintedFor={mintedFor}
          onMint={(id) => void api.mintToken(id)}
        />
      )}
      {tab === 'tokens' && <TokenHistoryTab tokens={tokens} />}
      {tab === 'trust' && <TrustChainTab />}
    </div>
  );
}

function SchemaTab() {
  return (
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
  );
}

function RegistryTab({ credentials, verifications, isRegistry, mintedFor, onMint }: {
  credentials: VerifiableCredential[];
  verifications: ReturnType<typeof useStore.getState>['verifications'];
  isRegistry: boolean;
  mintedFor: (credentialId: string) => GuardianToken | undefined;
  onMint: (credentialId: string) => void;
}) {
  const projects = useStore((s) => s.projects);
  const projectName = (id: string) => projects.find((p) => p.id === id)?.name ?? id;
  // Offline Ed25519 check per credential — verdict appears in place of the button.
  // Auto-verify every credential on render (and on every poll refresh):
  // the verdict is derived state, not something the user should have to
  // click for — and it can never go stale or reset.
  const verdicts = useMemo<Record<string, VcVerdict>>(() => {
    const out: Record<string, VcVerdict> = {};
    for (const c of credentials) out[c.id] = verifyCredential(c);
    return out;
  }, [credentials]);
  if (credentials.length === 0) {
    return (
      <Card><CardBody className="p-0">
        <EmptyState icon={<ShieldCheck size={32} />} title="No credentials anchored yet" hint="Approve a verification package, then click Anchor to Hedera Guardian on its review page." />
      </CardBody></Card>
    );
  }
  return (
    <Card><CardBody className="p-0">
      <Table>
        <THead><TR><TH>Credential</TH><TH>Project</TH><TH className="text-right">Reduction</TH><TH>HCS</TH><TH>Anchored</TH><TH>Signature</TH><TH className="text-right">VCU</TH></TR></THead>
        <tbody>
          {credentials.map((c) => {
            const v = verifications.find((x) => x.id === (c.subject.verification_id as string));
            const token = mintedFor(c.id);
            const pid = v?.project_id ?? (c.subject.project_id as string);
            return (
              <TR key={c.id}>
                <TD className="font-mono text-xs text-ink-900">{c.id}</TD>
                <TD>
                  <div className="text-ink-700">{projectName(pid)}</div>
                  <div className="font-mono text-[11px] text-ink-400">{pid}</div>
                </TD>
                <TD className="text-right">{Number.isFinite(Number(c.subject.reduction_tco2e)) ? `${formatNumber(Number(c.subject.reduction_tco2e), 2)} tCO₂e` : '—'}</TD>
                <TD className="font-mono text-xs text-ink-500">{displayHcs(c).topic_id} · #{displayHcs(c).sequence_number}{displayHcs(c).real ? ' ⛓' : ''}</TD>
                <TD className="whitespace-nowrap text-xs text-ink-500">{fmtDateTime(c.issued_at)}</TD>
                <TD>
                  {verdicts[c.id] === 'valid' ? (
                    <Badge tone="green" dot>Signature valid (Ed25519)</Badge>
                  ) : verdicts[c.id] === 'invalid' ? (
                    <Badge tone="red" dot>Signature INVALID</Badge>
                  ) : (
                    <Badge tone="gray">Unsigned (seed data)</Badge>
                  )}
                </TD>
                <TD className="text-right">
                  {token ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-brand-700"><Check size={13} /> Minted #{token.serial_number}</span>
                  ) : c.schema_id !== 'mrv-approval-v1' ? (
                    // Only MRV approval credentials carry a tCO₂e claim to mint;
                    // PDD registration credentials are records, not issuance events.
                    <span className="text-xs text-ink-400">—</span>
                  ) : isRegistry ? (
                    <Button variant="secondary" onClick={() => onMint(c.id)}><Coins size={14} /> Mint VCU</Button>
                  ) : (
                    <span className="text-xs text-ink-400">Not minted</span>
                  )}
                </TD>
              </TR>
            );
          })}
        </tbody>
      </Table>
    </CardBody></Card>
  );
}

function TokenHistoryTab({ tokens }: { tokens: GuardianToken[] }) {
  const projects = useStore((s) => s.projects);
  const projectName = (id: string) => projects.find((p) => p.id === id)?.name ?? id;
  if (tokens.length === 0) {
    return (
      <Card><CardBody className="p-0">
        <EmptyState icon={<Coins size={32} />} title="No VCU tokens minted yet" hint="As the Standard Registry, mint a token from the Credential Registry tab." />
      </CardBody></Card>
    );
  }
  return (
    <Card><CardBody className="p-0">
      <Table>
        <THead><TR><TH>Serial</TH><TH>Token</TH><TH>Project</TH><TH className="text-right">Amount</TH><TH>Minted</TH><TH className="text-right"><span className="sr-only">Explorer</span></TH></TR></THead>
        <tbody>
          {tokens.map((t) => (
            <TR key={t.id}>
              <TD className="font-mono text-xs text-ink-900">#{t.serial_number}</TD>
              <TD className="font-mono text-xs text-ink-500">{t.token_id}</TD>
              <TD>
                <div className="text-ink-700">{projectName(t.project_id)}</div>
                <div className="font-mono text-[11px] text-ink-400">{t.project_id}</div>
              </TD>
              <TD className="text-right font-medium">{formatNumber(t.amount_tco2e, 2)} tCO₂e</TD>
              <TD className="whitespace-nowrap text-xs text-ink-500">{fmtDateTime(t.minted_at)}</TD>
              {/* Server-minted rows store the project TOPIC as explorer_url — link the token page itself. */}
              <TD className="text-right"><a className="inline-flex items-center gap-1 text-brand-700 hover:underline text-xs" href={`https://hashscan.io/testnet/token/${t.token_id}`} target="_blank" rel="noreferrer">HashScan <ExternalLink size={12} /></a></TD>
            </TR>
          ))}
        </tbody>
      </Table>
    </CardBody></Card>
  );
}

interface ChainStep { label: string; detail: string; at: string | null; }

function TrustChainTab() {
  const tokens = useStore((s) => s.tokens);
  const credentials = useStore((s) => s.credentials);
  const verifications = useStore((s) => s.verifications);
  const pdds = useStore((s) => s.pdds);
  const projects = useStore((s) => s.projects);
  const projectName = (id: string) => projects.find((p) => p.id === id)?.name ?? id;
  const [selectedId, setSelectedId] = useState<string>(tokens[0]?.id ?? '');

  if (tokens.length === 0) {
    return (
      <Card><CardBody className="p-0">
        <EmptyState icon={<GitBranch size={32} />} title="No trust chain to show yet" hint="Mint a VCU token to see its full evidence chain here." />
      </CardBody></Card>
    );
  }

  const token = tokens.find((t) => t.id === selectedId) ?? tokens[0];
  const credential = credentials.find((c) => c.id === token.credential_id);
  const verification = verifications.find((v) => v.id === (credential?.subject.verification_id as string));
  const pdd = pdds.find((p) => p.project_id === token.project_id);
  const pddCredential = credentials.find((c) => c.id === pdd?.credential_id);

  // Chronological lifecycle: PDD registered → verification approved → credential issued → token minted.
  const steps: ChainStep[] = [
    { label: 'PDD registered', detail: pdd
        ? `${pdd.id} · ${pdd.methodology_snapshot}${pddCredential ? ` · VC ${pddCredential.id} · HCS ${displayHcs(pddCredential).topic_id} #${displayHcs(pddCredential).sequence_number}` : ''}${pdd.ipfs_cid ? ` · ipfs ${pdd.ipfs_cid}` : ''}`
        : '—', at: pdd?.validated_at ?? null },
    { label: 'Verification approved', detail: verification ? `${verification.id} · ${verification.monitoring_period_start} → ${verification.monitoring_period_end}` : '—', at: verification?.locked_at ?? null },
    { label: 'Credential issued', detail: credential ? `${credential.id} · HCS ${displayHcs(credential).topic_id} #${displayHcs(credential).sequence_number}` : '—', at: credential?.issued_at ?? null },
    { label: 'Token minted', detail: `${token.token_id} · serial #${token.serial_number} · ${formatNumber(token.amount_tco2e, 2)} tCO₂e`, at: token.minted_at },
  ];

  return (
    <Card>
      <CardHeader title={<span className="flex items-center gap-2"><GitBranch size={16} /> Trust Chain</span>} />
      <CardBody className="space-y-5">
        <label className="block max-w-sm">
          <span className="mb-1 block text-[13px] font-medium text-ink-700">Token</span>
          <select value={token.id} onChange={(e) => setSelectedId(e.target.value)}
            className="w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm">
            {tokens.map((t) => <option key={t.id} value={t.id}>#{t.serial_number} · {projectName(t.project_id)} · {formatNumber(t.amount_tco2e, 2)} tCO₂e</option>)}
          </select>
        </label>

        <ol className="relative space-y-0 border-l-2 border-ink-100 pl-6">
          {steps.map((s, i) => (
            <li key={i} className="relative pb-6 last:pb-0">
              <span className="absolute -left-[31px] grid h-5 w-5 place-items-center rounded-full bg-brand-600 text-white ring-4 ring-white">
                <Check size={12} />
              </span>
              <div className="text-sm font-semibold text-ink-900">{s.label}</div>
              <div className="mt-0.5 font-mono text-xs text-ink-600">{s.detail}</div>
              {s.at && <div className="mt-0.5 text-xs text-ink-400">{fmtDateTime(s.at)}</div>}
            </li>
          ))}
        </ol>
      </CardBody>
    </Card>
  );
}
