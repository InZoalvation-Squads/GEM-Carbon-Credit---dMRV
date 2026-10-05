import { createPortal } from 'react-dom';
import { ReactNode, useId, useRef } from 'react';
import { X } from 'lucide-react';
import { useDialogFocus } from '../ui/useDialogFocus';
const SIZES = { md: 'max-w-md', lg: 'max-w-2xl', xl: 'max-w-4xl' } as const;
interface Props { open: boolean; onClose: () => void; title: string; children: ReactNode; size?: keyof typeof SIZES; }
export function Drawer({ open, onClose, title, children, size = 'md' }: Props) {
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);
  useDialogFocus(ref, open, onClose);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-ink-950/50 backdrop-blur-[2px] animate-fade-in" onClick={onClose} aria-hidden />
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}
        className={`absolute right-0 top-0 h-full w-full ${SIZES[size]} bg-white shadow-xl ring-1 ring-ink-900/5 overflow-y-auto animate-slide-in-right`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-ink-100 sticky top-0 bg-white/90 backdrop-blur z-10">
          <h2 id={titleId} className="text-base font-semibold text-ink-900">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-900"><X size={18} aria-hidden /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>, document.body,
  );
}
