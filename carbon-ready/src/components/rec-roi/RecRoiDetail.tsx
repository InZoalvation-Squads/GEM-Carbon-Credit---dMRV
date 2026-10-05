import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardBody, CardHeader } from '../ui/Card';
import { Table, THead, TBody, TR, TH, TD } from '../ui/Table';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { toast } from '../layout/Toast';
import { useStore } from '../../store';
import { api } from '../../lib/api';
import { evaluateProjectRecRoi } from '../../lib/rec-roi-project';
import { registrationFeeThb, REC_FEES } from '../../data/rec-fees';
import type { FinancialValue } from '../../lib/rec-roi-project';
import type { RecIrrUplift, RecPath, RecPathResult, RecRoiResult } from '../../lib/rec-roi';
import type { UUID } from '../../types';
import { formatNumber } from '../../lib/format';
import { MISSING_LABEL, PATH_LABEL, pct, paybackText, pricePerMwh, recommendationBadge, thb } from './format';

const SCENARIO_LABEL = { low: 'ต่ำ', mid: 'กลาง', high: 'สูง' } as const;

/**
 * Card-header chip for one path. "แนะนำ" appears only when the shared helper
 * says the recommendation is green AND it is this path; on the recommended
 * path with a non-green tone the helper's own (non-overstating) text is shown.
 */
function pathBadge(roi: RecRoiResult, path: RecPath) {
  if (roi.recommended !== path) return undefined;
  const rec = recommendationBadge(roi);
  if (!rec) return undefined;
  return <Badge tone={rec.tone} className="whitespace-nowrap">{rec.tone === 'green' ? 'แนะนำ' : rec.text}</Badge>;
}

