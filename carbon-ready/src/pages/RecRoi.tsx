import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/layout/PageHeader';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { Table, THead, TBody, TR, TH, TD } from '../components/ui/Table';
import { Badge } from '../components/ui/Badge';
import { RecRoiAssumptions } from '../components/rec-roi/RecRoiAssumptions';
import { PATH_SHORT, breakEvenText, pct } from '../components/rec-roi/format';
import { useStore } from '../store';
import { evaluateProjectRecRoi } from '../lib/rec-roi-project';
import { REC_FEES } from '../data/rec-fees';
import { formatNumber } from '../lib/format';

/** Portfolio view: REC ROI of every electricity project under the org's assumptions. */
export function RecRoi() {
  const projects = useStore((s) => s.projects);
  const records = useStore((s) => s.records);
  const pdds = useStore((s) => s.pdds);
  const methodologies = useStore((s) => s.methodologies);
  const factors = useStore((s) => s.factors);
  const recIssues = useStore((s) => s.recIssues);
  const settings = useStore((s) => s.recRoiSettings);
  const projectSettings = useStore((s) => s.recRoiProjectSettings);

  const rows = useMemo(() => projects
    .map((project) => evaluateProjectRecRoi({
      project, records, pdds, methodologies, factors, assumptions: settings,
      setting: projectSettings.find((p) => p.project_id === project.id),
      latestRequestType: recIssues.find((r) => r.project_id === project.id)?.request_type,
    }))
    .filter((r) => r.eligible),
  [projects, records, pdds, methodologies, factors, settings, projectSettings, recIssues]);

  const totalRecs = rows.reduce((s, r) => s + (r.annual.status === 'ok' ? r.annual.annual_mwh : 0), 0);

  return (
    <div>
      <PageHeader title="REC ROI" subtitle="ความคุ้มค่าของการลงทะเบียน I-REC(E) ผ่านแพลตฟอร์ม — ต่อโปรเจกต์" />
      <RecRoiAssumptions />
      <Card>
        <CardHeader title="พอร์ตโปรเจกต์" action={<span className="text-xs text-ink-secondary">รวม {formatNumber(totalRecs, 1)} REC/ปี</span>} />
        <CardBody className="p-0">
          <Table>
            <THead>
              <TR>
                <TH>โปรเจกต์</TH>
                <TH className="text-right">MWh/ปี</TH>
                <TH className="text-right">คุ้มทุน ก (฿/MWh)</TH>
                <TH className="text-right">คุ้มทุน ข (฿/MWh)</TH>
                <TH className="text-right">ROI @ราคากลาง</TH>
                <TH>แนะนำ</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((r) => {
                const roi = r.roi;
                const best = roi?.recommended ? roi[roi.recommended] : null;
                const mid = best?.status === 'ok' ? best.scenarios.find((s) => s.scenario === 'mid') : undefined;
                return (
                  <TR key={r.project.id} hover>
                    <TD className="font-medium">
                      <Link to={`/projects/${r.project.id}?tab=rec-roi`} className="text-petrol-700 hover:underline">{r.project.name}</Link>
                    </TD>
                    {r.annual.status !== 'ok' ? (
                      <TD className="text-ink-meta" colSpan={5}>ไม่มีข้อมูล kWh — อัปโหลดข้อมูลการผลิตก่อน</TD>
                    ) : (
                      <>
                        <TD className="text-right">
                          {formatNumber(r.annual.annual_mwh, 1)}
                          {r.annual.partial && <span className="ml-2"><Badge tone="amber">ข้อมูล {r.annual.coverage_days} วัน</Badge></span>}
                        </TD>
                        <TD className="text-right">{roi ? breakEvenText(roi.own) : '—'}</TD>
                        <TD className="text-right">{roi ? breakEvenText(roi.platform) : '—'}</TD>
                        <TD className={`text-right ${mid && mid.net_thb < 0 ? 'text-state-rejected' : ''}`}>{mid ? pct(mid.roi_pct) : '—'}</TD>
                        <TD>
                          {!roi?.recommended ? '—'
                            : mid && mid.net_thb < 0 ? <Badge tone="amber">ไม่คุ้มทั้งสองทาง</Badge>
                            : <Badge tone="green">{PATH_SHORT[roi.recommended]}</Badge>}
                        </TD>
                      </>
                    )}
                  </TR>
                );
              })}
            </TBody>
          </Table>
          <div className="border-t border-rule px-5 py-3 text-xs text-ink-meta">
            แสดงเฉพาะโปรเจกต์ผลิตไฟฟ้า (kWh) · ค่าธรรมเนียมตาม {REC_FEES.version} ({REC_FEES.source_pdf}) ·
            MWh/ปี จากข้อมูลวัดจริง 365 วันล่าสุด
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
