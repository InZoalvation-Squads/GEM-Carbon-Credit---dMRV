import { useEffect, useState } from 'react';
import { ExternalLink, ShieldCheck, ShieldX, LoaderCircle, Copy } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { sha256HexBytes } from '../../lib/hash';

/** Kubo gateway serving our pinned content (override via VITE_IPFS_GATEWAY). */
export function ipfsGatewayUrl(cid: string): string {
  const base = String(import.meta.env.VITE_IPFS_GATEWAY ?? 'http://127.0.0.1:8080').replace(/\/+$/, '');
  return `${base}/ipfs/${cid}`;
}

type LoadState =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; pretty: string; computedHash: string; bytes: number };

/**
 * Fetches the frozen PDD document straight from IPFS, pretty-prints the JSON
 * and re-computes its SHA-256 against the hash frozen at registration — the
 * same tamper check an outside auditor would run, one click instead.
 */
export function IpfsJsonModal({ cid, expectedHash, onClose }: {
  cid: string;
  /** content_hash frozen at register (`sha256-…`); null = show without verdict. */
  expectedHash: string | null;
  onClose: () => void;
}) {
  const [state, setState] = useState<LoadState>({ phase: 'loading' });

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const res = await fetch(ipfsGatewayUrl(cid), { signal: AbortSignal.timeout(15000) });
        if (!res.ok) throw new Error(`gateway ${res.status}`);
        const bytes = new Uint8Array(await res.arrayBuffer());
        if (!alive) return;
        const computedHash = `sha256-${sha256HexBytes(bytes)}`;
        const text = new TextDecoder().decode(bytes);
        let pretty = text;
        try { pretty = JSON.stringify(JSON.parse(text), null, 2); } catch { /* not JSON — show raw */ }
        setState({ phase: 'ready', pretty, computedHash, bytes: bytes.length });
      } catch (err) {
        if (alive) setState({ phase: 'error', message: err instanceof Error ? err.message : 'fetch failed' });
      }
    })();
    return () => { alive = false; };
  }, [cid]);

  const verified = state.phase === 'ready' && expectedHash !== null ? state.computedHash === expectedHash : null;

  return (
    <Modal open onClose={onClose} title="เอกสารบน IPFS" size="lg">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 font-mono text-xs text-ink-meta">
          <span className="truncate">CID: {cid}</span>
          <a href={ipfsGatewayUrl(cid)} target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-1 text-brand-700 hover:underline">
            เปิดไฟล์ดิบ <ExternalLink size={11} />
          </a>
        </div>

        {state.phase === 'loading' && (
          <div className="flex items-center gap-2 rounded-sheet bg-ground px-4 py-6 text-sm text-ink-meta">
            <LoaderCircle size={16} className="animate-spin" /> กำลังดึงไฟล์จาก IPFS…
          </div>
        )}

        {state.phase === 'error' && (
          <div className="rounded-sheet bg-state-rejected/5 px-4 py-3 text-sm text-state-rejected">
            ดึงไฟล์ไม่สำเร็จ ({state.message}) — IPFS node (พอร์ต 8080) ต้องออนไลน์อยู่
          </div>
        )}

        {state.phase === 'ready' && (
          <>
            {verified !== null && (
              <div
                data-testid="ipfs-verdict"
                className={`flex items-start gap-2 rounded-sheet px-4 py-3 text-sm ${
                  verified ? 'bg-brand-50 text-brand-700' : 'bg-state-rejected/5 text-state-rejected'
                }`}
              >
                {verified ? <ShieldCheck size={18} className="mt-0.5 shrink-0" /> : <ShieldX size={18} className="mt-0.5 shrink-0" />}
                <span>
                  {verified
                    ? 'ตรวจแล้ว: SHA-256 ของไฟล์นี้ตรงกับ hash ที่ freeze ตอน register — เอกสารไม่เคยถูกแก้'
                    : 'คำเตือน: hash ของไฟล์ไม่ตรงกับที่ freeze ไว้ — เอกสารอาจถูกแก้ไข!'}
                  <span className="mt-1 block break-all font-mono text-xs">
                    คำนวณได้: {state.computedHash}
                  </span>
                </span>
              </div>
            )}
            <pre className="max-h-80 overflow-auto rounded-sheet bg-surface-sunk p-4 text-xs leading-relaxed text-ink-secondary">
              {state.pretty}
            </pre>
            <div className="flex items-center justify-between text-xs text-ink-meta">
              <span>{state.bytes.toLocaleString()} bytes</span>
              <Button variant="ghost" size="sm" onClick={() => void navigator.clipboard.writeText(state.pretty)}>
                <Copy size={13} /> คัดลอก JSON
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
