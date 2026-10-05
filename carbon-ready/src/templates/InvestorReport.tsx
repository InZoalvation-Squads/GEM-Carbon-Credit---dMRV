import { Fragment, useMemo, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { ArrowLeft, Printer } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ReferenceLine, XAxis, YAxis } from 'recharts';
import { useStore } from '../store';
import { Button, LinkButton } from '../components/ui/Button';
import { buildPortfolioReport, buildProjectReport, recNetTotal, type ProjectReportData, type ReportSources } from '../lib/investor-report';
import { buildRecRoiSummary } from '../components/rec-roi/summary';
import { PATH_LABEL, PATH_SHORT, breakEvenText, paybackText, pct, pricePerMwh, signedThb, thb } from '../components/rec-roi/format';
import { REC_FEES } from '../data/rec-fees';
import { formatNumber, localIsoDate } from '../lib/format';
import { evaluateProjectRecRoi } from '../lib/rec-roi-project';
import type { RecPathOk, RecPathResult, RecRoiAssumptions } from '../lib/rec-roi';

// ============================================================
// Investor report — printable A4 pages (window.print() → "Save as PDF").
// Every number comes from lib/investor-report.ts (measured data + the same
// REC ROI evaluation the app pages use); nothing is typed in here.
// ============================================================

const SF04_QUOTE = 'warrants that the energy for which I-REC(E) certificates are being sought has not and will not be submitted for any other energy attribute tracking methodology, emissions reduction certificate, or carbon offset.';
const NO_ACCESS = 'หน้านี้สำหรับผู้พัฒนาโครงการและผู้ดูแลองค์กร — ผู้ตรวจสอบไม่มีสิทธิ์ดูข้อมูลราคา REC';
const GEM_GREEN = '#059669'; // brand-600, for chart fills
const WARN = '#b45309';      // amber-700, for the reference line
const TICK = { fontSize: 10, fill: '#64748b' }; // ink-500

const MISSING_PATH: Record<'missing_fx' | 'missing_fee', string> = {
  missing_fx: 'ยังไม่มีอัตรา EUR→THB',
  missing_fee: 'ยังไม่มีค่าบริการแพลตฟอร์ม',
};

function useReportSources(): ReportSources {
  const projects = useStore((s) => s.projects);
  const records = useStore((s) => s.records);
  const pdds = useStore((s) => s.pdds);
  const methodologies = useStore((s) => s.methodologies);
  const factors = useStore((s) => s.factors);
  const recIssues = useStore((s) => s.recIssues);
  const projectSettings = useStore((s) => s.recRoiProjectSettings);
  const assumptions = useStore((s) => s.recRoiSettings);
  const now = useMemo(() => new Date().toISOString(), []);
  return useMemo(
    () => ({ projects, records, pdds, methodologies, factors, recIssues, projectSettings, assumptions, now }),
    [projects, records, pdds, methodologies, factors, recIssues, projectSettings, assumptions, now],
  );
}

const PRINT_CSS = `
  .inv-doc { font-family: 'Inter','Anuphan',sans-serif; print-color-adjust: exact; -webkit-print-color-adjust: exact; counter-reset: invpage; }
  .inv-page { counter-increment: invpage; background: white; width: 210mm; min-height: 297mm; padding: 14mm 14mm 12mm; margin: 0 auto 1.5rem; box-shadow: 0 1px 3px rgb(15 23 42 / .12); position: relative; display: flex; flex-direction: column; }
  .inv-page > .inv-grow { flex: 1 1 auto; }
  .inv-pageno::after { content: counter(invpage); }
  @media print {
    @page { size: A4; margin: 0 }
    body { background: white }
    .inv-page { margin: 0; box-shadow: none; min-height: 296mm; break-after: page; }
    .inv-page:last-child { break-after: auto }
  }
`;

function ReportShell({ backTo, children }: { backTo: string; children: ReactNode }) {
  return (
    <div>
      <div className="mx-auto mb-4 flex max-w-[210mm] flex-wrap items-center justify-between gap-3 print:hidden">
        <LinkButton to={backTo} variant="secondary"><ArrowLeft size={16} /> กลับ</LinkButton>
        <Button onClick={() => window.print()}><Printer size={16} /> Print / PDF</Button>
      </div>
      <div className="inv-doc text-[12px] leading-relaxed text-ink-700">{children}</div>
      <style>{PRINT_CSS}</style>
    </div>
  );
}

