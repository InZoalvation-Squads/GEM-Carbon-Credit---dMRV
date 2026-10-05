import { Children, cloneElement, createContext, isValidElement, ReactElement, ReactNode, useContext } from 'react';
import clsx from 'clsx';
const MobileLabels = createContext<string[] | undefined>(undefined);
/** Entity tables keep a single DOM: the same cells become labelled, ruled blocks on phones. */
export function Table({ children, className, mobileLabels }: { children: ReactNode; className?: string; mobileLabels?: string[] }) {
  return <MobileLabels.Provider value={mobileLabels}><div className={clsx('max-h-[70vh] overflow-auto', mobileLabels && 'entity-table', className)}><table className="w-full border-separate border-spacing-0 text-sm tnum">{children}</table></div></MobileLabels.Provider>;
}
export function THead({ children }: { children: ReactNode }) {
  return <thead className="sticky top-0 z-10 bg-ink-50/70 text-[11px] uppercase tracking-wider text-ink-500">{children}</thead>;
}
export function TBody({ children }: { children: ReactNode }) { return <tbody>{children}</tbody>; }
export function TR({ children, className, hover }: { children: ReactNode; className?: string; hover?: boolean }) {
  const labels = useContext(MobileLabels);
  return <tr className={clsx('[&>td]:border-b [&>td]:border-ink-100 [&>th]:border-b [&>th]:border-ink-200', hover && 'transition-colors hover:bg-brand-50/40', className)}>
    {labels ? Children.map(children, (child, index) => isValidElement(child) && child.type === TD ? cloneElement(child as ReactElement<{ label?: string }>, { label: labels[index] }) : child) : children}
  </tr>;
}
export function TH({ children, className }: { children: ReactNode; className?: string }) {
  return <th className={clsx('px-5 py-3 text-left font-semibold', className)}>{children}</th>;
}
export function TD({ children, className, label, colSpan }: { children: ReactNode; className?: string; label?: string; colSpan?: number }) {
  return <td data-label={label} colSpan={colSpan} className={clsx('px-5 py-3 text-ink-700', className)}>{children}</td>;
}
