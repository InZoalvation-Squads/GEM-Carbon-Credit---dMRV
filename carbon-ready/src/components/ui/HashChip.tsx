import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

/**
 * Long technical identifier (hash / CID / credential URN) — middle-truncated
 * so it never blows out the layout, full value on hover, click to copy.
 */
export function HashChip({ value, className }: { value: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const short = value.length > 24 ? `${value.slice(0, 14)}…${value.slice(-6)}` : value;
  return (
    <button
      type="button"
      title={value}
      onClick={() => {
        void navigator.clipboard?.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className={`inline-flex max-w-full items-center gap-1 rounded-md bg-ink-50 px-1.5 py-0.5 font-mono text-[11px] text-ink-600 transition-colors hover:bg-ink-100 ${className ?? ''}`}
    >
      <span className="truncate">{short}</span>
      {copied
        ? <Check size={11} aria-hidden className="shrink-0 text-brand-600" />
        : <Copy size={11} aria-hidden className="shrink-0 text-ink-400" />}
    </button>
  );
}
