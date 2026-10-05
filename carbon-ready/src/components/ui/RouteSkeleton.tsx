import { ChartSkeleton, HeadBlockSkeleton, Skeleton, SkeletonRows } from './Skeleton';

type Shape = 'table' | 'queue' | 'form' | 'document' | 'detail' | 'guide' | 'dashboard' | 'auth';

function Fields({ count = 6 }: { count?: number }) {
  return <div aria-hidden="true" className="grid grid-cols-12 gap-6 p-5">
    {Array.from({ length: count }, (_, index) => <div key={index} className="col-span-12 sm:col-span-6">
      <Skeleton className="mb-1.5 h-[21px] w-1/3" /><Skeleton className="h-10" />
    </div>)}
  </div>;
}

function Toolbar({ fields = 1, segmented = false }: { fields?: number; segmented?: boolean }) {
  return segmented
    ? <div aria-hidden="true" className="flex flex-wrap gap-2">{Array.from({ length: fields }, (_, index) => <Skeleton key={index} className="h-10 w-20" />)}</div>
    : <div aria-hidden="true" className="grid gap-3 rounded-xl border border-ink-200/80 bg-white shadow-card p-4 sm:grid-cols-3">
        {Array.from({ length: fields }, (_, index) => <div key={index} className={fields === 1 ? 'sm:col-span-3' : ''}>
          <Skeleton className="mb-1.5 h-[21px] w-16" /><Skeleton className="h-10" />
        </div>)}
      </div>;
}

function Plot() {
  return <div className="rounded-xl border border-ink-200/80 bg-white shadow-card">
    <div className="border-b border-rule px-5 py-3"><Skeleton className="h-[21px] w-56" /></div>
    <div className="px-5 py-4"><ChartSkeleton /></div>
  </div>;
}

/** Match each route's title, controls, figures, fields and responsive sheet structure. */
export function RouteSkeleton({ path = '/projects', shape: override }: { path?: string; shape?: Shape }) {
  const section = path.split('/')[1];
  const detail = path.split('/').length > 2;
  const shape: Shape = override ?? (
    /\/(official|document)$/.test(path) ? 'document'
      : section === 'register' ? 'auth'
      : section === 'dashboard' ? 'dashboard'
      : section === 'how-it-works' ? 'guide'
      : section === 'registration' || section === 'upload' || section === 'calculations' ? 'form'
      : detail && section !== 'methodologies' ? 'detail'
      : ['verifications', 'validation', 'rec-issuance', 'audit-log', 'guardian'].includes(section) ? 'queue' : 'table'
  );
  const figures = section === 'verifications' ? 2 : section === 'calculations' ? 3 : 4;
  const hasFigures = shape !== 'document' && (shape === 'dashboard' || section === 'projects' && detail
    || section === 'verifications' && !detail || ['rec-issuance', 'calculations'].includes(section));
  const action = !['validation', 'audit-log', 'how-it-works', 'upload', 'guardian'].includes(section);
  const columns = section === 'projects' || section === 'methodologies' ? 7 : section === 'iot' ? 6 : 5;
  return <div role="status" aria-label="Loading" data-skeleton-shape={shape}
    className={shape === 'auth' ? 'grid min-h-full place-items-center bg-grid-faint [background-size:32px_32px] p-4' : ''}>
    <span className="sr-only">Loading</span>
    <div className={shape === 'auth' ? 'w-full max-w-md space-y-6' : 'space-y-6'}>
      <div aria-hidden="true" className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="w-full space-y-1 sm:w-2/3"><Skeleton className="h-[39px] w-1/2" /><Skeleton className="h-[21px] w-full" /></div>
        {action && <Skeleton className="h-11 w-32 sm:h-10" />}
      </div>
      {section === 'projects' && detail && <Toolbar fields={3} />}
      {hasFigures && <HeadBlockSkeleton figures={figures} sources={section !== 'projects'} />}
      {section === 'projects' && !detail && <Toolbar fields={2} />}
      {section === 'audit-log' && <><div className="rounded-xl border border-ink-200/80 bg-white shadow-card px-5 py-3"><Skeleton className="h-[21px] w-2/3" /></div><Toolbar fields={4} /></>}
      {section === 'upload' || section === 'calculations' ? <Toolbar /> : null}
      {section === 'verifications' && !detail && <Toolbar fields={7} segmented />}
      {section === 'rec-issuance' && shape !== 'document' && <Toolbar fields={5} segmented />}
      {section === 'guardian' || section === 'projects' && detail ? <Toolbar fields={4} segmented /> : null}
      {shape === 'dashboard' || section === 'calculations' ? <Plot /> : null}
      {shape === 'guide' && <><Skeleton className="aspect-[1200/356] w-full" /><div aria-hidden="true" className="grid gap-3 rounded-xl border border-ink-200/80 bg-white shadow-card p-6 md:grid-cols-5">
        {Array.from({ length: 5 }, (_, index) => <div key={index} className="space-y-2 border-b border-rule px-4 py-3"><Skeleton className="h-5 w-5" /><Skeleton className="h-5 w-2/3" /><Skeleton className="h-10" /></div>)}
      </div></>}
      {section === 'registration' && detail && <Toolbar fields={7} segmented />}
      {shape === 'detail' && section !== 'projects' ? <div className={section === 'validation' ? 'grid gap-5 lg:grid-cols-3' : 'grid gap-5 lg:grid-cols-2'}>
        <div className={section === 'validation' ? 'rounded-xl border border-ink-200/80 bg-white shadow-card lg:col-span-2' : 'rounded-xl border border-ink-200/80 bg-white shadow-card'}><Fields /><SkeletonRows /></div>
        <div className="rounded-xl border border-ink-200/80 bg-white shadow-card p-5"><Skeleton className="mb-4 h-5 w-1/2" /><SkeletonRows rows={3} block /><Skeleton className="mt-4 h-28" /></div>
      </div> : <div className="rounded-xl border border-ink-200/80 bg-white shadow-card">
        {shape === 'document' ? <div aria-hidden="true" className="min-h-[1123px] space-y-6 p-8">
          {Array.from({ length: 6 }, (_, index) => <div key={index}><Skeleton className="mb-1.5 h-[21px] w-1/3" /><Skeleton className="h-20" /></div>)}
        </div> : shape === 'auth' || section === 'registration' ? <Fields />
          : section === 'upload' ? <div aria-hidden="true" className="px-5 py-4"><Skeleton className="h-48 w-full" /></div>
          : <SkeletonRows columns={section === 'calculations' || section === 'projects' && detail ? 3 : columns}
              block={['queue', 'guide', 'dashboard'].includes(shape)} entity={shape === 'table' || section === 'projects'} />}
      </div>}
    </div>
  </div>;
}