function PageHeader({ title, subtitle, generatedAt }: { title: string; subtitle: string; generatedAt: string }) {
  return (
    <header className="mb-4 border-b-2 border-brand-600 pb-3">
      <div className="flex items-start justify-between gap-4">
        <span className="text-[11px] font-extrabold tracking-wide text-brand-700">GEM CARBON CREDIT</span>
        <span className="text-[11px] text-ink-500">สร้างเมื่อ {localIsoDate(generatedAt)}</span>
      </div>
      <h1 className="mt-1 text-xl font-semibold text-ink">{title}</h1>
      <p className="text-[12px] text-ink-600">{subtitle}</p>
    </header>
  );
}

function PageFooter({ generatedAt }: { generatedAt: string }) {
  return (
    <footer className="mt-4 flex items-center justify-between gap-4 border-t border-ink-200 pt-2 text-[10px] text-ink-500">
      <span>จัดทำจากข้อมูลวัดจริงในระบบ ณ วันที่ {localIsoDate(generatedAt)} · ค่าธรรมเนียม I-REC(E) Fee Structure {REC_FEES.version}</span>
      <span className="inv-pageno" />
    </footer>
  );
}

function Kpi({ label, value, unit, note }: { label: string; value: ReactNode; unit?: string; note?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] uppercase text-ink-500">{label}</div>
      <div className="text-2xl font-semibold tnum text-ink">{value}</div>
      {unit && <div className="text-xs text-ink-500">{unit}</div>}
      {note && <div className="text-[11px] text-ink-500">{note}</div>}
    </div>
  );
}

const KpiStrip = ({ children }: { children: ReactNode }) => (
  <div className="mb-4 grid grid-cols-4 gap-4 border-b border-ink-200 pb-4">{children}</div>
);

const SectionTitle = ({ children }: { children: ReactNode }) => (
  <h2 className="mb-1.5 text-[13px] font-semibold text-ink">{children}</h2>
);

const TH = ({ children, right }: { children: ReactNode; right?: boolean }) => (
  <th className={`border-b border-ink-300 px-2 py-1.5 text-[11px] font-semibold text-ink-600 ${right ? 'text-right' : 'text-left'}`}>{children}</th>
);
const TD = ({ children, right, className = '' }: { children: ReactNode; right?: boolean; className?: string }) => (
  <td className={`border-b border-ink-100 px-2 py-1.5 align-top ${right ? 'text-right tnum' : ''} ${className}`}>{children}</td>
);

const waiting = <span className="text-ink-500">รอราคา REC</span>;
const negative = (n: number | null) => (n !== null && n < 0 ? 'text-red-700' : '');

function pathMid(p: RecPathResult) {
  return p.status === 'ok' ? p.scenarios.find((s) => s.scenario === 'mid') : undefined;
}

function PathColumn({ result }: { result: RecPathResult }) {
  const mid = pathMid(result);
  return (
    <div className="min-w-0 border border-ink-200 p-3">
      <div className="mb-1.5 text-[12px] font-semibold text-ink">{PATH_LABEL[result.path]}</div>
      {result.status !== 'ok' ? (
        <p className="text-ink-500">{MISSING_PATH[result.status]}</p>
      ) : (
        <dl className="grid grid-cols-2 gap-x-3 gap-y-0.5">
          <dt className="text-ink-600">ราคาคุ้มทุน</dt>
          <dd className="text-right tnum text-ink">{breakEvenText(result)} ฿/MWh</dd>
          <dt className="text-ink-600">สุทธิ @ราคากลาง</dt>
          <dd className={`text-right tnum ${negative(mid?.net_thb ?? null)}`}>{mid ? thb(mid.net_thb) : waiting}</dd>
          <dt className="text-ink-600">คืนทุน</dt>
          <dd className="text-right">{mid ? paybackText(mid.payback_months) : waiting}</dd>
        </dl>
      )}
    </div>
  );
}

const irrText = (v: number | null) => (v === null ? '—' : `${formatNumber(v, 2)}%`);
const yearsText = (v: number | null) => (v === null ? '—' : `${formatNumber(v, 1)} ปี`);

