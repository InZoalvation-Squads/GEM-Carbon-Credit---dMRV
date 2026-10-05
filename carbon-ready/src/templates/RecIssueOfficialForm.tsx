import { useParams } from 'react-router-dom';
import { useStore } from '../store';
import { EmptyState } from '../components/ui/EmptyState';
import { lazy, Suspense } from 'react';
import { RouteSkeleton } from '../components/ui/RouteSkeleton';
const EvidentSF04 = lazy(() => import('./EvidentSF04').then((module) => ({ default: module.EvidentSF04 })));

/** Route element for /rec-issuance/:id/official. */
export function RecIssueOfficialForm({ recIssueId }: { recIssueId?: string }) {
  const params = useParams();
  const id = recIssueId ?? params.id;
  const rec = useStore((s) => s.recIssues.find((r) => r.id === id));
  if (!rec) return <EmptyState title="Issue request not found / ไม่พบคำขอ" hint="ลิงก์อาจหมดอายุหรือคำขอถูกลบ" />;
  return <Suspense fallback={<RouteSkeleton />}><EvidentSF04 recIssueId={rec.id} /></Suspense>;
}
