/** Quiet ledger row, shared by route and official-template Suspense boundaries. */
export function RouteSkeleton() {
  return <div role="status" aria-label="Loading" className="rounded-sheet border border-rule bg-surface p-5">
    <span className="sr-only">Loading</span>
    <div aria-hidden className="grid grid-cols-[4rem_1fr] items-center gap-6">
      <div className="skeleton h-4" />
      <div className="space-y-3"><div className="skeleton h-6 w-2/3" /><div className="skeleton h-3 w-1/2" /></div>
    </div>
  </div>;
}