/** Page 1 of a project: how much money REC makes (or the price it needs to). */
function MoneyPage({ data, assumptions }: { data: ProjectReportData; assumptions: RecRoiAssumptions }) {
  const { project, roi: r, generated_at } = data;
  const roi = r.roi;
  const annual = r.annual;
  const summary = buildRecRoiSummary(r, assumptions);
  if (!roi || annual.status !== 'ok' || !summary) return null;
  const { money } = summary;
  const ok = [roi.own, roi.platform].filter((p): p is RecPathOk => p.status === 'ok');
  const cheapest = ok.reduce<RecPathOk | null>((m, p) => (m === null || p.break_even_price_thb < m.break_even_price_thb ? p : m), null);
  const best = roi.recommended ? ok.find((p) => p.path === roi.recommended) : undefined;
  const midRoi = best?.scenarios.find((s) => s.scenario === 'mid')?.roi_pct ?? null;
  const rows: Array<[string, number, number | null, number | null]> = [
    ['ต่อปี', money.without_year, money.with_year, money.rec_year],
    [`รวม ${money.years} ปี`, money.without_total, money.with_total, money.rec_total],
  ];
  const u = r.uplift;
  const recNote = roi.recommended && assumptions.price_mid_thb !== null
    ? ` (${PATH_SHORT[roi.recommended]} ที่ราคากลาง ${pricePerMwh(assumptions.price_mid_thb)} ฿/MWh)` : '';

  return (
    <section className="inv-page">
      <PageHeader
        title={`การเงิน REC · ${project.name}`}
        subtitle={`${project.location} · ${formatNumber(project.capacity_kwp, 0)} kWp · ข้อมูล ${annual.window_start} – ${annual.window_end}${annual.partial ? ` (ข้อมูล ${annual.coverage_days} วัน ประมาณเป็นรายปี)` : ''}`}
        generatedAt={generated_at}
      />
      <div className="inv-grow space-y-4">
        <div className="grid grid-cols-[auto_1fr] items-center gap-6 border border-ink-200 p-4">
          <div>
            {money.rec_year !== null ? (
              <>
                <div className={`text-4xl font-semibold tnum ${negative(money.rec_year) || 'text-brand-700'}`}>{signedThb(money.rec_year)}</div>
                <div className="text-xs text-ink-500">บาท/ปี จาก REC</div>
              </>
            ) : (
              <>
                <div className="text-4xl font-semibold tnum text-ink">{cheapest ? pricePerMwh(cheapest.break_even_price_thb) : '—'}</div>
                <div className="text-xs text-ink-500">฿/MWh ราคาคุ้มทุน</div>
              </>
            )}
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-semibold text-ink-500">{summary.label}</div>
            <p className="text-[13px] font-medium leading-relaxed text-ink">{summary.headline}</p>
          </div>
        </div>

        <KpiStrip>
          <Kpi label="MWh/ปี" value={formatNumber(annual.annual_mwh, 1)} />
          <Kpi label="REC/ปี" value={formatNumber(annual.annual_mwh, 0)} />
          <Kpi label="ราคาคุ้มทุน ข" value={breakEvenText(roi.platform)} unit="฿/MWh" />
          <Kpi label="ROI @ราคากลาง" value={pct(midRoi)} />
        </KpiStrip>

        <div>
          <SectionTitle>ผลิตไฟรายเดือน (kWh)</SectionTitle>
          <BarChart width={680} height={170} data={data.monthly} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
            <CartesianGrid vertical={false} stroke="#e2e8f0" />
            <XAxis dataKey="month" tick={TICK} tickLine={false} />
            <YAxis tick={TICK} tickLine={false} axisLine={false} tickFormatter={(v: number) => formatNumber(v)} />
            <Bar dataKey="kwh" fill={GEM_GREEN} isAnimationActive={false} />
          </BarChart>
          <p className="text-[11px] text-ink-500">ข้อมูลวัดจริงจากมิเตอร์ (รายวัน รวมเป็นรายเดือน) — เดือนแรก/สุดท้ายอาจไม่เต็มเดือน</p>
        </div>

        <div>
          <SectionTitle>ตัวเงิน: มี REC กับไม่มี REC</SectionTitle>
          <table className="w-full border-collapse">
            <thead>
              <tr><TH>ตัวเงิน</TH><TH right>ไม่มี REC</TH><TH right>มี REC</TH><TH right>ส่วนต่าง (REC สุทธิ)</TH></tr>
            </thead>
            <tbody>
              {rows.map(([label, without, withRec, rec]) => (
                <tr key={label}>
                  <TD className="font-medium text-ink">{label}</TD>
                  <TD right>{thb(without)}</TD>
                  <TD right className="font-medium text-ink">{withRec === null ? waiting : thb(withRec)}</TD>
                  <TD right className={negative(rec)}>{rec === null ? waiting : signedThb(rec)}</TD>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1 text-[11px] text-ink-500">
            ไม่มี REC = มูลค่าไฟฟ้าที่ผลิตได้จริง × ค่าไฟ {formatNumber(money.tariff.value, 2)} ฿/kWh
            ({money.tariff.source === 'pdd' ? 'จาก PDD' : 'ค่าเริ่มต้น PEA'}) · มี REC = บวกรายได้ REC สุทธิหลังหักค่าธรรมเนียม{recNote} · ไม่คิดส่วนลดและการเสื่อมของแผง
          </p>
        </div>

        <div>
          <SectionTitle>เทียบเส้นทาง</SectionTitle>
          <div className="grid grid-cols-2 gap-3">
            <PathColumn result={roi.own} />
            <PathColumn result={roi.platform} />
          </div>
        </div>

        <div>
          <SectionTitle>IRR โครงการโซลาร์</SectionTitle>
          {u?.status === 'ok' ? (
            <p>
              ไม่มี REC <b className="text-ink">{irrText(u.without.irr_pct)}</b> (คืนทุน {yearsText(u.without.payback_years)})
              {' → '}มี REC <b className="text-ink">{irrText(u.with.irr_pct)}</b> (คืนทุน {yearsText(u.with.payback_years)})
            </p>
          ) : (
            <p className="text-ink-500">ขาดข้อมูลเงินลงทุน — ยังประเมิน IRR ไม่ได้</p>
          )}
        </div>
      </div>
      <PageFooter generatedAt={generated_at} />
    </section>
  );
}

/** Page 2 of a project: what the same MWh does for Scope 2 under T-VER vs REC. */
function Scope2Page({ data, years }: { data: ProjectReportData; years: number }) {
  const { project, roi, scope2, generated_at } = data;
  const { factor, tver } = scope2;
  const annual = roi.annual;
  const partialNote = annual.status === 'ok' && annual.partial ? ` · ข้อมูล ${annual.coverage_days} วัน ประมาณเป็นรายปี` : '';
  const net = recNetTotal(roi);
  return (
    <section className="inv-page">
      <PageHeader title={`Scope 2 ช่วยอะไร · ${project.name}`} subtitle={`${project.location} · ${formatNumber(project.capacity_kwp, 0)} kWp${partialNote}`} generatedAt={generated_at} />
      <div className="inv-grow space-y-4">
        <div className="border border-ink-200 p-4">
          {factor && scope2.tco2e_location_year !== null ? (
            <>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-semibold tnum text-brand-700">{formatNumber(scope2.tco2e_location_year, 2)}</span>
                <span className="text-xs text-ink-500">tCO₂e/ปี</span>
              </div>
              <p className="mt-1 text-ink">
                ลด Scope 2 แบบ location-based (สมมติใช้ไฟที่ผลิตเองทั้งหมด) · {formatNumber(scope2.annual_mwh, 1)} MWh × {factor.source} {factor.value_kg_per_kwh} kgCO₂e/kWh (มีผล {factor.effective_date})
              </p>
              <p className="text-[11px] text-ink-500">{factor.source_url}</p>
            </>
          ) : (
            <p className="text-ink">ไม่มีค่า EF Scope 2 สำหรับช่วงข้อมูลนี้</p>
          )}
        </div>

        <div>
          <SectionTitle>เลือกทางไหน ได้อะไร</SectionTitle>
          <table className="w-full border-collapse">
            <thead><tr><TH>ทาง</TH><TH>ได้อะไร</TH><TH>Scope 2 market-based / RE100</TH></tr></thead>
            <tbody>
              <tr>
                <TD className="font-medium text-ink">ออก T-VER</TD>
                <TD>{tver
                  ? `${formatNumber(tver.tco2e_year, 0)} tCO₂e/ปี (ปีแรกของช่วงคิดเครดิต · ตาม ${tver.methodology_code})`
                  : 'ไม่มี PDD T-VER ที่ registered'}</TD>
                <TD>ไม่ได้สิทธิ์ claim ว่าใช้ไฟสะอาด</TD>
              </tr>
              <tr>
                <TD className="font-medium text-ink">ออก REC แล้วขาย</TD>
                <TD className={negative(net)}>{net === null ? waiting : `${thb(net)} ใน ${years} ปี`}</TD>
                <TD>สิทธิ์ claim ไฟสะอาดไปอยู่กับผู้ซื้อ</TD>
              </tr>
              <tr>
                <TD className="font-medium text-ink">ออก REC แล้วเก็บไว้ redeem</TD>
                <TD>ไม่มีรายได้ — จ่ายค่าธรรมเนียม EGAT/Evident</TD>
                <TD>claim ไฟสะอาดได้ {formatNumber(scope2.recs_year, 1)} MWh/ปี · นับใน RE100</TD>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="border border-amber-600/30 bg-amber-50 p-3 text-amber-800">
          <p className="font-semibold">ไฟ MWh เดียวกันเลือกได้ทางเดียว: SF-04 ข้อรับรองของผู้ยื่น</p>
          <p className="mt-1 italic">“{SF04_QUOTE}”</p>
          <p className="mt-1 text-[11px]">(Evident SF-04 Issue Request v1.2.1)</p>
        </div>

        <div>
          <SectionTitle>ช่วยอะไรคุณ</SectionTitle>
          <ul className="list-disc space-y-1 pl-5">
            <li>ใช้ตัวเลขลด Scope 2 ในรายงาน ESG / CDP / SET (location-based)</li>
            <li>เก็บ REC ไว้ redeem เพื่อ claim ไฟสะอาดแบบ market-based และนับในเป้า RE100</li>
            <li>เลือก T-VER เมื่อเป้าหมายคือคาร์บอนเครดิต ไม่ใช่การ claim ไฟสะอาด</li>
          </ul>
        </div>

        <p className="text-ink-600">ไทยยังไม่มีค่า residual mix ทางการ — กรณีขาย REC จึงยังคำนวณ Scope 2 แบบ market-based เป็นตัวเลขไม่ได้</p>

        <div>
          <SectionTitle>แหล่งอ้างอิง</SectionTitle>
          <ul className="space-y-0.5 text-[11px] text-ink-600">
            <li>Fee Structure I-REC(E) 2026 — FN-01 {REC_FEES.version}</li>
            <li>Evident SF-04 Issue Request v1.2.1</li>
            <li>{factor ? `${factor.source} · ${factor.source_url}` : 'ค่า EF Scope 2 ของ TGO — ไม่มีค่าสำหรับโครงการนี้'}</li>
            <li>GHG Protocol Scope 2 Guidance (market-based method)</li>
          </ul>
        </div>
      </div>
      <PageFooter generatedAt={generated_at} />
    </section>
  );
}

/** Overview pagination: rows that fit under the KPI strip on page 1, then rows per continuation page. */
const OVERVIEW_FIRST_ROWS = 12;
const OVERVIEW_ROWS_PER_PAGE = 18;
/** Above this many projects the break-even chart gets its own page instead of sharing page 1. */
const OVERVIEW_CHART_OWN_PAGE_MIN = 8;
const CHART_MAX_HEIGHT = 760;

interface OverviewRow {
  project: ProjectReportData['project'];
  mwh: number;
  platform: RecPathResult | null;
  midRoi: number | null;
  label: string;
}

function RankingTable({ rows }: { rows: OverviewRow[] }) {
  return (
    <table className="w-full border-collapse">
      <thead>
        <tr className="whitespace-nowrap"><TH>โครงการ</TH><TH right>MWh/ปี</TH><TH right>คุ้มทุน ข (฿/MWh)</TH><TH right>ROI @กลาง</TH><TH>ผล</TH></tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.project.id}>
            <TD className="font-medium text-ink">{r.project.name}</TD>
            <TD right className="whitespace-nowrap">{formatNumber(r.mwh, 1)}</TD>
            <TD right className="whitespace-nowrap">{r.platform ? breakEvenText(r.platform) : '—'}</TD>
            <TD right className={`whitespace-nowrap ${negative(r.midRoi)}`}>{pct(r.midRoi)}</TD>
            <TD className="whitespace-nowrap">{r.label}</TD>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function BreakEvenChart({ chart, mid }: { chart: Array<{ name: string; be: number }>; mid: number | null }) {
  return (
    <div>
      <SectionTitle>ราคาคุ้มทุนผ่านแพลตฟอร์ม (฿/MWh)</SectionTitle>
      <BarChart layout="vertical" width={680} height={Math.min(CHART_MAX_HEIGHT, Math.max(160, 22 * chart.length + 40))} data={chart}
        margin={{ top: 4, right: 16, bottom: 0, left: 8 }}>
        <CartesianGrid horizontal={false} stroke="#e2e8f0" />
        <XAxis type="number" tick={TICK} tickLine={false}
          domain={[0, (max: number) => Math.max(max, mid ?? 0) * 1.1]} tickFormatter={(v: number) => formatNumber(v)} />
        <YAxis type="category" dataKey="name" width={200} tick={TICK} tickLine={false} interval={0} />
        <Bar dataKey="be" fill={GEM_GREEN} isAnimationActive={false} />
        {mid !== null && <ReferenceLine x={mid} stroke={WARN} label={{ value: 'ราคากลาง', fontSize: 10, fill: WARN }} />}
      </BarChart>
      <p className="text-[11px] text-ink-500">แท่งที่สั้นกว่าเส้นราคากลางคือโครงการที่คุ้มทุนที่ราคากลาง</p>
    </div>
  );
}

/** Overview: page 1 (KPIs + first rows), continuation pages for the rest of the table, and the chart. */
function PortfolioOverview({ data, assumptions, orgName }: {
  data: ReturnType<typeof buildPortfolioReport>; assumptions: RecRoiAssumptions; orgName: string;
}) {
  const { totals, projects, generated_at } = data;
  const rows: OverviewRow[] = projects.map((p) => {
    const roi = p.roi.roi;
    const best = roi?.recommended ? [roi.own, roi.platform].find((x): x is RecPathOk => x.status === 'ok' && x.path === roi.recommended) : undefined;
    return {
      project: p.project, mwh: p.scope2.annual_mwh,
      platform: roi?.platform ?? null,
      midRoi: best?.scenarios.find((s) => s.scenario === 'mid')?.roi_pct ?? null,
      label: buildRecRoiSummary(p.roi, assumptions)?.label ?? '—',
    };
  });
  const chart = rows.flatMap((r) => (r.platform?.status === 'ok' ? [{ name: r.project.name, be: r.platform.break_even_price_thb }] : []));
  const mid = assumptions.price_mid_thb;
  const partial = (n: number) => (n < totals.projects ? `${n} จาก ${totals.projects} โครงการ` : undefined);
  const windows = projects.flatMap((p) => (p.roi.annual.status === 'ok' ? [p.roi.annual] : []));
  const partialCount = windows.filter((a) => a.partial).length;
  const windowText = windows.length
    ? ` · ข้อมูล ${windows.reduce((m, a) => (a.window_start < m ? a.window_start : m), windows[0].window_start)} – ${windows.reduce((m, a) => (a.window_end > m ? a.window_end : m), windows[0].window_end)}`
    : '';
  const subtitle = `${orgName} · ${totals.projects} โครงการที่มีข้อมูลการผลิตวัดจริง${windowText} · จัดทำ ${localIsoDate(generated_at)}`;
  const chartOwnPage = chart.length > 0 && projects.length > OVERVIEW_CHART_OWN_PAGE_MIN;

  const chunks: OverviewRow[][] = [rows.slice(0, OVERVIEW_FIRST_ROWS)];
  for (let i = OVERVIEW_FIRST_ROWS; i < rows.length; i += OVERVIEW_ROWS_PER_PAGE) chunks.push(rows.slice(i, i + OVERVIEW_ROWS_PER_PAGE));

  return (
    <>
      <section className="inv-page">
        <PageHeader title="ภาพรวมพอร์ต · รายงานนักลงทุน REC และ Scope 2" subtitle={subtitle} generatedAt={generated_at} />
        <div className="inv-grow space-y-4">
          {projects.length === 0 ? (
            <p className="text-ink-600">ยังไม่มีโครงการที่มีข้อมูลการผลิต</p>
          ) : (
            <>
              <KpiStrip>
                <Kpi label="MWh/ปี" value={formatNumber(totals.mwh_year, 1)} />
                <Kpi label="REC/ปี" value={formatNumber(totals.recs_year, 0)} />
                <Kpi label={`REC สุทธิ ${assumptions.horizon_years} ปี`}
                  value={totals.rec_net_total === null ? waiting : <span className={negative(totals.rec_net_total)}>{signedThb(totals.rec_net_total)}</span>}
                  unit={totals.rec_net_total === null ? undefined : `ใน ${assumptions.horizon_years} ปี`}
                  note={totals.rec_net_total === null ? undefined : partial(totals.rec_net_projects)} />
                <Kpi label="tCO₂e/ปี (location-based)"
                  value={totals.tco2e_location_year === null ? '—' : formatNumber(totals.tco2e_location_year, 2)}
                  note={totals.tco2e_location_year === null ? undefined : partial(totals.tco2e_projects)} />
              </KpiStrip>
              {partialCount > 0 && (
                <p className="-mt-2 text-[11px] text-ink-500">{partialCount} จาก {windows.length} โครงการใช้ข้อมูลไม่ครบปี — ตัวเลขรายปีประมาณจากข้อมูลที่มี</p>
              )}
              <div>
                <SectionTitle>เรียงตามโครงการ</SectionTitle>
                <RankingTable rows={chunks[0]} />
              </div>
              {!chartOwnPage && chart.length > 0 && <BreakEvenChart chart={chart} mid={mid} />}
            </>
          )}
        </div>
        <PageFooter generatedAt={generated_at} />
      </section>
      {chunks.slice(1).map((chunk, i) => (
        <section className="inv-page" key={`rows-${i}`}>
          <PageHeader title="ภาพรวมพอร์ต (ต่อ)" subtitle={`เรียงตามโครงการ (ต่อ) · ${orgName}`} generatedAt={generated_at} />
          <div className="inv-grow"><RankingTable rows={chunk} /></div>
          <PageFooter generatedAt={generated_at} />
        </section>
      ))}
      {chartOwnPage && (
        <section className="inv-page">
          <PageHeader title="ภาพรวมพอร์ต (ต่อ)" subtitle={`ราคาคุ้มทุนต่อโครงการ · ${orgName}`} generatedAt={generated_at} />
          <div className="inv-grow"><BreakEvenChart chart={chart} mid={mid} /></div>
          <PageFooter generatedAt={generated_at} />
        </section>
      )}
    </>
  );
}

const Notice = ({ children }: { children: ReactNode }) => (
  <div className="mx-auto max-w-[210mm] border border-ink-200 bg-white p-6 text-sm text-ink-600">{children}</div>
);

export function InvestorProjectReport() {
  const { projectId = '' } = useParams();
  const sources = useReportSources();
  const role = useStore((s) => s.currentUser.role);
  const { data, eligible } = useMemo(() => {
    const d = buildProjectReport({ ...sources, projectId });
    const project = sources.projects.find((p) => p.id === projectId);
    const elig = d !== null || (project
      ? evaluateProjectRecRoi({
        project, records: sources.records, pdds: sources.pdds, methodologies: sources.methodologies,
        factors: sources.factors, assumptions: sources.assumptions,
        setting: sources.projectSettings.find((s) => s.project_id === project.id),
      }).eligible
      : false);
    return { data: d, eligible: elig };
  }, [sources, projectId]);

  if (role === 'verifier') return <Notice>{NO_ACCESS}</Notice>;
  if (!data) {
    return <Notice>{eligible ? 'ยังไม่มีข้อมูลการผลิต' : 'REC ใช้กับโปรเจกต์ผลิตไฟฟ้าเท่านั้น (methodology ที่วัดเป็น kWh)'}</Notice>;
  }
  return (
    <ReportShell backTo={`/projects/${projectId}?tab=rec-roi`}>
      <MoneyPage data={data} assumptions={sources.assumptions} />
      <Scope2Page data={data} years={sources.assumptions.horizon_years} />
    </ReportShell>
  );
}

export function InvestorPortfolioReport() {
  const sources = useReportSources();
  const role = useStore((s) => s.currentUser.role);
  const orgName = useStore((s) => s.organization.name);
  const data = useMemo(() => buildPortfolioReport(sources), [sources]);

  if (role === 'verifier') return <Notice>{NO_ACCESS}</Notice>;
  return (
    <ReportShell backTo="/rec-roi">
      <PortfolioOverview data={data} assumptions={sources.assumptions} orgName={orgName} />
      {data.projects.map((p) => (
        <Fragment key={p.project.id}>
          <MoneyPage data={p} assumptions={sources.assumptions} />
          <Scope2Page data={p} years={sources.assumptions.horizon_years} />
        </Fragment>
      ))}
    </ReportShell>
  );
}
