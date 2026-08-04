import { Coins, ExternalLink, Gem } from 'lucide-react';
import { Card, CardBody, CardHeader } from '../ui/Card';
import { EmptyState } from '../ui/EmptyState';
import { useStore } from '../../store';
import { formatNumber } from '../../lib/format';
import { fmtDate } from '../../lib/date';
import type { UUID } from '../../types';

/**
 * The project developer's credit ledger: every batch minted for this project,
 * with the Verra-style serial range and on-chain links. Ownership follows the
 * registry-account model — batches are recorded against the project; the
 * on-chain tokens sit in the platform treasury until transferred/retired.
 */
export function ProjectCreditsTab({ projectId }: { projectId: UUID }) {
  const tokens = useStore((s) => s.tokens.filter((t) => t.project_id === projectId));
  const total = tokens.reduce((sum, t) => sum + t.amount_tco2e, 0);

  if (tokens.length === 0) {
    return (
      <Card>
        <CardBody className="p-0">
          <EmptyState
            icon={<Gem size={32} />}
            title="ยังไม่มีเครดิตที่ออกให้โปรเจกต์นี้"
            hint="เครดิตจะปรากฏที่นี่หลัง verification ผ่านและนายทะเบียนกด Mint — ดูสถานะได้ที่หน้า Verifications"
          />
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="border-brand-200 bg-brand-50/60">
        <CardBody className="flex flex-wrap items-center gap-x-8 gap-y-2 py-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-brand-700">เครดิตสะสมของโปรเจกต์</div>
            <div className="mt-0.5 text-2xl font-bold text-ink-900">{formatNumber(total, 2)} <span className="text-base font-medium text-ink-500">tCO₂e</span></div>
          </div>
          <div className="text-[12px] leading-relaxed text-ink-500">
            {tokens.length} batch · บันทึกในทะเบียนใต้ชื่อโปรเจกต์ (แบบบัญชี registry)<br />
            token บน chain อยู่ที่ treasury ของแพลตฟอร์มจนกว่าจะโอน/retire
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={`Batches (${tokens.length})`} action={<Coins size={16} className="text-ink-300" />} />
        <CardBody className="p-0">
          <ul className="divide-y divide-ink-100">
            {tokens.map((t) => {
              const batch = (t.batch ?? null) as {
                serial_start?: number; serial_end?: number;
                erc1155?: { address?: string; id?: number; tx_hash?: string } | null;
              } | null;
              const erc = batch?.erc1155;
              return (
                <li key={t.id} className="px-5 py-3.5">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span className="text-base font-bold text-ink-900">{formatNumber(t.amount_tco2e, 2)} tCO₂e</span>
                    <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[11px] font-medium text-ink-600">batch #{t.serial_number}</span>
                    <span className="text-[12px] text-ink-500">{fmtDate(t.monitoring_period_start)} – {fmtDate(t.monitoring_period_end)}</span>
                    <span className="ml-auto text-[11px] text-ink-400">minted {fmtDate(t.minted_at)}</span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] text-ink-500">
                    {batch?.serial_start !== undefined && (
                      <span>serials {batch.serial_start!.toLocaleString()}–{batch.serial_end!.toLocaleString()}</span>
                    )}
                    <a className="inline-flex items-center gap-1 text-brand-600 hover:underline"
                      href={`https://hashscan.io/testnet/token/${t.token_id}`} target="_blank" rel="noreferrer">
                      HTS {t.token_id} <ExternalLink size={11} />
                    </a>
                    {erc?.address && (
                      <a className="inline-flex items-center gap-1 text-brand-600 hover:underline"
                        href={`https://hashscan.io/testnet/contract/${erc.address}`} target="_blank" rel="noreferrer">
                        ERC-1155 id {erc.id} <ExternalLink size={11} />
                      </a>
                    )}
                    <span className="truncate text-ink-400">VC {t.credential_id}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}
