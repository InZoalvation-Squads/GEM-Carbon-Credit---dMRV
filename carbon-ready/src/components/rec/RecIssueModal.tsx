import { useMemo, useState } from 'react';
import { Check, Zap } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { useStore } from '../../store';
import { api } from '../../lib/api';
import type { RecIssueRequest } from '../../types';

// SF-04 FN-01 (2026) fee schedule — approximate, per MWh applied for.
const FEE_PER_MWH: Record<RecIssueRequest['request_type'], number> = {
  Normal: 0.95,
  'Self consumption': 1.33,
};

/**
 * Proponent-side "Issue Request" (SF-04): pick a REC-registered project +
 * production period, the MWh is COMPUTED from raw monitoring records (never
 * hand-typed) — the same formula the server module recomputes and freezes
 * at submit, so the two always agree.
 */
export function RecIssueModal({ onClose }: { onClose: () => void }) {
  const projects = useStore((s) => s.projects);
  const pdds = useStore((s) => s.pdds);
  const methodologies = useStore((s) => s.methodologies);
  const records = useStore((s) => s.records);

  const recProjects = useMemo(
    () => projects.filter((p) =>
      pdds.some((d) => d.project_id === p.id && d.state === 'registered'
        && methodologies.find((m) => m.id === d.methodology_id)?.standard === 'REC')),
    [projects, pdds, methodologies],
  );

  const [projectId, setProjectId] = useState(recProjects[0]?.id ?? '');
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(`${today.slice(0, 4)}-01-01`);
  const [to, setTo] = useState(today);
  const [requestType, setRequestType] = useState<RecIssueRequest['request_type']>('Normal');
  const [appliedMwh, setAppliedMwh] = useState('');
  const [receivingOrgName, setReceivingOrgName] = useState('');
  const [receivingAccountId, setReceivingAccountId] = useState('');
  const [busy, setBusy] = useState(false);

  const mwh = useMemo(() => {
    const kwh = records
      .filter((r) => r.project_id === projectId && r.record_date >= from && r.record_date <= to)
      .reduce((sum, r) => sum + r.generation_kwh, 0);
    return Math.round((kwh / 1000) * 1e6) / 1e6;
  }, [records, projectId, from, to]);

  const fee = mwh * FEE_PER_MWH[requestType];
  const appliedValue = appliedMwh.trim() === '' ? null : Number(appliedMwh);
  const appliedInvalid = appliedValue !== null && (Number.isNaN(appliedValue) || appliedValue <= 0 || appliedValue > mwh);

  const canSaveDraft = !!projectId && mwh > 0 && from <= to && !appliedInvalid && !busy;
  // The server requires non-blank receiving fields at submit time (SF-04 §2) —
  // guard the button here too so "Save & Submit" never 400s; the draft path
  // stays permissive since those fields can be filled in later before submit.
  const receivingComplete = receivingOrgName.trim() !== '' && receivingAccountId.trim() !== '';
  const canSubmit = canSaveDraft && receivingComplete;

  async function saveDraft() {
    if (!canSaveDraft) return;
    setBusy(true);
    try {
      await api.createRecIssue({
        project_id: projectId,
        period_start: from,
        period_end: to,
        request_type: requestType,
        applied_mwh: appliedValue ?? undefined,
        receiving_org_name: receivingOrgName.trim() || undefined,
        receiving_account_id: receivingAccountId.trim() || undefined,
      });
      onClose();
    } finally {
      setBusy(false);
    }
  }

  async function saveAndSubmit() {
    if (!canSubmit) return;
    setBusy(true);
    try {
      const created = await api.createRecIssue({
        project_id: projectId,
        period_start: from,
        period_end: to,
        request_type: requestType,
        applied_mwh: appliedValue ?? undefined,
        receiving_org_name: receivingOrgName.trim() || undefined,
        receiving_account_id: receivingAccountId.trim() || undefined,
      });
      await api.submitRecIssue(created.id);
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Issue Request (SF-04)" size="lg">
      <div className="space-y-4">
        <Select label="Project (REC-registered only)" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
          {recProjects.length === 0 && <option value="">— no REC-registered projects —</option>}
          {recProjects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>

        <div className="grid grid-cols-2 gap-3">
          <Input label="Period start" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Input label="Period end" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>

        <div className="rounded-xl border border-brand-200 bg-brand-50/60 px-4 py-3">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-brand-700">
            <Zap size={13} /> คำนวณจากข้อมูลการผลิตจริง (ผู้ยื่นแก้ตัวเลขเองไม่ได้)
          </div>
          {mwh > 0 ? (
            <div className="mt-1.5 text-sm text-ink-800">
              <span data-testid="mwh-preview" className="text-base font-bold text-brand-700">{mwh.toLocaleString()} MWh</span>
            </div>
          ) : (
            <div className="mt-1.5 text-sm text-amber-700">ไม่มีข้อมูล monitoring ในช่วงที่เลือก</div>
          )}
        </div>

        <Select label="Request type" value={requestType} onChange={(e) => setRequestType(e.target.value as RecIssueRequest['request_type'])}>
          <option value="Normal">Normal</option>
          <option value="Self consumption">Self consumption</option>
        </Select>

        <Input
          label="I-REC(E) applied for (MWh, optional — defaults to total)"
          type="number" min="0" step="0.000001" value={appliedMwh}
          onChange={(e) => setAppliedMwh(e.target.value)}
          error={appliedInvalid ? 'Must be greater than 0 and no more than the computed total' : undefined}
        />

        <div className="grid grid-cols-2 gap-3">
          <Input label="Receiving organisation" value={receivingOrgName} onChange={(e) => setReceivingOrgName(e.target.value)} />
          <Input label="Receiving account ID" value={receivingAccountId} onChange={(e) => setReceivingAccountId(e.target.value)} />
        </div>
        {!receivingComplete && (
          <p className="-mt-2 text-xs text-amber-700">
            ต้องระบุ Receiving organisation และ Account ID ก่อน submit
          </p>
        )}

        <div className="rounded-xl bg-ink-50 px-4 py-3 text-sm">
          <div className="text-ink-600">
            ค่าธรรมเนียมโดยประมาณ: <span data-testid="fee-estimate" className="font-semibold text-ink-900">
              ฿{fee.toFixed(2)}
            </span> (EGAT FN-01 2026 — โดยประมาณ)
          </div>
        </div>

        <p className="text-xs text-ink-400">
          ไฟฟ้างวดนี้ต้องไม่ถูกเคลมในกลไกอื่น (T-VER ฯลฯ) — ตามคำประกาศ SF-04A
        </p>

        <div className="flex justify-end gap-2 border-t border-ink-100 pt-3">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="secondary" disabled={!canSaveDraft} loading={busy} onClick={saveDraft}>
            Save draft
          </Button>
          <Button disabled={!canSubmit} loading={busy} onClick={saveAndSubmit}>
            <Check size={15} /> Save & Submit
          </Button>
        </div>
      </div>
    </Modal>
  );
}