function PathCard({ result, badge, capacityKwp, exempt }: {
  result: RecPathResult; badge: React.ReactNode; capacityKwp: number; exempt: boolean;
}) {
  return (
    <Card>
      <CardHeader title={PATH_LABEL[result.path]} action={badge} />
      <CardBody className="space-y-4 p-5">
        {result.status === 'missing_fx' && <p className="text-sm text-ink-meta">{MISSING_LABEL.fx}</p>}
        {result.status === 'missing_fee' && <p className="text-sm text-ink-meta">{MISSING_LABEL.platform_fee}</p>}
        {result.status === 'ok' && (
          <>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <dt className="text-ink-meta">ค่าขึ้นทะเบียน EGAT</dt>
              <dd className="text-right">{thb(registrationFeeThb(capacityKwp, exempt))}</dd>
              <dt className="text-ink-meta">ต้นทุนคงที่ทั้งระยะ (รวมค่าขึ้นทะเบียน)</dt>
              <dd className="text-right">{thb(result.fixed_cost_thb)}</dd>
              <dt className="text-ink-meta">ค่าออกใบทั้งระยะ</dt>
              <dd className="text-right">{thb(result.issuance_cost_thb)}</dd>
              <dt className="font-medium text-ink-secondary">ราคาคุ้มทุน (฿/MWh)</dt>
              <dd className="text-right font-semibold text-ink">{pricePerMwh(result.break_even_price_thb)}</dd>
            </dl>
            {result.scenarios.length === 0 ? (
              <p className="text-xs text-ink-meta">
                {MISSING_LABEL.price} — กรอกที่ <Link to="/rec-roi" className="text-petrol-700 hover:underline">REC ROI</Link>
              </p>
            ) : (
              <Table>
                <THead><TR><TH>ราคา</TH><TH className="text-right">รายได้</TH><TH className="text-right">สุทธิ</TH><TH className="text-right">ROI</TH><TH>คืนทุน</TH></TR></THead>
                <TBody>
                  {result.scenarios.map((s) => (
                    <TR key={s.scenario}>
                      <TD>{SCENARIO_LABEL[s.scenario]} ({pricePerMwh(s.price_thb)})</TD>
                      <TD className="text-right">{thb(s.revenue_thb)}</TD>
                      <TD className={`text-right ${s.net_thb < 0 ? 'text-state-rejected' : ''}`}>{thb(s.net_thb)}</TD>
                      <TD className={`text-right ${s.net_thb < 0 ? 'text-state-rejected' : ''}`}>{pct(s.roi_pct)}</TD>
                      <TD>{paybackText(s.payback_months)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </>
        )}
      </CardBody>
    </Card>
  );
}

const SOURCE_LABEL: Record<FinancialValue['source'], string> = { pdd: 'จาก PDD', pea_default: 'ค่าเริ่มต้น PEA' };
const basisText = (label: string, v: FinancialValue, unit: string) =>
  `${label} ${formatNumber(v.value, 2).replace(/\.00$/, '')}${unit} (${SOURCE_LABEL[v.source]})`;

const irrText = (v: number | null) => (v === null ? '—' : `${formatNumber(v, 2)}%`);
const yearsText = (v: number | null) => (v === null ? '—' : `${formatNumber(v, 1)} ปี`);

/** Why the uplift could not be computed, one message per non-ok status. */
const UPLIFT_MESSAGE: Record<Exclude<RecIrrUplift['status'], 'ok'>, string> = {
  missing_investment: 'ยังไม่มีข้อมูลเงินลงทุน — ใส่ใน PDD (investment_mthb) หรือกรอกด้านล่าง',
  missing_price: MISSING_LABEL.price,
  no_path: 'ยังคำนวณไม่ได้ — เส้นทางที่แนะนำยังขาดค่าบริการแพลตฟอร์มหรืออัตรา EUR→THB',
  missing_generation: 'ยังไม่มีข้อมูลการผลิตที่วัดได้',
};

/** Per-project REC ROI: both account paths, the MWh basis, IRR uplift and project settings. */
export function RecRoiDetail({ projectId }: { projectId: UUID }) {
  const project = useStore((s) => s.projects.find((p) => p.id === projectId));
  const records = useStore((s) => s.records);
  const pdds = useStore((s) => s.pdds);
  const methodologies = useStore((s) => s.methodologies);
  const factors = useStore((s) => s.factors);
  const recIssues = useStore((s) => s.recIssues);
  const settings = useStore((s) => s.recRoiSettings);
  const saved = useStore((s) => s.recRoiProjectSettings.find((p) => p.project_id === projectId));
  const role = useStore((s) => s.currentUser.role);
  const canEdit = role === 'admin' || role === 'esg_manager' || role === 'project_owner';

  const r = useMemo(() => (project ? evaluateProjectRecRoi({
    project, records, pdds, methodologies, factors, assumptions: settings, setting: saved,
    latestRequestType: recIssues.find((x) => x.project_id === projectId)?.request_type,
  }) : null), [project, records, pdds, methodologies, factors, settings, saved, recIssues, projectId]);

  const [issuanceType, setIssuanceType] = useState(r?.setting.issuance_type ?? 'Normal');
  const [exempt, setExempt] = useState(r?.setting.digital_meter_exempt ?? false);
  const [investment, setInvestment] = useState(r?.setting.investment_mthb?.toString() ?? '');
  const [investmentBad, setInvestmentBad] = useState(false);
  const [saving, setSaving] = useState(false);

  // Re-sync only when a save landed (updated_at moved), never on a mere re-evaluation,
  // so a half-typed value survives unrelated store updates.
  const syncedAt = useRef(r?.setting.updated_at ?? null);
  useEffect(() => {
    if (!r || syncedAt.current === r.setting.updated_at) return;
    syncedAt.current = r.setting.updated_at;
    setIssuanceType(r.setting.issuance_type);
    setExempt(r.setting.digital_meter_exempt);
    setInvestment(r.setting.investment_mthb?.toString() ?? '');
    setInvestmentBad(false);
  }, [r]);

  if (!project || !r) return null;
  if (!r.eligible) {
    return <Card><CardBody className="p-6 text-sm text-ink-meta">REC ใช้กับโปรเจกต์ผลิตไฟฟ้าเท่านั้น (methodology ที่วัดเป็น kWh)</CardBody></Card>;
  }
  if (r.annual.status !== 'ok' || !r.roi) {
    return (
      <Card><CardBody className="p-6 text-sm text-ink-meta">
        ยังไม่มีข้อมูลการผลิต — <Link to="/upload" className="text-petrol-700 hover:underline">Upload Data</Link> แล้วจึงประเมิน REC ROI ได้
      </CardBody></Card>
    );
  }
  const annual = r.annual;
  const roi = r.roi;
  const u = r.uplift;

  const saveSetting = async () => {
    // Never turn an unparseable entry into a silent "no investment".
    const trimmed = investment.trim();
    const value = trimmed === '' ? null : Number(trimmed);
    if (investmentBad || (value !== null && !Number.isFinite(value))) {
      setInvestmentBad(true);
      toast.error('บันทึกไม่ได้', 'ตัวเลขไม่ถูกต้องในช่อง เงินลงทุน');
      return;
    }
    if (saving) return;
    setSaving(true);
    try {
      // The api toasts success/failure itself; the result only gates the draft state.
      const ok = await api.saveRecRoiProjectSetting(projectId, {
        issuance_type: issuanceType,
        digital_meter_exempt: project.capacity_kwp < 250 ? exempt : false,
        investment_mthb: value,
      });
      if (ok) setInvestmentBad(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {roi.missing.length > 0 && (
        <div className="rounded-sheet border border-state-revision/30 bg-state-revision/5 px-4 py-3 text-xs text-state-revision">
          ยังขาด: {roi.missing.map((m) => MISSING_LABEL[m]).join(' · ')} — กรอกที่ <Link to="/rec-roi" className="text-petrol-700 hover:underline">REC ROI</Link>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <PathCard result={roi.own} badge={pathBadge(roi, 'own')} capacityKwp={project.capacity_kwp} exempt={r.setting.digital_meter_exempt} />
        <PathCard result={roi.platform} badge={pathBadge(roi, 'platform')} capacityKwp={project.capacity_kwp} exempt={r.setting.digital_meter_exempt} />
      </div>

      <Card>
        <CardHeader title="ฐานข้อมูล MWh" />
        <CardBody className="p-5 text-sm text-ink-secondary">
          {formatNumber(annual.annual_mwh, 1)} MWh/ปี (= REC/ปี) จาก {formatNumber(annual.total_kwh, 0)} kWh
          ช่วง {annual.window_start} – {annual.window_end}
          {annual.partial && <span className="ml-2"><Badge tone="amber" className="whitespace-nowrap">ข้อมูล {annual.coverage_days} วัน — ประมาณเป็นรายปี</Badge></span>}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="REC ช่วยโปรเจกต์โซลาร์แค่ไหน (IRR uplift)" />
        <CardBody className="p-5 text-sm">
          {u?.status === 'ok' ? (
            <div className="space-y-2">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>IRR ไม่มี REC: <b className="text-ink">{irrText(u.without.irr_pct)}</b>
                  {' · '}คืนทุน {yearsText(u.without.payback_years)}</div>
                <div>IRR มี REC: <b className="text-ink">{irrText(u.with.irr_pct)}</b>
                  {' · '}คืนทุน {yearsText(u.with.payback_years)}</div>
              </div>
              <p className="text-xs text-ink-meta">
                เงินลงทุน {formatNumber(u.investment_mthb, 2)} ล้านบาท ({r.investment_source === 'pdd' ? 'จาก PDD' : 'กรอกเอง'}) ·
                REC ราคากลาง {pricePerMwh(u.price_thb)} ฿/MWh ทาง {PATH_LABEL[u.path]} ·
                {basisText('ค่าไฟ', r.financial_basis.elec_price_thb_kwh, ' ฿/kWh')} ·{' '}
                {basisText('อัตราคิดลด', r.financial_basis.discount_rate_pct, '%')} ·{' '}
                {basisText('อายุโครงการ', r.financial_basis.lifetime_years, ' ปี')}
              </p>
            </div>
          ) : (
            <p className="text-ink-meta">{u ? UPLIFT_MESSAGE[u.status] : ''}</p>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="ค่าเฉพาะโปรเจกต์" />
        <CardBody className="space-y-4 p-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
            <div className="md:col-span-4">
              <Select label="ประเภทการออกใบ" value={issuanceType} disabled={!canEdit}
                onChange={(e) => setIssuanceType(e.target.value as 'Normal' | 'Self consumption')}>
                <option value="Normal">Normal ({REC_FEES.issuance_thb_per_mwh.Normal} ฿/MWh)</option>
                <option value="Self consumption">Self consumption ({REC_FEES.issuance_thb_per_mwh['Self consumption']} ฿/MWh)</option>
              </Select>
              {r.suggested_issuance_type && r.suggested_issuance_type !== issuanceType && (
                <span className="mt-1 block text-xs text-ink-meta">คำขอ SF-04 ล่าสุดใช้ {r.suggested_issuance_type}</span>
              )}
            </div>
            <div className="md:col-span-4">
              <Input label="เงินลงทุน (ล้านบาท)" type="number" min="0" step="any" value={investment} disabled={!canEdit}
                error={investmentBad ? 'ตัวเลขไม่ถูกต้อง' : undefined}
                onChange={(e) => {
                  setInvestment(e.target.value);
                  setInvestmentBad(e.target.validity?.badInput === true);
                }} />
              <span className="mt-1 block text-xs text-ink-meta">ใช้เมื่อ PDD ไม่มี investment_mthb</span>
            </div>
            {project.capacity_kwp < 250 && (
              <label className="flex items-center gap-2 text-sm text-ink-secondary md:col-span-4">
                <input type="checkbox" checked={exempt} disabled={!canEdit} onChange={(e) => setExempt(e.target.checked)} />
                EGAT อนุมัติ digital meter (ยกเว้นค่าขึ้นทะเบียน)
              </label>
            )}
          </div>
          {canEdit && <div className="flex justify-end"><Button onClick={saveSetting} disabled={saving}>บันทึกค่าของโปรเจกต์</Button></div>}
        </CardBody>
      </Card>
    </div>
  );
}
