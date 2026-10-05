import { Suspense } from 'react';
import { RouteSkeleton } from '../components/ui/RouteSkeleton';
import { useParams } from 'react-router-dom';
import { useStore } from '../store';
import { EmptyState } from '../components/ui/EmptyState';
import { OFFICIAL_FORMS } from './registry';

/** Route element for /registration/:pddId/official — picks the renderer
 *  registered for the pdd's methodology (template-per-form). */
export function OfficialForm() {
  const { pddId } = useParams();
  const pdd = useStore((s) => s.pdds.find((p) => p.id === pddId));
  const methodology = useStore((s) => s.methodologies.find((m) => m.id === pdd?.methodology_id));

  if (!pdd || !methodology) {
    return <EmptyState title="PDD not found / ไม่พบเอกสาร" hint="ลิงก์อาจหมดอายุหรือเอกสารถูกลบ" />;
  }
  if (!methodology.document_template) {
    return <EmptyState title="No official form / ไม่มีฟอร์มทางการ" hint="Methodology นี้ยังไม่มี template ฟอร์มทางการ" />;
  }
  const Renderer = OFFICIAL_FORMS[methodology.document_template].component;
  return <Suspense fallback={<RouteSkeleton />}><Renderer pddId={pdd.id} /></Suspense>;
}
