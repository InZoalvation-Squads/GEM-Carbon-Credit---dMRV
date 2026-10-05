import { ReactNode, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useDialogFocus } from './useDialogFocus';
const SIZES = { md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' } as const;
interface Props { open: boolean; onClose: () => void; title: string; size?: keyof typeof SIZES; children: ReactNode; }
export function Modal({ open, onClose, title, size = 'md', children }: Props) {
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);
  useDialogFocus(ref, open, onClose);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-petrol-950/50" onClick={onClose} aria-hidden />
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}
        className={`relative w-full ${SIZES[size]} rounded-sheet border border-rule bg-surface animate-scale-in`}>
        <div className="flex items-center justify-between border-b border-rule px-5 py-4">
          <h2 id={titleId} className="pr-3 text-base font-semibold text-ink">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-8 w-8 shrink-0 place-items-center rounded-sheet text-ink-secondary hover:bg-petrol-50"><X size={18} aria-hidden /></button>
        </div>
        <div className="max-h-[75vh] overflow-y-auto p-5">{children}</div>
      </div>
    </div>, document.body,
  );
}
