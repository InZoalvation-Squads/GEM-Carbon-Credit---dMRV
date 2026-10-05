import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { FileDown } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { Table, THead, TBody, TR, TH, TD } from '../components/ui/Table';
import { Badge } from '../components/ui/Badge';
import { LinkButton } from '../components/ui/Button';
import { RecRoiAssumptions } from '../components/rec-roi/RecRoiAssumptions';
import { breakEvenText, pct, recommendationBadge } from '../components/rec-roi/format';
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

  const role = useStore((s) => s.currentUser.role);

  const rows = useMemo(() => projects
    .map((project) => evaluateProjectRecRoi({
      project, records, pdds, methodologies, factors, assumptions: settings,
      setting: projectSettings.find((p) => p.project_id === project.id),
      latestRequestType: recIssues.find((r) => r.project_id === project.id)?.request_type,
    }))
    .filter((r) => r.eligible),
  [projects, records, pdds, methodologies, factors, settings, projectSettings, recIssues]);

  // Spec §2.2: verifiers never see REC commercial data. (Hooks above run unconditionally.)
  if (role === 'verifier') {
    return (
      <div>
        <PageHeader title="REC ROI" subtitle="ความคุ้มค่าของการลงทะเบียน I-REC(E) — ต่อโปรเจกต์" />
        <Card>
          <CardBody>
            <p className="text-sm text-ink-secondary">หน้านี้สำหรับผู้พัฒนาโครงการและผู้ดูแลองค์กร — ผู้ตรวจสอบไม่มีสิทธิ์ดูข้อมูลราคา REC</p>
          </CardBody>
        </Card>
      </div>
    );
  }

  const totalRecs = rows.reduce((s, r) => s + (r.annual.status === 'ok' ? r.annual.annual_mwh : 0), 0);

  return (
    <div>
      <PageHeader
        title="REC ROI"
        subtitle="ความคุ้มค่าของการลงทะเบียน I-REC(E) — ต่อโปรเจกต์"
        action={<LinkButton to="/reports/investor" variant="secondary"><FileDown size={16} aria-hidden /> ดาวน์โหลดรายงานนักลงทุน</LinkButton>}
      />
      <RecRoiAssumptions />
      <Card>
        <CardHeader title="พอร์ตโปรเจกต์" action={<span className="text-xs text-ink-secondary">รวม {formatNumber(totalRecs, 1)} REC/ปี</span>} />
        <CardBody className="p-0">
          <Table>
            <THead>
              <TR>
                <TH>โปรเจกต์</TH>
                <TH className="text-right">MWh/ปี</TH>
                <TH className="text-right">คุ้มทุน · เปิดบัญชีเอง (฿/MWh)</TH>
                <TH className="text-right">คุ้มทุน · ขายผ่าน GEM (฿/MWh)</TH>
                <TH className="text-right">ROI @ราคากลาง</TH>
                <TH>แนะนำ</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((r) => {
                const roi = r.roi;
                const best = roi?.recommended ? roi[roi.recommended] : null;
                const mid = best?.status === 'ok' ? best.scenarios.find((s) => s.scenario === 'mid') : undefined;
                const rec = roi ? recommendationBadge(roi) : null;
                return (
                  <TR key={r.project.id} hover>
                    <TD className="font-medium">
                      <Link to={`/projects/${r.project.id}?tab=rec-roi`} className="text-petrol-700 hover:underline">{r.project.name}</Link>
                    </TD>
                    {r.annual.status !== 'ok' ? (
                      <TD className="text-ink-meta" colSpan={5}>ไม่มีข้อมูล kWh — <Link to="/upload" className="text-petrol-700 hover:underline">อัปโหลดข้อมูลการผลิต</Link>ก่อน</TD>
                    ) : (
                      <>
                        <TD className="text-right">
                          {formatNumber(r.annual.annual_mwh, 1)}
                          {r.annual.partial && <div className="mt-1"><Badge tone="amber" className="whitespace-nowrap">ข้อมูล {r.annual.coverage_days} วัน</Badge></div>}
                        </TD>
                        <TD className="text-right">{roi ? breakEvenText(roi.own) : '—'}</TD>
                        <TD className="text-right">{roi ? breakEvenText(roi.platform) : '—'}</TD>
                        <TD className={`text-right ${mid && mid.net_thb < 0 ? 'text-state-rejected' : ''}`}>{mid ? pct(mid.roi_pct) : '—'}</TD>
                        <TD>
                          {rec ? <Badge tone={rec.tone} className="whitespace-nowrap">{rec.text}</Badge> : '—'}
                        </TD>
                      </>
                    )}
                  </TR>
                );
              })}
            </TBody>
          </Table>
          <div className="border-t border-rule px-5 py-3 text-xs text-ink-meta">
            แสดงเฉพาะโปรเจกต์ผลิตไฟฟ้า (kWh) · ค่าธรรมเนียมตาม I-REC(E) Fee Structure {REC_FEES.version} (EGAT / Evident) ·
            MWh/ปี จากข้อมูลวัดจริง 365 วันล่าสุด
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
