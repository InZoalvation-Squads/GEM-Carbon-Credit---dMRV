import { ReactNode, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

const SIZES = { md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' } as const;

interface Props { open: boolean; onClose: () => void; title: string; size?: keyof typeof SIZES; children: ReactNode; }
export function Modal({ open, onClose, title, size = 'md', children }: Props) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);
  if (!open) return null;
  // Portal to <body>: page wrappers carry a persistent CSS transform (the
  // fade-in-up route animation), which would turn position:fixed into
  // "fixed inside that container" and knock the dialog off-center.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-ink-950/50 backdrop-blur-[2px] animate-fade-in" onClick={onClose} />
      <div className={`relative w-full ${SIZES[size]} rounded-2xl bg-white shadow-xl ring-1 ring-ink-900/5 animate-scale-in`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-ink-100">
          <h2 className="text-base font-semibold text-ink-900 truncate pr-3">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-900"
          >
            <X size={18} />
          </button>
        </div>
        <div className="max-h-[75vh] overflow-y-auto p-5">{children}</div>
      </div>
    </div>,
    document.body,
  );
}