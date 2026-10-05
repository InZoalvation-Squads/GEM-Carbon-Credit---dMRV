import { useEffect, useMemo, useState } from 'react';
import { Calculator, Check } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { CategoryChip } from '../ui/StatusBadge';
import { useStore } from '../../store';
import { api } from '../../lib/api';
import { locationToCountryCode } from '../../lib/geo';
import { formatTco2e } from '../../lib/format';

/**
 * Proponent-side "Request verification": pick a registered project + period,
 * the claim is COMPUTED from the raw monitoring records × the current EF
 * (never hand-typed), tick the supporting evidence, submit. The same numbers
 * the VVB's Data-check panel recomputes — so the two always agree.
 */
export function RequestVerificationModal({ onClose }: { onClose: () => void }) {
  const projects = useStore((s) => s.projects.filter((p) => p.lifecycle_stage === 'registered'));
  const records = useStore((s) => s.records);
  const factors = useStore((s) => s.factors);
  const evidence = useStore((s) => s.evidence);
  const verifications = useStore((s) => s.verifications);

  const [projectId, setProjectId] = useState(projects[0]?.id ?? '');
  const today = new Date().toISOString().slice(0, 10);
  // Verra rule: monitoring periods never overlap — each new package starts
  // the day after the last claimed period of this project.
  const lastClaimedEnd = useMemo(() => {
    const claimed = verifications.filter((v) => v.project_id === projectId && v.state !== 'rejected');
    return claimed.length ? claimed.map((v) => v.monitoring_period_end).sort().slice(-1)[0]! : null;
  }, [verifications, projectId]);
  const suggestedStart = useMemo(() => {
    if (!lastClaimedEnd) return `${today.slice(0, 4)}-01-01`;
    const d = new Date(`${lastClaimedEnd}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  }, [lastClaimedEnd, today]);
  const [from, setFrom] = useState(suggestedStart);
  const [to, setTo] = useState(today);
  useEffect(() => { setFrom(suggestedStart); }, [suggestedStart]);
  const overlapping = useMemo(
    () => verifications.find((v) =>
      v.project_id === projectId && v.state !== 'rejected' &&
      from <= v.monitoring_period_end && to >= v.monitoring_period_start),
    [verifications, projectId, from, to],
  );
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);

  const project = projects.find((p) => p.id === projectId);

  const calc = useMemo(() => {
    if (!project) return null;
    const rows = records
      .filter((r) => r.project_id === project.id && r.record_date >= from && r.record_date <= to)
      .sort((a, b) => a.record_date.localeCompare(b.record_date));
    const totalKwh = rows.reduce((s, r) => s + r.generation_kwh, 0);
    const country = locationToCountryCode(project.location.split(',').pop()?.trim() ?? '');
    const current = factors.filter((f) => f.country === country && f.is_current);
    const ef = current.length
      ? current.reduce((a, b) => (b.effective_date >= a.effective_date ? b : a))
      : null;
    return {
      rows: rows.length,
      totalKwh,
      ef,
      reductionKg: ef ? totalKwh * ef.factor_kgco2e_per_kwh : null,
    };
  }, [project, records, factors, from, to]);

  const projectEvidence = evidence.filter((e) => e.project_id === projectId && e.status === 'active');
  // Evidence already claimed by an open/approved package stays selectable but unticked by default.
  const alreadyClaimed = new Set(
    verifications.filter((v) => v.project_id === projectId && v.state !== 'rejected').flatMap((v) => v.evidence_ids),
  );
  const isChecked = (id: string) => checked[id] ?? !alreadyClaimed.has(id);
  const selectedIds = projectEvidence.filter((e) => isChecked(e.id)).map((e) => e.id);

  const canSubmit = !!project && calc !== null && calc.rows > 0 && calc.reductionKg !== null && from <= to && !overlapping && !busy;

  async function submit() {
    if (!project || !calc?.ef || calc.reductionKg === null) return;
    setBusy(true);
    try {
      await api.requestVerification({
        project_id: project.id,
        monitoring_period_start: from,
        monitoring_period_end: to,
        reduction_kgco2e: Math.round(calc.reductionKg * 10) / 10,
        factors_snapshot: `${calc.ef.country} grid EF ${calc.ef.factor_kgco2e_per_kwh} kgCO2e/kWh (${calc.ef.source} v${calc.ef.version}, effective ${calc.ef.effective_date})`,
        evidence_ids: selectedIds,
      });
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Request verification" size="lg">
      <div className="space-y-4">
        <Select label="Project (registered only)" value={projectId} onChange={(e) => { setProjectId(e.target.value); setChecked({}); }}>
          {projects.length === 0 && <option value="">— no registered projects —</option>}
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>

        <div className="grid grid-cols-2 gap-3">
          <Input label="Period start" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Input label="Period end" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        {lastClaimedEnd && !overlapping && (
          <p className="-mt-2 text-xs text-ink-meta">
            รอบก่อนหน้าของโปรเจกต์นี้เคลมถึง {lastClaimedEnd} — รอบใหม่เริ่มต่อจากนั้นให้อัตโนมัติ
          </p>
        )}
        {overlapping && (
          <div data-testid="overlap-warning" className="-mt-1 rounded-sheet bg-state-rejected/5 px-4 py-3 text-sm text-state-rejected">
            ช่วงเวลาทับซ้อนกับแพ็กเกจ <span className="font-mono">{overlapping.id}</span> ({overlapping.monitoring_period_start} – {overlapping.monitoring_period_end})
            — ตามกติกา Verra ช่วงเวลาหนึ่งเคลมเครดิตได้ครั้งเดียว กันการนับซ้ำ
          </div>
        )}

        {/* computed claim — the number is derived, never typed */}
        <div className="rounded-sheet border border-brand-100 bg-brand-50/60 px-4 py-3" data-testid="computed-claim">
          <div className="flex items-center gap-2 text-xs font-semibold text-brand-700">
            <Calculator size={13} /> คำนวณจากข้อมูลดิบ (ผู้ยื่นแก้ตัวเลขเองไม่ได้)
          </div>
          {calc && calc.rows > 0 && calc.reductionKg !== null ? (
            <div className="mt-1.5 text-sm text-ink">
              {calc.rows.toLocaleString()} รายการ · {calc.totalKwh.toLocaleString()} kWh × EF {calc.ef!.factor_kgco2e_per_kwh}
              {' → '}<span className="text-base font-semibold text-brand-700">{formatTco2e(calc.reductionKg)}</span>
            </div>
          ) : (
            <div className="mt-1.5 text-sm text-state-revision">
              {calc && calc.rows === 0 ? 'ไม่มีข้อมูล monitoring ในช่วงที่เลือก' : 'ไม่พบค่า EF ของประเทศโครงการ'}
            </div>
          )}
        </div>

        <div>
          <div className="mb-1.5 text-sm font-medium text-ink-secondary">หลักฐานประกอบ ({selectedIds.length}/{projectEvidence.length})</div>
          <div className="max-h-44 space-y-1.5 overflow-y-auto rounded-sheet border border-rule p-2">
            {projectEvidence.length === 0 && <p className="px-2 py-3 text-sm text-ink-meta">โปรเจกต์นี้ยังไม่มีหลักฐาน</p>}
            {projectEvidence.map((e) => (
              <label key={e.id} className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-ground">
                <input type="checkbox" checked={isChecked(e.id)}
                  onChange={(ev) => setChecked((m) => ({ ...m, [e.id]: ev.target.checked }))}
                  className="h-4 w-4 accent-brand-600" />
                <span className="min-w-0 flex-1 truncate text-sm text-ink">{e.file_name}</span>
                <CategoryChip category={e.category} />
                {alreadyClaimed.has(e.id) && <span className="text-xs text-ink-meta">ใช้ในแพ็กเกจก่อนแล้ว</span>}
              </label>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-rule pt-3">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={!canSubmit} loading={busy} onClick={submit}>
            <Check size={15} /> Submit for verification
          </Button>
        </div>
      </div>
    </Modal>
  );
}
