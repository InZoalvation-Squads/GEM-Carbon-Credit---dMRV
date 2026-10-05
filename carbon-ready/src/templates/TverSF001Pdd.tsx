import { Fragment, useEffect, useState, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { Printer, ArrowLeft } from 'lucide-react';
import { useStore } from '../store';
import { Button, LinkButton } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { computeYearlyTable, computeEcPj, consumerKwh, resolveComputed, documentCapacityKwp, creditingStartYear } from '../lib/pdd';
import { parseSites, isBundle, sumSiteCapacityKwp, sumSiteYear1Kwh, siteGenerationMatrix } from '../lib/pdd-sites';
import { serverMode, evidenceApi } from '../lib/server-api';
import { draftActivityText } from '../lib/pdd-drafts';
import type { EvidenceFile, PddComputedSource } from '../types';

// ============================================================
// T-VER-S-F001-PDD — official TGO single-project PDD layout.
// Static Thai boilerplate (applicability, emission sources, monitoring
// parameter cards) is identical for every T-VER-S-METH-01-01 solar project and lives here;
// dynamic values come from the PDD's section_data + the calc engine.
// ============================================================

const FORM_CODE = 'T-VER-S-F001-PDD';
const FORM_VERSION = 'VERSION 2.1';

/** ประเภทโครงการ — the official form's full checkbox list (p.2-3). */
const PROJECT_TYPES = [
  'พลังงานหมุนเวียนหรือพลังงานที่ใช้ทดแทนเชื้อเพลิงฟอสซิล',
  'การเพิ่มประสิทธิภาพในการผลิตไฟฟ้าและการผลิตความร้อน',
  'การใช้ระบบขนส่งสาธารณะ',
  'การใช้ยานพาหนะไฟฟ้า',
  'การเพิ่มประสิทธิภาพเครื่องยนต์',
  'การเพิ่มประสิทธิภาพการใช้พลังงานในอาคารและโรงงาน และในครัวเรือน',
  'การปรับเปลี่ยนสารทำความเย็นธรรมชาติ',
  'การใช้วัสดุทดแทนปูนเม็ด',
  'การจัดการขยะมูลฝอย',
  'การจัดการน้ำเสียชุมชน',
  'การนำก๊าซมีเทนกลับมาใช้ประโยชน์',
  'การจัดการน้ำเสียอุตสาหกรรม',
  'การลด ดูดซับ และการกักเก็บก๊าซเรือนกระจกจากภาคป่าไม้และการเกษตร',
  'การดักจับ กักเก็บ และ/หรือการใช้ประโยชน์จากก๊าซเรือนกระจก',
  'อื่นๆ',
] as const;

/**
 * §4.1 รายละเอียดแผนการบำรุงรักษาประจำปี — the aggregated reference's nine
 * maintenance topics (p.22-23). Identical for every solar-PV T-VER project, so it
 * is boilerplate here rather than section_data. แบบควบรวม only.
 */
const MAINTENANCE_TOPICS: ReadonlyArray<{ topic: string; items: readonly string[] }> = [
  {
    topic: 'แผงเซลล์แสงอาทิตย์ (Solar Panel)',
    items: [
      'ตรวจสอบสภาพทั่วไปของแผงเซลล์แสงอาทิตย์',
      'ตรวจสอบจุด Hot Spot ของแผงเซลล์แสงอาทิตย์ หรือ เซลล์ที่เสียหาย',
      'ตรวจสอบโครงสร้างของแผงเซลล์แสงอาทิตย์',
      'ล้างแผงเซลล์แสงอาทิตย์',
    ],
  },
  {
    topic: 'โครงสร้างรองรับแผงเซลล์แสงอาทิตย์',
    items: ['ตรวจสอบการจัดยึดกับแผงเซลล์แสงอาทิตย์', 'ตรวจสอบสภาพหลังคา รอยรั่ว และจุดจับยึด', 'ตรวจสอบระบบ Grounding'],
  },
  {
    topic: 'DC Combiner Box',
    items: [
      'ตรวจสอบสภาพโดยรวม',
      'ตรวจสอบสภาพของป้าย และ Equipment Tag',
      'ตรวจสอบสภาพสายไฟและจุดต่อสายต่างๆ',
      'ตรวจสอบสภาพกระบอกฟิวส์ DC',
      'ตรวจสอบความต่อเนื่องของ DC Fuse',
      'ทำความสะอาดภายในและภายนอกตู้',
    ],
  },
  {
    topic: 'อินเวอร์เตอร์ (Inverter)',
    items: [
      'ตรวจสอบสภาพความสมบูรณ์',
      'ตรวจสอบสภาพความสมบูรณ์ของแผ่นป้ายชื่อต่างๆ',
      'ตรวจสอบสภาพทั่วไปของสายไฟและเทอร์มินอล',
      'ตรวจสอบการทำงานของระบบระบายอากาศ',
      'ตรวจสอบอุณหภูมิภายในอุปกรณ์',
      'ตรวจสอบไฟแสดงสถานะ',
      'ตรวจวัดกระแสไฟฟ้ากระแสตรง-กระแสสลับ',
      'ทำความสะอาดอินเวอร์เตอร์ และระบบระบายอากาศ',
      'ทำความสะอาดห้องอินเวอร์เตอร์',
    ],
  },
  {
    topic: 'Solar Distribution Panel',
    items: [
      'ตรวจสอบสภาพทั่วไปของอุปกรณ์',
      'ตรวจสอบสภาพทั่วไปของป้ายชื่อของอุปกรณ์',
      'ตรวจสอบสภาพทั่วไปของสายไฟ บัสบาร์ และเทอร์มินอลภายในตู้ไฟฟ้า',
      'ตรวจสอบความแน่นของจุดเชื่อมต่อสายไฟฟ้าและอุปกรณ์ต่างๆ',
      'ทดสอบการเปิด-ปิดการทำงานของ Circuit Breaker / Trip Testing',
      'ตรวจสอบไฟแสดงสถานะของตู้ไฟฟ้า',
      'ตรวจสอบอุณหภูมิขณะใช้งานของอุปกรณ์ต่างๆ',
      'ทำความสะอาดภายในและภายนอกตู้',
      'ทำความสะอาดห้องไฟฟ้า',
    ],
  },
  {
    topic: 'เครื่องมือวัดคุณภาพไฟฟ้า (PQM)',
    items: [
      'ตรวจสอบสภาพทั่วไปของอุปกรณ์ภายใน',
      'ตรวจสอบสภาพทั่วไปของป้ายชื่อของอุปกรณ์',
      'ตรวจสอบสภาพทั่วไปของสายไฟ บัสบาร์ และเทอร์มินอลภายในตู้ PQM',
      'ตรวจสอบความแน่นของจุดเชื่อมต่อสายไฟฟ้าและอุปกรณ์ต่างๆ',
      'ทำความสะอาดภายในและภายนอกตู้',
      'ตรวจสอบหน้าจอแสดงผล',
    ],
  },
  {
    topic: 'Datalogger และ Monitoring',
    items: [
      'ตรวจสอบสภาพทั่วไปของอุปกรณ์ภายใน',
      'ตรวจสอบสภาพทั่วไปของป้ายชื่อของอุปกรณ์',
      'ตรวจสอบสภาพทั่วไปของสายไฟ บัสบาร์ และเทอร์มินอลภายในตู้',
      'ตรวจสอบความแน่นของจุดเชื่อมต่อสายไฟฟ้าและอุปกรณ์ต่างๆ',
      'ทำความสะอาดภายในและภายนอกตู้',
    ],
  },
  {
    topic: 'ระบบน้ำทำความสะอาดแผงเซลล์แสงอาทิตย์',
    items: [
      'ตรวจสอบสภาพทั่วไปและการเปิดปิดของก๊อกน้ำ',
      'ตรวจสอบสภาพทั่วไปของท่อน้ำและข้อต่อต่างๆ ถังเก็บน้ำ และลูกลอย',
      'ตรวจสอบสภาพทั่วไปของการใช้งานของเครื่องสูบน้ำ',
    ],
  },
  {
    topic: 'สถานีวัดสภาพอากาศ',
    items: [
      'ตรวจสอบความสมบูรณ์ทั่วไปของเครื่องวัดความเข้มแสง (Pyranometer)',
      'ตรวจสอบความสะอาดเครื่องวัดความเข้มแสง (Pyranometer)',
      'ตรวจสอบมุมรับแสงเครื่องวัดความเข้มแสง (Pyranometer)',
    ],
  },
];

const fmt = (n: number, d = 2) => n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtInt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 0 });

/**
 * ภาคผนวก per-site equipment block — the appendix lists each site's kit under
 * fixed official labels, so free-text `item` values are bucketed by keyword.
 * `อื่นๆ` is the catch-all: an unrecognised item is still the operator's data
 * and must reach the reviewer rather than be silently dropped.
 */
const APPENDIX_EQUIPMENT_ROWS: ReadonlyArray<{ label: string; match: readonly string[] }> = [
  { label: 'แผงเซลล์แสงอาทิตย์ (Solar Panel)', match: ['แผง', 'Panel'] },
  { label: 'อินเวอร์เตอร์ (Inverter)', match: ['อินเวอร์', 'Inverter'] },
  { label: 'เครื่องวัดไฟฟ้า (Energy Meter)', match: ['เครื่องวัด', 'มิเตอร์', 'Meter'] },
];

/** Index of the APPENDIX_EQUIPMENT_ROWS bucket an item falls in, or -1 for อื่นๆ. */
function appendixEquipmentCategory(item: string): number {
  const lower = item.toLowerCase();
  return APPENDIX_EQUIPMENT_ROWS.findIndex((c) => c.match.some((m) => lower.includes(m.toLowerCase())));
}

/** Lines stacked with <br/>, or '-' for an empty list. */
function stackedLines(lines: string[]): ReactNode {
  if (lines.length === 0) return '-';
  return lines.map((t, i) => <Fragment key={i}>{i > 0 && <br />}{t}</Fragment>);
}

const cellStr = (v: unknown): string => (v === undefined || v === null || v === '' ? '' : String(v));

/**
 * ตารางที่ 2 cell: `brand / model / spec` per row (empty parts dropped), one
 * line per item. `withItem` prefixes the free-text item name — used for the
 * อื่นๆ column, where the category label does not say what the thing is.
 */
function equipmentNameLines(rows: Array<Record<string, unknown>>, withItem = false): ReactNode {
  return stackedLines(rows.map((r) => {
    const parts = [cellStr(r.brand), cellStr(r.model), cellStr(r.spec)].filter((p) => p !== '');
    const name = parts.length > 0 ? parts.join(' / ') : '-';
    return withItem && cellStr(r.item) !== '' ? `${cellStr(r.item)}: ${name}` : name;
  }));
}

/** ตารางที่ 2 count cell: one line per item, '-' where a row carries no qty. */
function equipmentQtyLines(rows: Array<Record<string, unknown>>): ReactNode {
  return stackedLines(rows.map((r) => (cellStr(r.qty) === '' ? '-' : fmtInt(Number(r.qty)))));
}

/**
 * Appendix support-equipment cell. Operators type these as `Brand / Model`
 * (the ตารางที่ 3 convention); the appendix prints `ยี่ห้อ Brand รุ่น Model`,
 * one line per entry (entries split on newlines or ';'). Text without the
 * separator is the operator's own and prints as typed.
 */
function supportEquipmentValue(v: unknown): ReactNode {
  const s = cellStr(v);
  if (s === '') return '-';
  const lines = s.split(/\r?\n|;/).map((t) => t.trim()).filter((t) => t !== '');
  return stackedLines(lines.map((line) => {
    const parts = line.split(' / ').map((p) => p.trim());
    return parts.length >= 2 ? `ยี่ห้อ ${parts[0]} รุ่น ${parts.slice(1).join(' / ')}` : line;
  }));
}

/** `ยี่ห้อ <brand> รุ่น <model>` per matching row, or '-' when the site has none. */
function appendixEquipmentValue(rows: Array<Record<string, unknown>>): ReactNode {
  if (rows.length === 0) return '-';
  return rows.map((r, i) => {
    const brand = r.brand === undefined || r.brand === null || r.brand === '' ? '-' : String(r.brand);
    const model = r.model === undefined || r.model === null || r.model === '' ? '-' : String(r.model);
    return (
      <Fragment key={i}>
        {i > 0 && <br />}
        {`ยี่ห้อ ${brand} รุ่น ${model}`}
      </Fragment>
    );
  });
}

function thaiDate(iso: unknown): string {
  if (typeof iso !== 'string' || !iso) return '-';
  const dt = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(dt.getTime())) return String(iso);
  return dt.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** `1 มกราคม พ.ศ. 2570` — the official form writes the era out in date ranges (year-only th-TH already reads "พ.ศ. 2570"). */
function thaiDateBE(dt: Date): string {
  return `${dt.toLocaleDateString('th-TH', { day: 'numeric', month: 'long' })} ${dt.toLocaleDateString('th-TH', { year: 'numeric' })}`;
}

/**
 * `7 ปี (1 มกราคม พ.ศ. 2570 ถึง 31 ธันวาคม พ.ศ. 2576)` — the crediting period
 * as the official form states it: start date to the day before the same date
 * `years` later. Falls back to the bare year count without a valid start.
 */
function creditingPeriodLabel(years: string, startIso: unknown): string {
  if (typeof startIso !== 'string' || !startIso) return `${years} ปี`;
  const start = new Date(`${startIso}T00:00:00`);
  const n = Number(years);
  if (Number.isNaN(start.getTime()) || !Number.isFinite(n) || n <= 0) return `${years} ปี`;
  const end = new Date(start);
  end.setFullYear(end.getFullYear() + n);
  end.setDate(end.getDate() - 1);
  return `${years} ปี (${thaiDateBE(start)} ถึง ${thaiDateBE(end)})`;
}

function Check({ on, children }: { on: boolean; children: ReactNode }) {
  return (
    <div className="flex items-start gap-1.5">
      <span className="w-4 shrink-0 text-center leading-5">{on ? '☑' : '☐'}</span>
      <span>{children}</span>
    </div>
  );
}

function HeaderBox({ formLabel }: { formLabel: string }) {
  // Inline verticalAlign: the sheet-wide `.doc-table td { vertical-align: top }`
  // outranks Tailwind's align-middle utility, so the logo/code/page cells pin
  // their centering here. Page number comes from the `formpage` CSS counter.
  const middle = { verticalAlign: 'middle' as const };
  return (
    <table className="doc-table mb-3 w-full">
      <tbody>
        <tr>
          <td rowSpan={3} className="w-20 text-center" style={middle}>
            <img src="/tgo-logo-notext.svg" alt="T-VER" className="mx-auto h-12 w-auto" />
          </td>
          <td>โครงการลดก๊าซเรือนกระจกภาคสมัครใจตามมาตรฐานของประเทศไทย</td>
          <td rowSpan={2} className="w-40 text-center" style={middle}>{FORM_CODE}</td>
          <td rowSpan={3} className="w-[70px] p-1 text-center" style={middle}>
            <span className="pageno">หน้า</span>
          </td>
        </tr>
        <tr><td>Standard T-VER</td></tr>
        <tr>
          <td>เอกสารข้อเสนอโครงการ (PDD) {formLabel}</td>
          <td className="text-center">{FORM_VERSION}</td>
        </tr>
      </tbody>
    </table>
  );
}

/**
 * รหัส / เวอร์ชั่น / ชื่อระเบียบวิธีฯ header block — the official form repeats it
 * above §2.2 and each §3 calculation, followed by the equation lines.
 */
function MethodBlock({ code, version, name, testId, children }: {
  code: string; version: string; name: string; testId: string; children?: ReactNode;
}) {
  return (
    <div data-testid={testId} className="mt-1 border border-[#333] px-2 py-1">
      <p>รหัส: {code}</p>
      <p>เวอร์ชั่น: {version}</p>
      <p>ชื่อระเบียบวิธีฯ: {name}</p>
      {children}
    </div>
  );
}

/** `(1/1/2570 – 31/12/2570)` — crediting year n's calendar span, Buddhist era, as §3.5 prints it. */
function creditingYearRange(startIso: unknown, n: number): string {
  if (typeof startIso !== 'string' || !startIso) return '';
  const start = new Date(`${startIso}T00:00:00`);
  if (Number.isNaN(start.getTime())) return '';
  const from = new Date(start);
  from.setFullYear(from.getFullYear() + n - 1);
  const to = new Date(start);
  to.setFullYear(to.getFullYear() + n);
  to.setDate(to.getDate() - 1);
  const dmy = (dt: Date) => `${dt.getDate()}/${dt.getMonth() + 1}/${dt.getFullYear() + 543}`;
  return `(${dmy(from)} – ${dmy(to)})`;
}

function SectionBar({ children }: { children: ReactNode }) {
  return <div className="mb-2 mt-4 border border-[#333] bg-[#d9d9d9] px-2 py-1 font-bold">{children}</div>;
}

function Footer() {
  return (
    <div className="mt-4 border-t border-[#999] pt-1 text-[11px] text-[#555]">
      องค์การบริหารจัดการก๊าซเรือนกระจก (องค์การมหาชน)<br />
      Thailand Greenhouse Gas Management Organization (Public Organization)
    </div>
  );
}

/**
 * One form page. Rendered as a table so the TGO header (thead) and footer
 * (tfoot) repeat on every printed sheet when a section overflows one page —
 * the official form carries them on every page.
 */
function Page({ children, formLabel }: { children: ReactNode; formLabel: string }) {
  return (
    <table className="doc-page page-frame">
      <thead>
        <tr><td><HeaderBox formLabel={formLabel} /></td></tr>
      </thead>
      <tbody>
        <tr><td>{children}</td></tr>
      </tbody>
      <tfoot>
        <tr><td><Footer /></td></tr>
      </tfoot>
    </table>
  );
}

/** สารบัญ — the official form's contents page (print pagination is dynamic, so no page numbers). */
function TocPage({ formLabel }: { formLabel: string }) {
  const items = [
    'ส่วนที่ 1 รายละเอียดโครงการ',
    'ส่วนที่ 2 ระเบียบวิธีลดก๊าซเรือนกระจกภาคสมัครใจ',
    'ส่วนที่ 3 การคำนวณการลดก๊าซเรือนกระจก',
    'ส่วนที่ 4 แผนการติดตามผลการดำเนินโครงการ',
    'ภาคผนวก เอกสาร/หลักฐานประกอบ',
  ];
  return (
    <Page formLabel={formLabel}>
      <p className="text-center text-[16px] font-bold">สารบัญ</p>
      <div data-testid="toc" className="mx-auto mt-6 w-[85%]">
        {items.map((t) => (
          <p key={t} className="mb-3 border-b border-dotted border-[#999] pb-0.5">{t}</p>
        ))}
      </div>
    </Page>
  );
}

/**
 * รูปที่ 1 / ผังจุดตรวจวัด — the project-boundary block diagram: solar system
 * and meters inside a dashed boundary, consumer and PEA grid outside.
 */
function BoundaryDiagram({ capacityKwp, owner, bundle = false }: { capacityKwp: string; owner: string; bundle?: boolean }) {
  // Drawn in the reference figure's own coordinates so the geometry matches it:
  // solar → meter → consumer along the top, a branch down to the project's own
  // use, and the grid bus on the right feeding the consumer and (via the second
  // meter) the project. Arrowheads are plain polygons rather than <marker>s so
  // the two copies of this figure on one page never share an element id.
  const head = (x: number, y: number, dir: 'left' | 'right' | 'down') => {
    const p = dir === 'right' ? `${x},${y} ${x - 14},${y - 7} ${x - 14},${y + 7}`
      : dir === 'left' ? `${x},${y} ${x + 14},${y - 7} ${x + 14},${y + 7}`
      : `${x},${y} ${x - 7},${y - 14} ${x + 7},${y - 14}`;
    return <polygon points={p} fill="black" />;
  };
  // Box labels go through foreignObject so a long owner name wraps inside its box.
  const label = (x: number, y: number, w: number, h: number, bold: boolean, children: ReactNode, fontSize = 24) => (
    <foreignObject x={x} y={y} width={w} height={h}>
      <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', textAlign: 'center', fontSize, lineHeight: 1.3, fontWeight: bold ? 700 : 400, padding: '0 8px', boxSizing: 'border-box', overflowWrap: 'anywhere' }}>
        <span>{children}</span>
      </div>
    </foreignObject>
  );
  // Long owner names step the consumer label down so they stay inside the box.
  const ownerFont = bundle || owner.length <= 18 ? 24 : owner.length <= 30 ? 20 : 17;
  const rect = (x: number, y: number, w: number, h: number) => <rect x={x} y={y} width={w} height={h} fill="white" stroke="black" strokeWidth={2} />;
  return (
    <div data-testid="boundary-diagram" className="keep-together mx-auto my-2 w-[95%]">
      <svg viewBox="20 0 1240 360" className="block h-auto w-full" role="img" aria-label="ขอบเขตโครงการ">
        <text x={410} y={28} textAnchor="middle" fontSize={24}>ขอบเขตโครงการ</text>
        <rect x={40} y={45} width={740} height={280} rx={18} fill="none" stroke="black" strokeWidth={2.5} strokeDasharray="10 7" />

        {/* top row: solar → meter → EG_Consumer → consumer */}
        {rect(65, 70, 275, 100)}
        {/* แบบควบรวม (reference p.8): no capacity — the box stands for six systems. */}
        {label(65, 70, 275, 100, true, <>ระบบผลิตไฟฟ้าพลังงาน<br />แสงอาทิตย์{!bundle && ` ${capacityKwp} kW`}</>)}
        <line x1={340} y1={120} x2={616} y2={120} stroke="black" strokeWidth={2} />
        {head(630, 120, 'right')}
        {rect(630, 100, 110, 40)}
        {label(630, 100, 110, 40, true, 'มิเตอร์')}
        <line x1={740} y1={120} x2={906} y2={120} stroke="black" strokeWidth={2} />
        {head(920, 120, 'right')}
        <text x={752} y={108} fontSize={24} fontWeight={700}>
          EG<tspan fontSize={16} dy={6}>Consumer,PJ,y</tspan>
        </text>
        {rect(920, 65, 210, 110)}
        {/* แบบควบรวม: the consumers are the bundled sites' owners, not the
            developer, so the box carries the generic label as the reference does. */}
        {label(920, 65, 210, 110, true, <>ผู้ใช้ไฟฟ้า{!bundle && <><br />({owner})</>}</>, ownerFont)}

        {/* branch from the solar output down to the project's own use */}
        <line x1={460} y1={120} x2={460} y2={211} stroke="black" strokeWidth={2} />
        {head(460, 225, 'down')}
        {rect(330, 225, 240, 70)}
        {label(330, 225, 240, 70, true, bundle ? 'ใช้ในโครงการ' : 'ใช้เองในโครงการ')}

        {/* bottom row: grid → EC_PJ,y → meter → own use */}
        {rect(630, 245, 110, 40)}
        {label(630, 245, 110, 40, true, 'มิเตอร์')}
        <line x1={630} y1={265} x2={584} y2={265} stroke="black" strokeWidth={2} />
        {head(570, 265, 'left')}
        <line x1={1185} y1={265} x2={754} y2={265} stroke="black" strokeWidth={2} />
        {head(740, 265, 'left')}
        <text x={790} y={252} fontSize={24} fontWeight={700}>
          EC<tspan fontSize={16} dy={6}>PJ,y</tspan>
        </text>

        {/* grid bus feeding the consumer */}
        <line x1={1185} y1={70} x2={1185} y2={310} stroke="black" strokeWidth={2.5} />
        <line x1={1185} y1={150} x2={1144} y2={150} stroke="black" strokeWidth={2} />
        {head(1130, 150, 'left')}
        <text x={1250} y={350} textAnchor="end" fontSize={24}>ระบบสายส่ง {bundle ? 'PEA / MEA' : 'PEA'}</text>
      </svg>
    </div>
  );
}

/** แผนผังขั้นตอนการจัดเก็บข้อมูลและ QA/QC — four-step data-flow boxes. */
function DataFlowDiagram({ measurement }: { measurement: string }) {
  const steps = [
    `ไฟฟ้าที่ผลิตได้: ${measurement} · ไฟฟ้าที่ใช้ในโครงการ: คำนวณจากพิกัดกำลังไฟฟ้าของอุปกรณ์และบันทึกชั่วโมงการทำงาน`,
    'ข้อมูลจะถูกรวบรวมเป็นรายเดือนและตรวจสอบโดยเจ้าหน้าที่ที่ได้รับมอบหมาย',
    'ข้อมูลจะถูกทวนสอบโดยพนักงานระดับหัวหน้างานขึ้นไป',
    'ข้อมูลจะถูกส่งให้ทีมงานผู้ได้รับมอบหมายในการดำเนินโครงการ T-VER จัดทำรายงานติดตามผลต่อไป',
  ];
  return (
    <div data-testid="dataflow-diagram" className="keep-together mx-auto my-2 flex w-full items-stretch gap-1 text-[10.5px]">
      {steps.map((t, i) => (
        <Fragment key={i}>
          {i > 0 && <span className="self-center">→</span>}
          <div className="flex-1 border border-black p-1.5">{t}</div>
        </Fragment>
      ))}
    </div>
  );
}

/** Active image evidence of the project — the figures embedded in section 1. */
export function pddSiteImages(evidence: EvidenceFile[], projectId: string): EvidenceFile[] {
  return evidence.filter((e) => e.project_id === projectId && e.kind === 'image' && e.status === 'active');
}

/** Cover photo: the explicitly chosen evidence (section_data.cover_evidence_id), else the first site image. */
export function pickCoverImage(images: EvidenceFile[], coverId?: unknown): EvidenceFile | undefined {
  return images.find((img) => img.id === coverId) ?? images[0];
}

/**
 * Object URLs for a project's site-photo evidence. Bytes only exist behind
 * the server API, so URLs resolve in server mode only; local-store mode
 * carries evidence metadata without file content.
 */
function useSiteImages(projectId: string) {
  const evidence = useStore((s) => s.evidence);
  const images = pddSiteImages(evidence, projectId);
  const [urls, setUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!serverMode() || images.length === 0) return;
    let alive = true;
    const created: string[] = [];
    void (async () => {
      for (const img of images) {
        const blob = await evidenceApi.fileBlob(img.id);
        if (!alive) break;
        if (!blob) continue;
        const url = URL.createObjectURL(blob);
        created.push(url);
        setUrls((m) => ({ ...m, [img.id]: url }));
      }
    })();
    return () => {
      alive = false;
      created.forEach((u) => URL.revokeObjectURL(u));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, images.length]);

  return { images, urls };
}

/** ภาพประกอบการติดตั้ง — image evidence rendered as numbered figures (the cover photo is not repeated). */
function EvidenceFigures({ projectId, excludeId }: { projectId: string; excludeId?: string }) {
  const { images, urls } = useSiteImages(projectId);
  const shown = images.filter((img) => urls[img.id] && img.id !== excludeId);
  if (shown.length === 0) return null;
  return (
    <div className="mt-3">
      <p className="font-bold underline">ภาพประกอบการติดตั้ง</p>
      <div className="mt-1 grid grid-cols-2 gap-3">
        {shown.map((img, i) => (
          <figure key={img.id} className="break-inside-avoid">
            <img src={urls[img.id]} alt={img.description ?? img.file_name} className="w-full border border-[#333]" />
            <figcaption className="mt-0.5 text-center text-[12px]">
              ภาพที่ {i + 1} {img.description ?? img.file_name}
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}

/**
 * หน้าปก — logo top-left, standard name top-right, document title centered,
 * site photo, developer name. The official cover carries no header box or
 * TGO footer, so it does not use the Page frame.
 */
function CoverPage({ projectId, developer, coverId, formLabel }: { projectId: string; developer: string; coverId?: string; formLabel: string }) {
  const { images, urls } = useSiteImages(projectId);
  const cover = images.find((img) => img.id === coverId && urls[img.id]);
  return (
    <section className="doc-page cover-page flex flex-col">
      <div className="flex items-start justify-between">
        <img src="/tgo-logo-notext.svg" alt="T-VER" className="h-16 w-auto" />
        <div className="text-right text-[12px] leading-relaxed">
          โครงการลดก๊าซเรือนกระจกภาคสมัครใจตามมาตรฐานของประเทศไทย<br />
          (Standard T-VER)
        </div>
      </div>
      <div className="mt-20 space-y-6 text-center text-[26px] font-bold">
        <p>เอกสารข้อเสนอโครงการ</p>
        <p>(Project Design Document: PDD)</p>
        <p className="text-[22px]">{formLabel}</p>
      </div>
      {cover && (
        <img
          src={urls[cover.id]}
          alt={cover.description ?? cover.file_name}
          className="cover-photo mx-auto mt-12 w-[92%] object-cover"
        />
      )}
      <div className="mt-16 text-center text-[26px]">
        <p className="text-[20px]">ผู้พัฒนาโครงการ</p>
        <p>{developer}</p>
      </div>
    </section>
  );
}

export function TverSF001Pdd({ pddId: pddIdProp }: { pddId?: string } = {}) {
  const params = useParams();
  const pddId = pddIdProp ?? params.pddId;
  const pdd = useStore((s) => s.pdds.find((p) => p.id === pddId));
  const methodology = useStore((s) => s.methodologies.find((m) => m.id === pdd?.methodology_id));
  const project = useStore((s) => s.projects.find((p) => p.id === pdd?.project_id));
  const factors = useStore((s) => s.factors);
  const allEvidence = useStore((s) => s.evidence);

  if (!pdd || !methodology || !project) {
    return <EmptyState illustration="/illustrations/empty-document.webp" title="PDD not found" hint="This document does not exist." />;
  }

  const d = pdd.section_data as Record<string, unknown>;
  const ctx = { project, factors, sectionData: d };
  // แบบควบรวม: several installation sites bundled under one developer. Site
  // rows drive the capacity/generation totals in place of the parent project.
  const sites = parseSites(d.sites);
  const bundle = isBundle(d);
  const formLabel = bundle ? 'แบบควบรวม' : 'แบบเดี่ยว';
  const totalKwp = documentCapacityKwp(ctx);
  // The ตารางที่ 1 total specifically: null when no site row carries a capacity,
  // so the รวม cell prints '-' rather than the parent project's capacity — a
  // different physical quantity that no row above it sums to.
  const totalSiteKwp = sumSiteCapacityKwp(sites);
  const totalYear1 = sumSiteYear1Kwh(sites);
  const startYear = creditingStartYear(ctx);
  const bundleDegradationPct = Number.isFinite(Number(d.degradation_pct))
    && d.degradation_pct !== null && d.degradation_pct !== ''
    ? Number(d.degradation_pct) : 0;
  const table = computeYearlyTable(ctx);
  const comp = (source: PddComputedSource) => resolveComputed(source, ctx);
  const ef = comp('grid_factor');
  const str = (k: string) => {
    const v = d[k];
    return v === undefined || v === null || v === '' ? '-' : String(v);
  };
  const has = (k: string, val: string) => d[k] === val;
  const installations = (Array.isArray(d.installations) ? d.installations : []) as Array<Record<string, unknown>>;
  const equipmentSpecs = (Array.isArray(d.equipment_specs) ? d.equipment_specs : []) as Array<Record<string, unknown>>;
  const supportEquipment = (Array.isArray(d.support_equipment) ? d.support_equipment : []) as Array<Record<string, unknown>>;
  // Table numbering is one running sequence over the tables that actually
  // render. แบบควบรวม: 1 sites, 2 equipment by site, then installations and
  // support equipment only when they have rows, then maintenance — the reference
  // document has no installations table, so its support table is 3 and its
  // maintenance table 4. แบบเดี่ยว: 1 installations, 2 support equipment.
  let tableSeq = 0;
  const nextTableNo = () => ++tableSeq;
  const sitesTableNo = bundle ? nextTableNo() : 0;
  const equipmentTableNo = bundle && equipmentSpecs.length > 0 ? nextTableNo() : 0;
  const installationsTableNo = installations.length > 0 ? nextTableNo() : 0;
  const supportTableNo = supportEquipment.length > 0 ? nextTableNo() : 0;
  const maintenanceTableNo = bundle ? nextTableNo() : 0;
  // Existing PDDs predate project_type; this methodology is solar-only, so an
  // absent value means the renewable-energy category rather than "none ticked".
  const projectType = str('project_type') !== '-' ? str('project_type') : PROJECT_TYPES[0];
  // ตารางที่ 2 (แบบควบรวม): equipment rows grouped under the site they belong to.
  // Rows whose `site` matches no site row are kept in a trailing ไม่ระบุพื้นที่
  // group rather than dropped — an unmatched row is a data-entry problem the
  // reviewer must see, not something the document may silently swallow.
  const equipmentGroups: Array<{ label: string; kwp: number | null; rows: Array<Record<string, unknown>> }> = bundle
    ? (() => {
        const matched = new Set<Record<string, unknown>>();
        const groups = sites.map((s) => {
          const rows = equipmentSpecs.filter((r) => String(r.site ?? '') === s.owner && s.owner !== '');
          rows.forEach((r) => matched.add(r));
          return { label: s.owner || '-', kwp: s.kwp, rows };
        });
        const orphans = equipmentSpecs.filter((r) => !matched.has(r));
        return orphans.length > 0 ? [...groups, { label: 'ไม่ระบุพื้นที่', kwp: null, rows: orphans }] : groups;
      })()
    : [];
  // Items outside Solar Panel / Inverter / Energy Meter get an อื่นๆ column pair —
  // only when at least one exists, so the ordinary table matches the reference's.
  const equipmentByCategory = (rows: Array<Record<string, unknown>>, ci: number) =>
    rows.filter((r) => appendixEquipmentCategory(String(r.item ?? '')) === ci);
  const hasUncategorisedEquipment = equipmentGroups.some((g) => equipmentByCategory(g.rows, -1).length > 0);
  const address = typeof d.project_address === 'string' && d.project_address !== '' ? d.project_address : project.location;
  const ownerName = typeof d.owner_name === 'string' && d.owner_name !== '' ? d.owner_name : str('project_owner');
  const consumers = (Array.isArray(d.consumers) ? d.consumers : []) as Array<Record<string, unknown>>;
  const egDeductionPct = Number(d.eg_deduction_pct) || 0;
  const ecPj = computeEcPj(consumers);
  const consumersHaveNotes = consumers.some((r) => cellStr(r.note) !== '');
  const years = table?.years ?? Number(str('crediting_years')) ?? 7;
  const creditingPeriod = creditingPeriodLabel(str('crediting_years'), d.crediting_start);
  const siteImages = pddSiteImages(allEvidence, project.id);
  // Explicitly chosen cover leaves the section-1 figures (the official doc
  // never repeats it); a fallback first-image cover stays in the figures so
  // no installation photo silently disappears.
  const explicitCover = siteImages.find((img) => img.id === d.cover_evidence_id);
  const coverImage = pickCoverImage(siteImages, d.cover_evidence_id);

  return (
    <div className="mx-auto max-w-4xl rounded-sheet border border-rule bg-surface print:border-0">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-rule px-4 py-3 print:hidden">
        <h1 className="w-full text-xl font-semibold text-ink">{formLabel}</h1>
        <LinkButton to={`/registration/${pdd.id}/document`} variant="ghost"><ArrowLeft size={16} /> Back to document</LinkButton>
        <Button onClick={() => window.print()}><Printer size={16} /> Print / PDF</Button>
      </div>

      <div className="tver-doc bg-white p-8 text-[13px] leading-relaxed text-black shadow print:p-0 print:shadow-none">

        {/* ============ หน้าปก ============ */}
        <CoverPage projectId={project.id} developer={str('project_owner')} coverId={coverImage?.id} formLabel={formLabel} />

        {/* ============ รายละเอียดโครงการ ============ */}
        <Page formLabel={formLabel}>
          <SectionBar>รายละเอียดโครงการ</SectionBar>
          <table className="doc-table w-full">
            <tbody>
              <tr>
                <td rowSpan={2} className="w-44 font-bold">ชื่อโครงการ</td>
                <td>{str('project_title_th')}</td>
              </tr>
              <tr><td>{str('project_title_en')}</td></tr>
              <tr><td className="font-bold">ผู้พัฒนาโครงการ</td><td>{str('project_owner')}</td></tr>
              <tr><td className="font-bold">ผู้พัฒนาโครงการร่วม</td><td>{str('co_developer')}</td></tr>
              {/* แบบควบรวม: owner / address / coordinates are per-site (official form p.2-3),
                  so these three rows read from sites[] instead of the parent scalars. */}
              {bundle ? (
                <>
                  {/* Reference p.2: the เจ้าของโครงการ and ที่ตั้งโครงการ label cells
                      share one value cell — a sub-table headed with both names, one
                      row per site. Owner and address print once each. */}
                  <tr>
                    <td className="font-bold">เจ้าของโครงการ</td>
                    <td rowSpan={2}>
                      <table data-testid="owners-by-site" className="doc-table w-full">
                        <tbody>
                          <tr className="bg-[#f2f2f2] text-center font-bold">
                            <td>เจ้าของโครงการ</td><td>ที่ตั้งโครงการ</td>
                          </tr>
                          {sites.map((s, i) => (
                            <tr key={`${s.owner}-${i}`}>
                              <td>{s.owner || '-'}</td>
                              <td className="whitespace-pre-wrap">{s.address || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                  <tr><td className="font-bold">ที่ตั้งโครงการ</td></tr>
                </>
              ) : (
                <>
                  <tr><td className="font-bold">เจ้าของโครงการ</td><td>{ownerName}</td></tr>
                  <tr><td className="font-bold">ที่ตั้งโครงการ</td><td className="whitespace-pre-wrap">{address}</td></tr>
                </>
              )}
              <tr>
                <td className="font-bold">พิกัดที่ตั้งโครงการ</td>
                <td>
                  {bundle ? (
                    <div data-testid="coords-by-site">
                      {sites.map((s, i) => (
                        <div key={`${s.owner}-${i}`} className="flex items-baseline justify-between gap-4">
                          <span>{i + 1}. {s.owner || '-'}</span>
                          <span className="whitespace-nowrap text-right [font-variant-numeric:tabular-nums]">{s.coordinates}</span>
                        </div>
                      ))}
                    </div>
                  ) : installations.length === 0 ? '-' : installations.map((r, i) => (
                    // Reference layout: building name left, lat/long as a flush-right column.
                    <div key={i} className="flex items-baseline justify-between gap-4">
                      <span>{i + 1}. {String(r.building ?? '-')}</span>
                      <span className="whitespace-nowrap text-right [font-variant-numeric:tabular-nums]">{String(r.coordinates ?? '')}</span>
                    </div>
                  ))}
                </td>
              </tr>
              <tr>
                <td className="font-bold">ประเภทโครงการ</td>
                <td>
                  {PROJECT_TYPES.map((t) => <Check key={t} on={projectType === t}>{t}</Check>)}
                </td>
              </tr>
              <tr>
                <td className="font-bold">รูปแบบการดำเนินโครงการ</td>
                <td>
                  <Check on={!bundle}>แบบเดี่ยว</Check>
                  <Check on={bundle}>แบบควบรวม</Check>
                </td>
              </tr>
              <tr>
                <td className="font-bold">ขนาดโครงการ</td>
                <td>
                  <Check on={has('project_scale', 'เล็กมาก')}>เล็กมาก</Check>
                  <Check on={has('project_scale', 'เล็ก')}>เล็ก</Check>
                  <Check on={has('project_scale', 'ใหญ่')}>ใหญ่</Check>
                </td>
              </tr>
            </tbody>
          </table>
        </Page>

        {/* ============ รายละเอียดโครงการ (ต่อ) — the official form splits this
            table across two pages and repeats the section bar ============ */}
        <Page formLabel={formLabel}>
          <SectionBar>รายละเอียดโครงการ</SectionBar>
          <table className="doc-table w-full">
            <tbody>
              <tr>
                <td className="w-44 font-bold">ระเบียบวิธีการลดก๊าซเรือนกระจก และเครื่องมือคำนวณที่เลือกใช้</td>
                {/* Reference p.3: "<code> ระเบียบวิธี…สำหรับ<name> ฉบับที่ <version> Scope: <scope>". */}
                <td>{methodology.code} ระเบียบวิธีการลดก๊าซเรือนกระจกภาคสมัครใจสำหรับ{methodology.name} ฉบับที่ {methodology.version} Scope: {methodology.sectoral_scope}</td>
              </tr>
              <tr>
                <td className="font-bold">กิจกรรมของโครงการ</td>
                {/* Reference p.3 carries a one-sentence activity summary, not the
                    §1.1 narrative. Unfilled single PDDs get the same sentence the
                    form's draft button writes; bundles keep the narrative. */}
                <td className="whitespace-pre-wrap">
                  {str('project_activity') !== '-' ? str('project_activity')
                    : bundle ? str('after_project')
                    : draftActivityText('project_activity', project, d, factors)}
                </td>
              </tr>
              <tr>
                <td className="font-bold">เงินลงทุนทั้งหมดของโครงการ</td>
                <td>{d.investment_mthb === undefined || d.investment_mthb === '' ? '-' : `${fmt(Number(d.investment_mthb))} ล้านบาท`}</td>
              </tr>
              <tr>
                <td className="font-bold">ปริมาณก๊าซเรือนกระจกที่คาดว่าจะลด/ดูดกลับได้</td>
                <td>{table ? `${fmtInt(table.avg.er)} ตันคาร์บอนไดออกไซด์เทียบเท่าต่อปี` : '-'}</td>
              </tr>
              <tr>
                <td className="font-bold">ระยะเวลาคิดคาร์บอนเครดิตของโครงการ</td>
                <td>
                  <Check on={has('crediting_years', '7')}>{has('crediting_years', '7') ? creditingPeriod : '7 ปี'}</Check>
                  <Check on={has('crediting_years', '10')}>{has('crediting_years', '10') ? creditingPeriod : '10 ปี'}</Check>
                </td>
              </tr>
            </tbody>
          </table>
        </Page>

        {/* ============ ผู้จัดทำเอกสาร / ผู้พัฒนาโครงการ ============ */}
        <Page formLabel={formLabel}>
          <SectionBar>รายละเอียดการจัดทำเอกสาร</SectionBar>
          <table className="doc-table w-full">
            <tbody>
              <tr><td className="w-44 font-bold">วันที่จัดทำแล้วเสร็จ</td><td colSpan={2}>{thaiDate(d.doc_completed_date)}</td></tr>
              <tr><td className="font-bold">เอกสารฉบับที่</td><td colSpan={2}>{str('doc_revision')}</td></tr>
              <tr><td rowSpan={4} className="font-bold">ผู้จัดทำเอกสาร</td><td className="w-32">ชื่อ-นามสกุล</td><td>{str('preparer_name')}</td></tr>
              <tr><td>ตำแหน่ง</td><td>{str('preparer_position')}</td></tr>
              <tr><td>หน่วยงาน</td><td>{str('preparer_org')}</td></tr>
              <tr><td>เบอร์ติดต่อ</td><td>{str('preparer_phone')}</td></tr>
            </tbody>
          </table>
          <SectionBar>รายละเอียดผู้พัฒนาโครงการ</SectionBar>
          <table className="doc-table w-full">
            <tbody>
              <tr><td className="w-44 font-bold">ผู้พัฒนาโครงการ</td><td>{str('project_owner')}</td></tr>
              <tr><td className="font-bold">ชื่อผู้ประสานงาน</td><td>{str('coordinator_name')}</td></tr>
              <tr><td className="font-bold">ตำแหน่ง</td><td>{str('coordinator_position')}</td></tr>
              <tr><td className="font-bold">ที่อยู่</td><td className="whitespace-pre-wrap">{address}</td></tr>
              <tr><td className="font-bold">โทรศัพท์</td><td>{str('coordinator_phone')}</td></tr>
              <tr><td className="font-bold">โทรสาร</td><td>{str('coordinator_fax')}</td></tr>
              <tr><td className="font-bold">E-mail</td><td>{str('coordinator_email')}</td></tr>
            </tbody>
          </table>
        </Page>

        {/* ============ สารบัญ ============ */}
        <TocPage formLabel={formLabel} />

        {/* ============ ส่วนที่ 1 รายละเอียดโครงการ ============ */}
        <Page formLabel={formLabel}>
          <SectionBar>ส่วนที่ 1 รายละเอียดโครงการ</SectionBar>

          <p className="font-bold underline">1.1 รายละเอียดและกิจกรรมของโครงการ</p>
          <p className="mt-1 font-bold underline">ก่อนดำเนินโครงการ</p>
          <p className="whitespace-pre-wrap indent-8">{str('before_project')}</p>
          <p className="mt-2 font-bold underline">หลังดำเนินโครงการ</p>
          <p className="whitespace-pre-wrap indent-8">{str('after_project')}</p>
          {/* The after_project draft already cites the permit; repeating it here
              printed the sentence twice. Only add it when the text lacks it. */}
          {d.permit_no !== undefined && d.permit_no !== '' && !str('after_project').includes(str('permit_no')) && (
            <p className="indent-8">
              ทำการติดตั้งตามใบอนุญาตก่อสร้างอาคาร ดัดแปลงอาคาร หรือรื้อถอนอาคาร
              เลขที่ {str('permit_no')} ลงวันที่ {thaiDate(d.permit_date)}
            </p>
          )}

          <p className="mt-3 font-bold underline">1.2 ขอบเขตการดำเนินโครงการ</p>
          <p className="indent-8">
            โครงการผลิตไฟฟ้าจากพลังงานแสงอาทิตย์ ขนาดกำลังติดตั้งรวม {fmt(totalKwp)} kWp
            ({str('technology')}, {str('grid_connection')}) เพื่อทดแทนการใช้ไฟฟ้าจากระบบสายส่ง
          </p>
          {bundle && (
            <>
              <p className="mt-3 font-bold">ตารางที่ {sitesTableNo} รายละเอียดโครงการเบื้องต้น กำลังผลิตติดตั้งและปริมาณไฟฟ้าที่คาดว่าจะผลิตได้</p>
              <table data-testid="sites-table" className="doc-table w-full">
                <thead>
                  <tr>
                    <th>ลำดับ</th><th>เจ้าของโครงการ</th><th>ผู้พัฒนาโครงการ</th>
                    <th>กำลังการผลิตติดตั้ง (kWp)</th><th>ปริมาณไฟฟ้าปีที่ 1 ที่คาดว่าจะผลิตได้ (kWh/year)</th>
                  </tr>
                </thead>
                <tbody>
                  {sites.map((s, i) => (
                    <tr key={`${s.owner}-${i}`}>
                      <td className="text-center">{i + 1}</td>
                      <td>{s.owner || '-'}</td>
                      {i === 0 && <td rowSpan={sites.length} className="text-center align-middle">{str('project_owner')}</td>}
                      <td className="text-right">{s.kwp === null ? '-' : fmt(s.kwp, 3)}</td>
                      <td className="text-right">{s.year1_kwh === null ? '-' : fmtInt(s.year1_kwh)}</td>
                    </tr>
                  ))}
                  <tr className="font-bold">
                    {/* ลำดับ + เจ้าของโครงการ + ผู้พัฒนาโครงการ — the rowSpan above ends
                        on the last site row, so the total row carries all three itself. */}
                    <td colSpan={3} className="text-center">รวม</td>
                    {/* Site rows carry 3 dp; the reference prints the รวม at 2 (2,009.30). */}
                    <td className="text-right">{totalSiteKwp === null ? '-' : fmt(totalSiteKwp)}</td>
                    <td className="text-right">{totalYear1 === null ? '-' : fmtInt(totalYear1)}</td>
                  </tr>
                </tbody>
              </table>
            </>
          )}
          <BoundaryDiagram capacityKwp={fmt(totalKwp)} owner={ownerName} bundle={bundle} />
          <p className="text-center font-bold">รูปที่ 1 ขอบเขตของโครงการ</p>
          {equipmentSpecs.length > 0 && (
            <>
              <p className="mt-2 indent-8">เทคโนโลยีที่ใช้ในโครงการจะเป็นเทคโนโลยีผลิตไฟฟ้าจากแผงเซลล์แสงอาทิตย์ ซึ่งประกอบไปด้วย</p>
              {bundle ? (
                <>
                  <p className="mt-2 text-center font-bold">ตารางที่ {equipmentTableNo} รายการอุปกรณ์หลักสำหรับผลิตพลังงานไฟฟ้าจากแสงอาทิตย์ของโครงการ</p>
                  {/* Reference p.9 layout: one row per site, a ยี่ห้อ / รุ่น cell plus a
                      จำนวน cell per category, several items stacked on lines. */}
                  <table data-testid="equipment-by-site" className="doc-table mt-1 w-full text-[11px]">
                    <thead>
                      <tr className="bg-[#f2f2f2] text-center font-bold">
                        <td rowSpan={2}>ลำดับ</td><td rowSpan={2}>ชื่อโครงการ</td><td rowSpan={2}>กำลังการผลิต (kWp)</td>
                        <td colSpan={2}>Solar Panel</td><td colSpan={2}>Inverter</td><td colSpan={2}>Energy Meter</td>
                        {hasUncategorisedEquipment && <td colSpan={2}>อื่นๆ</td>}
                      </tr>
                      <tr className="bg-[#f2f2f2] text-center font-bold">
                        <td>ยี่ห้อ / รุ่น</td><td>จำนวน (แผง)</td>
                        <td>ยี่ห้อ / รุ่น / ขนาด</td><td>จำนวน (เครื่อง)</td>
                        <td>ยี่ห้อ / รุ่น</td><td>จำนวน (เครื่อง)</td>
                        {hasUncategorisedEquipment && <><td>รายการ / ยี่ห้อ / รุ่น</td><td>จำนวน</td></>}
                      </tr>
                    </thead>
                    <tbody>
                      {equipmentGroups.map((g, gi) => (
                        // A site with no equipment rows still gets its row of '-' so the
                        // reviewer sees the gap instead of the site disappearing.
                        <tr key={`${g.label}-${gi}`}>
                          <td className="text-center">{gi + 1}</td>
                          <td>{g.label}</td>
                          <td className="text-right">{g.kwp === null ? '-' : fmt(g.kwp, 3)}</td>
                          {APPENDIX_EQUIPMENT_ROWS.map((cat, ci) => (
                            <Fragment key={cat.label}>
                              <td>{equipmentNameLines(equipmentByCategory(g.rows, ci))}</td>
                              <td className="text-center">{equipmentQtyLines(equipmentByCategory(g.rows, ci))}</td>
                            </Fragment>
                          ))}
                          {hasUncategorisedEquipment && (
                            <>
                              <td>{equipmentNameLines(equipmentByCategory(g.rows, -1), true)}</td>
                              <td className="text-center">{equipmentQtyLines(equipmentByCategory(g.rows, -1))}</td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              ) : (
                <ol className="list-decimal pl-14">
                  {equipmentSpecs.map((r, i) => (
                    <li key={i}>
                      {String(r.item ?? '-')}
                      {r.brand !== undefined && r.brand !== '' ? ` ยี่ห้อ ${String(r.brand)}` : ''}
                      {r.model !== undefined && r.model !== '' ? ` รุ่น ${String(r.model)}` : ''}
                      {r.spec !== undefined && r.spec !== '' ? ` ${String(r.spec)}` : ''}
                      {r.qty !== undefined && r.qty !== '' ? ` จำนวน ${fmtInt(Number(r.qty))}` : ''}
                    </li>
                  ))}
                </ol>
              )}
            </>
          )}
          {installations.length > 0 && (
            <>
              {/* ตารางที่ 3 in bundle mode — ตารางที่ 1 is the site capacity table
                  and ตารางที่ 2 the per-site equipment table above. */}
              <p className="mt-2 text-center font-bold">ตารางที่ {installationsTableNo} รายละเอียดอุปกรณ์หลักที่ติดตั้งในโครงการ</p>
              <table className="doc-table mt-1 w-full">
                <thead>
                  <tr className="bg-[#f2f2f2] text-center font-bold">
                    {bundle && <td>พื้นที่ติดตั้ง (แห่ง)</td>}
                    <td>พื้นที่ติดตั้ง</td><td>พิกัด</td><td>จำนวนแผงเซลล์แสงอาทิตย์ (แผ่น)</td>
                    <td>จำนวนอินเวอร์เตอร์ (เครื่อง)</td><td>ขนาดการติดตั้งรวม (kWp)</td>
                  </tr>
                </thead>
                <tbody>
                  {installations.map((r, i) => (
                    <tr key={i}>
                      {bundle && <td>{String(r.site ?? '-')}</td>}
                      <td>{String(r.building ?? '-')}</td>
                      <td className="text-center">{String(r.coordinates ?? '-')}</td>
                      <td className="text-center">{r.panels === undefined || r.panels === '' ? '-' : fmtInt(Number(r.panels))}</td>
                      <td className="text-center">{r.inverters === undefined || r.inverters === '' ? '-' : fmtInt(Number(r.inverters))}</td>
                      <td className="text-right">{r.kwp === undefined || r.kwp === '' ? '-' : fmt(Number(r.kwp))}</td>
                    </tr>
                  ))}
                  <tr className="font-bold">
                    <td className="text-center" colSpan={bundle ? 3 : 2}>รวม</td>
                    <td className="text-center">{fmtInt(installations.reduce((a, r) => a + (Number(r.panels) || 0), 0))}</td>
                    <td className="text-center">{fmtInt(installations.reduce((a, r) => a + (Number(r.inverters) || 0), 0))}</td>
                    <td className="text-right">{fmt(installations.reduce((a, r) => a + (Number(r.kwp) || 0), 0))}</td>
                  </tr>
                </tbody>
              </table>
            </>
          )}
          {supportEquipment.length > 0 && (
            <>
              {/* อุปกรณ์สนับสนุน — the official form lists these per site directly
                  after the main-equipment table. */}
              <p className="mt-2 text-center font-bold">
                ตารางที่ {supportTableNo} รายการอุปกรณ์สนับสนุนสำหรับผลิตพลังงานไฟฟ้าจากแสงอาทิตย์ของโครงการ
              </p>
              <table data-testid="support-equipment" className="doc-table mt-1 w-full">
                <thead>
                  <tr className="bg-[#f2f2f2] text-center font-bold">
                    <td>ลำดับ</td><td>ชื่อโครงการ</td><td>Smart Logger</td><td>PQM</td><td>Internet Router</td><td>Water Pump</td>
                  </tr>
                </thead>
                <tbody>
                  {supportEquipment.map((r, i) => (
                    <tr key={i}>
                      <td className="text-center">{i + 1}</td>
                      <td>{r.site === undefined || r.site === '' ? '-' : String(r.site)}</td>
                      <td>{r.smart_logger === undefined || r.smart_logger === '' ? '-' : String(r.smart_logger)}</td>
                      <td>{r.pqm === undefined || r.pqm === '' ? '-' : String(r.pqm)}</td>
                      <td>{r.router === undefined || r.router === '' ? '-' : String(r.router)}</td>
                      <td>{r.water_pump === undefined || r.water_pump === '' ? '-' : String(r.water_pump)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          <EvidenceFigures projectId={project.id} excludeId={explicitCover?.id} />

          <p className="mt-3 font-bold underline">1.3 การนับซ้ำ</p>
          <p className="indent-8">
            กิจกรรมของโครงการลดก๊าซเรือนกระจกนี้ ได้เคยขึ้นทะเบียน หรืออยู่ระหว่างการขึ้นทะเบียนกลไก/มาตรฐาน
            การรับรองคาร์บอนเครดิตอื่นๆ (เช่น CDM, VCS, Gold Standard) หรือมาตรฐานใบรับรองเครดิตการผลิตพลังงานหมุนเวียน (REC)
          </p>
          <div className="mt-1 pl-8">
            <Check on={has('registered_elsewhere', 'ไม่มี')}>ไม่มี</Check>
            <Check on={has('registered_elsewhere', 'มี')}>
              มี โดยขึ้นทะเบียนใน ชื่อโครงการ {str('registry_name')} กลไก/มาตรฐาน {str('registry_scheme')} ช่วงเวลา {str('registry_period')}
            </Check>
          </div>

          <p className="mt-3 font-bold underline">1.4 การพิสูจน์การดำเนินงานเพิ่มจากการดำเนินงานตามปกติ (Additionality)</p>
          <div className="mt-1 pl-8">
            <Check on={has('project_scale', 'เล็กมาก')}>ไม่ต้องพิสูจน์การดำเนินงานเพิ่มจากการดำเนินงานตามปกติ</Check>
            <Check on={!has('project_scale', 'เล็กมาก')}>ต้องพิสูจน์การดำเนินงานเพิ่มจากการดำเนินงานตามปกติ</Check>
            {/* The methodology collects the barrier / common-practice answers; the
                official form expects them printed under this branch. */}
            {!has('project_scale', 'เล็กมาก') && (
              <div className="ml-6 mt-1">
                <p>อุปสรรคหลัก: {str('barrier_type')}{str('investment_metric') !== '-' ? ` (ตัวชี้วัด: ${str('investment_metric')})` : ''}</p>
                <p>ไม่ใช่การดำเนินงานทั่วไปในพื้นที่: {d.common_practice === true ? 'ใช่' : d.common_practice === false ? 'ไม่ใช่' : '-'}</p>
              </div>
            )}
          </div>
          {has('project_scale', 'เล็กมาก') ? (
            <p className="mt-1 indent-8">
              เนื่องจากเป็นโครงการขนาดเล็กมาก (Micro Scale) ตามหลักเกณฑ์การพิจารณาโครงการที่เข้าข่ายโครงการ
              ลดก๊าซเรือนกระจกที่ไม่ต้องพิสูจน์ส่วนเพิ่มเติม (Positive List) ของ อบก.
              ดังนั้น โครงการนี้สามารถพัฒนาเป็นโครงการ T-VER ได้ โดยไม่ต้องพิสูจน์การดำเนินงานเพิ่มเติมจากการดำเนินงานตามปกติ
            </p>
          ) : (
            <p className="mt-1 whitespace-pre-wrap indent-8">{str('barrier_explanation')}</p>
          )}

          <p className="mt-3 font-bold underline">1.5 ระยะเวลาการคิดเครดิตของโครงการ</p>
          <div className="mt-1 pl-8">
            {/* Commencement and crediting start are distinct on the official form;
                fall back to the crediting date so PDDs predating the field are
                unchanged. */}
            <p>วันเริ่มดำเนินโครงการ: {thaiDate(d.project_start_date !== undefined && d.project_start_date !== '' ? d.project_start_date : d.crediting_start)}</p>
            <Check on={has('crediting_years', '7')}>{has('crediting_years', '7') ? creditingPeriod : '7 ปี'}</Check>
            <Check on={has('crediting_years', '10')}>{has('crediting_years', '10') ? creditingPeriod : '10 ปี'}</Check>
          </div>

          <p className="mt-3 font-bold underline">1.6 โครงการประเภทการลด ดูดซับ และการกักเก็บก๊าซเรือนกระจกจากภาคป่าไม้และการเกษตร</p>
          <p className="pl-8">- ไม่เกี่ยวข้อง</p>
        </Page>

        {/* ============ ส่วนที่ 2 ระเบียบวิธี ============ */}
        <Page formLabel={formLabel}>
          <SectionBar>ส่วนที่ 2 ระเบียบวิธีลดก๊าซเรือนกระจกภาคสมัครใจ</SectionBar>

          <p className="font-bold underline">2.1 ระเบียบวิธีลดก๊าซเรือนกระจก (T-VER Methodology) และเครื่องมือคำนวณ (Tools) ที่ใช้</p>
          <table className="doc-table mt-1 w-full">
            <thead>
              <tr className="bg-[#f2f2f2] text-center font-bold"><td>ลำดับ</td><td>รหัส</td><td>เวอร์ชั่น</td><td>ชื่อระเบียบวิธีฯ / เครื่องมือคำนวณ</td></tr>
            </thead>
            <tbody>
              <tr>
                <td className="text-center">1</td>
                <td className="text-center">{methodology.code}</td>
                <td className="text-center">{methodology.version}</td>
                <td>{methodology.name}</td>
              </tr>
            </tbody>
          </table>

          <p className="mt-3 font-bold underline">2.2 เงื่อนไขของกิจกรรมโครงการ</p>
          <MethodBlock code={methodology.code} version={methodology.version} name={methodology.name} testId="applicability-method" />
          {/* Reference p.13-14: Applicability (one row) and four numbered Project
              Conditions under their own sub-heading rows. The wording is the
              methodology's own and identical for every solar-PV project. */}
          <table data-testid="applicability-table" className="doc-table w-full">
            <thead>
              <tr className="bg-[#f2f2f2] text-center font-bold"><td className="w-1/2">เงื่อนไขของกิจกรรมโครงการ</td><td>เหตุผลของโครงการ</td></tr>
            </thead>
            <tbody>
              <tr><td colSpan={2} className="bg-[#f7f7f7] font-bold">ลักษณะของกิจกรรมโครงการที่เข้าข่าย (Applicability)</td></tr>
              <tr>
                <td>
                  เป็นโครงการที่มีกิจกรรมการผลิตไฟฟ้าจากพลังงานหมุนเวียนหรือทดแทนการผลิตไฟฟ้าจากเชื้อเพลิงฟอสซิล เพื่อใช้เองหรือจำหน่ายเข้าระบบสายส่ง ในรูปแบบหนึ่งจากทั้งหมด ได้แก่
                  <ul className="list-disc pl-6">
                    <li>การติดตั้งใหม่ (Greenfield)</li>
                    <li>การปรับปรุงระบบที่มีอยู่เดิม โดยยังคงโครงสร้างหลักไว้ (Retrofit)</li>
                    <li>การเปลี่ยน/สร้างระบบใหม่เพื่อทดแทนที่ของเดิม (Replacement)</li>
                  </ul>
                </td>
                <td><span className="underline">เข้าข่าย</span> เนื่องจากเป็นโครงการที่มีกิจกรรมการผลิตไฟฟ้าจากพลังงานแสงอาทิตย์ ซึ่งเป็นพลังงานหมุนเวียน เพื่อทดแทนการใช้ไฟฟ้าจากเชื้อเพลิงฟอสซิลจากระบบสายส่ง (การไฟฟ้าส่วนภูมิภาค/การไฟฟ้านครหลวง)</td>
              </tr>
              <tr><td colSpan={2} className="bg-[#f7f7f7] font-bold">เงื่อนไขของกิจกรรมโครงการ (Project Conditions)</td></tr>
              <tr>
                <td>1. เป็นการผลิตไฟฟ้าเพื่อทดแทนการผลิตไฟฟ้าจากเชื้อเพลิงฟอสซิล</td>
                <td><span className="underline">เข้าเงื่อนไข</span> เนื่องจากเป็นโครงการที่มีกิจกรรมการผลิตไฟฟ้าจากพลังงานแสงอาทิตย์ ซึ่งเป็นพลังงานหมุนเวียน เพื่อทดแทนการใช้ไฟฟ้าจากเชื้อเพลิงฟอสซิลจากระบบสายส่ง</td>
              </tr>
              <tr>
                <td>2. สำหรับกรณีการผลิตไฟฟ้าจากเชื้อเพลิงชีวมวลหรือขยะมูลฝอยที่มีกำลังการผลิตติดตั้งรวม (Total Installed Capacity) แต่ละประเภทเทคโนโลยีพลังงานหมุนเวียนเกิน 15 MW และระยะทางการขนส่งเชื้อเพลิงพลังงานหมุนเวียนอยู่นอกรัศมี 200 กิโลเมตร ต้องประเมินการปล่อยก๊าซเรือนกระจกภายนอกขอบเขตโครงการ</td>
                <td><span className="underline">ไม่เกี่ยวข้อง</span> เนื่องจากไม่มีการใช้เชื้อเพลิงชีวมวลหรือขยะมูลฝอยในการผลิตไฟฟ้า จึงไม่มีการขนส่งเชื้อเพลิงใดๆ ที่จะต้องประเมินการปล่อยก๊าซเรือนกระจกภายนอกขอบเขตโครงการ</td>
              </tr>
              <tr>
                <td>3. สำหรับกรณีที่เป็นการผลิตไฟฟ้าจากพลังงานหมุนเวียนระดับชุมชน ต้องมีกำลังการผลิตติดตั้งรวมไม่เกิน 100 kW และเป็นการผลิตไฟฟ้าเพื่อใช้เองในชุมชน</td>
                <td><span className="underline">ไม่เกี่ยวข้อง</span> เนื่องจากไม่เป็นการผลิตไฟฟ้าเพื่อใช้เองในชุมชน{totalKwp > 100 ? ' และมีกำลังการผลิตติดตั้งรวมเกิน 100 kW' : ''}</td>
              </tr>
              <tr>
                <td>4. สำหรับกรณีการนำก๊าซชีวภาพนอกขอบเขตโครงการมาใช้ประโยชน์จะต้องประเมินการปล่อยก๊าซเรือนกระจกภายนอกขอบเขตโครงการที่เกิดขึ้นจากก๊าซชีวภาพที่รั่วไหลและการเผาทำลายก๊าซชีวภาพ</td>
                <td><span className="underline">ไม่เกี่ยวข้อง</span> เนื่องจากไม่มีการนำก๊าซชีวภาพนอกขอบเขตโครงการมาใช้ประโยชน์</td>
              </tr>
            </tbody>
          </table>

          <p className="mt-3 font-bold underline">2.3 ข้อมูลที่เกี่ยวข้องต่อการคำนวณปริมาณการปล่อยก๊าซเรือนกระจก</p>
          <p className="mt-1">แหล่งปล่อยก๊าซเรือนกระจกที่นำมาใช้ในการคำนวณ</p>
          {/* Reference p.15: two sources per group, each answered — the
              methodology's own list, so it is fixed text like §2.2. */}
          <table data-testid="emission-source-table" className="doc-table mt-1 w-full">
            <thead>
              <tr className="bg-[#f2f2f2] text-center font-bold"><td>แหล่งปล่อยก๊าซเรือนกระจก</td><td>ชนิดของก๊าซเรือนกระจก</td><td>รายละเอียดของกิจกรรมโครงการ</td></tr>
            </thead>
            <tbody>
              <tr><td colSpan={3} className="bg-[#f7f7f7] font-bold">การปล่อยก๊าซเรือนกระจกจากกรณีฐาน</td></tr>
              <tr>
                <td>การผลิตไฟฟ้าของระบบสายส่ง</td><td className="text-center">CO₂</td>
                <td>การเผาไหม้เชื้อเพลิงฟอสซิลเพื่อผลิตไฟฟ้าของระบบสายส่งจากการไฟฟ้าส่วนภูมิภาค/การไฟฟ้านครหลวง</td>
              </tr>
              <tr>
                <td>การผลิตไฟฟ้าเพื่อใช้เอง หรือ ส่ง หรือจำหน่ายให้ผู้ประกอบการรายอื่น</td><td className="text-center">CO₂</td>
                <td>ไม่เกี่ยวข้อง เนื่องจากกิจกรรมของโครงการกรณีฐานเป็นการใช้ไฟฟ้าจากระบบสายส่งจากการไฟฟ้าส่วนภูมิภาค/การไฟฟ้านครหลวง</td>
              </tr>
              <tr><td colSpan={3} className="bg-[#f7f7f7] font-bold">การปล่อยก๊าซเรือนกระจกจากการดำเนินโครงการ</td></tr>
              <tr>
                <td>การใช้เชื้อเพลิงฟอสซิล</td><td className="text-center">CO₂</td>
                <td>ไม่เกี่ยวข้อง เนื่องจากกิจกรรมของโครงการไม่มีการเผาไหม้เชื้อเพลิงฟอสซิล</td>
              </tr>
              <tr>
                <td>การใช้ไฟฟ้า</td><td className="text-center">CO₂</td>
                <td>การเผาไหม้เชื้อเพลิงฟอสซิลเพื่อผลิตไฟฟ้าของระบบสายส่งจากการไฟฟ้าส่วนภูมิภาค/การไฟฟ้านครหลวง ด้วยระบบออนกริด (On-Grid) ในช่วงเวลากลางคืน และช่วงเวลาที่ระบบ Solar Rooftop ไม่สามารถผลิตได้เพียงพอต่อการใช้งานของหน่วยงาน</td>
              </tr>
              <tr><td colSpan={3} className="bg-[#f7f7f7] font-bold">การปล่อยก๊าซเรือนกระจกนอกขอบเขตโครงการ</td></tr>
              <tr>
                <td>การใช้เชื้อเพลิงฟอสซิลจากการขนส่ง</td><td className="text-center">CO₂</td>
                <td>ไม่เกี่ยวข้อง เนื่องจากโครงการไม่มีการใช้เชื้อเพลิงชีวมวลหรือขยะมูลฝอยในการผลิตไฟฟ้า จึงไม่มีการขนส่งเชื้อเพลิงใด ๆ ที่จะต้องประเมินการปล่อยก๊าซเรือนกระจกภายนอกขอบเขตโครงการ</td>
              </tr>
              <tr>
                <td>ระบบบำบัดน้ำเสียแบบไร้อากาศ/ระบบกักเก็บและระบบ Biogas flare</td><td className="text-center">CH₄</td>
                <td>ไม่เกี่ยวข้อง เนื่องจากโครงการไม่มีการใช้ก๊าซชีวภาพในการผลิตไฟฟ้า จึงไม่มีก๊าซชีวภาพที่รั่วไหลออกจากระบบบำบัดน้ำเสียแบบไร้อากาศ รวมไปถึงระบบกักเก็บ และก๊าซชีวภาพที่เผาทำลายไม่หมด</td>
              </tr>
            </tbody>
          </table>

          {/* The official §2.3 carries a second table for carbon pools. Solar PV
              stores no carbon, so every pool is "- ไม่มี -" for this methodology. */}
          <p className="mt-3">แหล่งสะสมคาร์บอนและก๊าซเรือนกระจกที่นำมาใช้ในการคำนวณ</p>
          <table data-testid="carbon-pool-table" className="doc-table mt-1 w-full">
            <thead>
              <tr className="bg-[#f2f2f2] text-center font-bold"><td>แหล่งสะสมคาร์บอน</td><td>ชนิดของก๊าซเรือนกระจก</td><td>รายละเอียดของกิจกรรมโครงการ</td></tr>
            </thead>
            <tbody>
              <tr><td colSpan={3} className="bg-[#f7f7f7] font-bold">การดูดซับ ดักจับ และกักเก็บก๊าซเรือนกระจกจากกรณีฐาน</td></tr>
              <tr><td colSpan={3} className="text-center">- ไม่มี -</td></tr>
              <tr><td colSpan={3} className="bg-[#f7f7f7] font-bold">การดูดซับ ดักจับ และกักเก็บก๊าซเรือนกระจกจากการดำเนินโครงการ</td></tr>
              <tr><td colSpan={3} className="text-center">- ไม่มี -</td></tr>
              <tr><td colSpan={3} className="bg-[#f7f7f7] font-bold">การปล่อยก๊าซเรือนกระจกนอกขอบเขตโครงการ</td></tr>
              <tr><td colSpan={3} className="text-center">- ไม่มี -</td></tr>
            </tbody>
          </table>
        </Page>

        {/* ============ ส่วนที่ 3 การคำนวณ ============ */}
        <Page formLabel={formLabel}>
          <SectionBar>ส่วนที่ 3 การคำนวณการลดก๊าซเรือนกระจก</SectionBar>

          <p className="font-bold underline">3.1 การคำนวณปริมาณก๊าซเรือนกระจกกรณีฐาน (Baseline Sequestration/Emission)</p>
          <p className="mt-1 indent-8">
            การปล่อยก๊าซเรือนกระจกจากกรณีฐาน พิจารณาเฉพาะการปล่อยก๊าซคาร์บอนไดออกไซด์ (CO₂) จากการผลิตไฟฟ้าด้วยเชื้อเพลิงฟอสซิล
            โดยคิดเทียบเท่าจากปริมาณไฟฟ้าที่ผลิตได้จากพลังงานหมุนเวียนที่นำไปทดแทนการใช้ไฟฟ้าจากระบบสายส่ง
          </p>
          <MethodBlock code={methodology.code} version={methodology.version} name={methodology.name} testId="be-method">
            <p>สมการที่ใช้: BE<sub>y</sub> = BE<sub>EG,y</sub></p>
            <p>กรณีที่ 2 ผลิตไฟฟ้าเพื่อใช้เอง/ส่งหรือจำหน่ายให้แก่ผู้ประกอบการรายอื่น (ลดการซื้อไฟฟ้าจากระบบสายส่ง)</p>
            <p className="pl-8">BE<sub>EG,y</sub> = (EG<sub>Consumer,PJ,y</sub> × 10⁻³) × EF<sub>EC,PJ,y</sub></p>
          </MethodBlock>
          <table data-testid="be-params" className="doc-table w-full">
            <thead>
              <tr className="bg-[#f2f2f2] text-center font-bold"><td>พารามิเตอร์</td><td>ความหมาย</td><td>อ้างอิง</td><td>ค่าที่ใช้</td><td>หน่วย</td></tr>
            </thead>
            <tbody>
              <tr>
                <td className="text-center">BE<sub>y</sub></td><td>ปริมาณการปล่อยก๊าซเรือนกระจกจากกรณีฐาน ในปี y</td>
                <td className="text-center">การคำนวณ</td>
                <td className="text-right">{table ? fmt(table.avg.be) : '-'}</td><td className="text-center">tCO₂/year</td>
              </tr>
              <tr>
                {/* Grid-displacement baseline: the only baseline source for this
                    methodology, so it equals BE_y. */}
                <td className="text-center">BE<sub>EG,y</sub></td><td>ปริมาณการปล่อยก๊าซเรือนกระจกของการผลิตไฟฟ้าจากเชื้อเพลิงฟอสซิล ในปี y</td>
                <td className="text-center">การคำนวณ</td>
                <td className="text-right">{table ? fmt(table.avg.be) : '-'}</td><td className="text-center">tCO₂/year</td>
              </tr>
              <tr>
                <td className="text-center">EG<sub>Consumer,PJ,y</sub></td><td>ปริมาณไฟฟ้าที่ผลิตได้เพื่อใช้เอง/ส่งหรือจำหน่ายให้แก่ผู้ใช้ไฟฟ้าจากการดำเนินโครงการพลังงานหมุนเวียน ในปี y</td>
                <td className="text-center">คาดการณ์</td>
                <td className="text-right">{table ? fmt(table.rows.reduce((a, r) => a + r.generation_kwh, 0) / years) : '-'}</td><td className="text-center">kWh/year</td>
              </tr>
              <tr>
                <td className="text-center">EF<sub>EC,PJ,y</sub></td><td>ค่าการปล่อยก๊าซเรือนกระจกสำหรับการใช้ไฟฟ้า ในปี y</td>
                <td className="text-center">อบก. ประกาศ</td>
                <td className="text-right">{ef === null || ef === undefined ? '-' : String(ef)}</td><td className="text-center">tCO₂/MWh</td>
              </tr>
            </tbody>
          </table>

          <p className="mt-3 font-bold underline">3.2 การคำนวณปริมาณก๊าซเรือนกระจกจากการดำเนินโครงการ (Project Sequestration/Emission)</p>
          <MethodBlock code={methodology.code} version={methodology.version} name={methodology.name} testId="pe-method">
            <p>สมการที่ใช้: PE<sub>y</sub> = PE<sub>FF,y</sub> + PE<sub>EL,y</sub></p>
            <p>กรณีที่ 2 การปล่อยก๊าซเรือนกระจกจากการใช้ไฟฟ้าจากระบบสายส่งหรือการใช้ไฟฟ้าที่ผลิตจากเชื้อเพลิงฟอสซิล</p>
            <p className="pl-8">PE<sub>EL,y</sub> = (EC<sub>PJ,y</sub> × 10⁻³) × EF<sub>EC,PJ,y</sub></p>
          </MethodBlock>
          <table data-testid="pe-params" className="doc-table w-full">
            <thead>
              <tr className="bg-[#f2f2f2] text-center font-bold"><td>พารามิเตอร์</td><td>ความหมาย</td><td>อ้างอิง</td><td>ค่าที่ใช้</td><td>หน่วย</td></tr>
            </thead>
            <tbody>
              <tr>
                <td className="text-center">PE<sub>y</sub></td><td>ปริมาณการปล่อยก๊าซเรือนกระจกรวมจากการดำเนินโครงการในปี y</td>
                <td className="text-center">การคำนวณ</td>
                <td className="text-right">{table ? fmt(table.avg.pe) : '-'}</td><td className="text-center">tCO₂/year</td>
              </tr>
              <tr>
                {/* No fossil fuel is burned by a solar PV project — '-' rather than
                    a fabricated 0, per the real-data-only rule. */}
                <td className="text-center">PE<sub>FF,y</sub></td><td>ปริมาณการปล่อยก๊าซเรือนกระจกจากการใช้เชื้อเพลิงฟอสซิลในการดำเนินโครงการในปี y</td>
                <td className="text-center">การคำนวณ</td>
                <td className="text-right">-</td><td className="text-center">tCO₂/year</td>
              </tr>
              <tr>
                {/* PE_FF,y is nil, so grid electricity is the whole of PE_y. */}
                <td className="text-center">PE<sub>EL,y</sub></td><td>ปริมาณการปล่อยก๊าซเรือนกระจกจากการใช้ไฟฟ้าในการดำเนินโครงการในปี y</td>
                <td className="text-center">การคำนวณ</td>
                <td className="text-right">{table ? fmt(table.avg.pe) : '-'}</td><td className="text-center">tCO₂/year</td>
              </tr>
              <tr>
                <td className="text-center">EC<sub>PJ,y</sub></td><td>ปริมาณไฟฟ้าจากระบบสายส่งที่ใช้ในการดำเนินโครงการ ในปี y</td>
                <td className="text-center">คาดการณ์</td>
                <td className="text-right">{fmt(ecPj)}</td><td className="text-center">kWh/year</td>
              </tr>
              <tr>
                <td className="text-center">EF<sub>EC,PJ,y</sub></td><td>ค่าการปล่อยก๊าซเรือนกระจกสำหรับการใช้ไฟฟ้า ในปี y</td>
                <td className="text-center">อบก. ประกาศ</td>
                <td className="text-right">{ef === null || ef === undefined ? '-' : String(ef)}</td><td className="text-center">tCO₂/MWh</td>
              </tr>
            </tbody>
          </table>

          <p className="mt-3 font-bold underline">3.3 การคำนวณปริมาณก๊าซเรือนกระจกนอกขอบเขตโครงการ (Leakage Emission)</p>
          <p className="indent-8">ไม่เกี่ยวข้อง เนื่องจากเป็นโครงการผลิตไฟฟ้าจากพลังงานหมุนเวียน (พลังงานแสงอาทิตย์) ไม่มีการใช้เชื้อเพลิงชีวมวลหรือขยะมูลฝอย</p>

          <p className="mt-3 font-bold underline">3.4 สรุปปริมาณการลดก๊าซเรือนกระจก</p>
          <MethodBlock code={methodology.code} version={methodology.version} name={methodology.name} testId="er-method">
            <p>สมการที่ใช้: ER<sub>y</sub> = BE<sub>y</sub> – PE<sub>y</sub> – LE<sub>y</sub></p>
          </MethodBlock>
          <table data-testid="er-summary-table" className="doc-table w-full">
            <thead>
              <tr className="bg-[#f2f2f2] text-center font-bold"><td>พารามิเตอร์</td><td>ความหมาย</td><td>ค่าที่ได้</td><td>หน่วย</td></tr>
            </thead>
            <tbody>
              <tr>
                <td className="text-center">ER<sub>y</sub></td><td>การลดการปล่อยก๊าซเรือนกระจกในปี y</td>
                {/* The row states ER_y = BE_y − PE_y − LE_y, so it must satisfy its own
                    equation at 2 dp (reference: 1,025.59 − 1.08 = 1,024.51). The
                    floored/averaged headline lives on the cover and in §3.5. */}
                <td className="text-right">{table ? fmt(table.avg.be - table.avg.pe) : '-'}</td><td className="text-center">tCO₂e/year</td>
              </tr>
              <tr>
                <td className="text-center">BE<sub>y</sub></td><td>การปล่อยก๊าซเรือนกระจกจากกรณีฐานในปี y</td>
                <td className="text-right">{table ? fmt(table.avg.be) : '-'}</td><td className="text-center">tCO₂e/year</td>
              </tr>
              <tr>
                <td className="text-center">PE<sub>y</sub></td><td>การปล่อยก๊าซเรือนกระจกจากการดำเนินโครงการในปี y</td>
                <td className="text-right">{table ? fmt(table.avg.pe) : '-'}</td><td className="text-center">tCO₂e/year</td>
              </tr>
              <tr>
                {/* Leakage is nil for this methodology (§3.3), so 0.00 is the
                    methodology's value, not a stand-in for missing data. */}
                <td className="text-center">LE<sub>y</sub></td><td>การปล่อยก๊าซเรือนกระจกนอกขอบเขตโครงการในปี y</td>
                <td className="text-right">{fmt(0)}</td><td className="text-center">tCO₂e/year</td>
              </tr>
            </tbody>
          </table>

          <p className="mt-3 font-bold underline">3.5 สรุปปริมาณก๊าซเรือนกระจกที่คาดว่าจะลด/กักเก็บได้</p>
          <div className="mt-1 pl-4">
            <p>ระยะเวลาการคิดเครดิตของโครงการ</p>
            <div className="pl-4">
              <Check on={has('crediting_years', '7')}>{has('crediting_years', '7') ? creditingPeriod : '7 ปี'}</Check>
              <Check on={has('crediting_years', '10')}>{has('crediting_years', '10') ? creditingPeriod : '10 ปี'}</Check>
            </div>
          </div>
          {table ? (
            <table className="doc-table mt-1 w-full" data-testid="yearly-table">
              <thead>
                <tr className="bg-[#f2f2f2] text-center font-bold">
                  <td>ปี</td>
                  <td>ปริมาณก๊าซเรือนกระจกจากกรณีฐาน</td>
                  <td>ปริมาณก๊าซเรือนกระจกจากการดำเนินโครงการ</td>
                  <td>ปริมาณก๊าซเรือนกระจกนอกขอบเขตโครงการ</td>
                  <td>ปริมาณการลดก๊าซเรือนกระจก</td>
                </tr>
              </thead>
              <tbody>
                {table.rows.map((r) => (
                  <tr key={r.year}>
                    {/* Reference p.20 dates every year: "1 (1/1/2565 – 31/12/2565)". */}
                    <td className="text-center">{`${r.year} ${creditingYearRange(d.crediting_start, r.year)}`.trim()}</td>
                    <td className="text-right">{fmt(r.be)}</td>
                    <td className="text-right">{fmt(r.pe)}</td>
                    <td className="text-center">{r.le}</td>
                    <td className="text-right">{fmtInt(r.er)}</td>
                  </tr>
                ))}
                <tr className="font-bold">
                  <td className="text-center">รวม (tCO₂eq)</td>
                  <td className="text-right">{fmt(table.totals.be)}</td>
                  <td className="text-right">{fmt(table.totals.pe)}</td>
                  <td className="text-center">{table.totals.le}</td>
                  <td className="text-right">{fmtInt(table.totals.er)}</td>
                </tr>
                <tr>
                  <td className="text-center">จำนวนปี</td>
                  <td className="text-center">{table.years}</td>
                  <td className="text-center">{table.years}</td>
                  <td className="text-center">{table.years}</td>
                  <td className="text-center">{table.years}</td>
                </tr>
                <tr className="font-bold">
                  <td className="text-center">เฉลี่ยปีละ (tCO₂eq/y)</td>
                  <td className="text-right">{fmt(table.avg.be)}</td>
                  <td className="text-right">{fmt(table.avg.pe)}</td>
                  <td className="text-center">{table.avg.le}</td>
                  <td className="text-right">{fmtInt(table.avg.er)}</td>
                </tr>
              </tbody>
            </table>
          ) : (
            <p className="pl-8 text-red-600">ยังคำนวณไม่ได้ — ไม่พบค่า Emission Factor สำหรับประเทศของโครงการ</p>
          )}
        </Page>

        {/* ============ ส่วนที่ 4 แผนการติดตามผล ============ */}
        <Page formLabel={formLabel}>
          <SectionBar>ส่วนที่ 4 แผนการติดตามผลการดำเนินโครงการ</SectionBar>

          <p className="font-bold underline">4.1 สรุปแนวทางการติดตามผล</p>
          {/* Reference p.21 narrative. The meter-check / calibration intervals are
              the operator's own commitments, so they come from qaqc_procedure
              rather than being asserted here. */}
          <p className="indent-8">
            การติดตามผลการลดการปล่อยก๊าซเรือนกระจกที่เกิดขึ้นจากโครงการนี้ จะดำเนินการโดย {str('project_owner')} ในฐานะผู้พัฒนาโครงการ
            โดยจะมีการบันทึกค่าพลังงานที่ผลิตได้รายวัน รายเดือน และรายปี ผ่านมิเตอร์ซื้อขายไฟฟ้า (Energy Meter)
            และได้กำหนดแนวทางการติดตามผลและหน้าที่รับผิดชอบ รายละเอียดขั้นตอนการจัดเก็บข้อมูล บันทึก การคำนวณ และการรายงานดังภาพที่ 7 และ 8
            {str('qaqc_procedure') !== '-' ? ` ทั้งนี้ มาตรการควบคุมคุณภาพข้อมูล: ${str('qaqc_procedure')}` : ''}
            {/* แบบเดี่ยว (MCRU p.19) has no maintenance plan, so the clause pointing
                at one is bundle-only along with the plan itself. */}
            {bundle && ` และบำรุงรักษาระบบและอุปกรณ์ต่างๆ ตามแผนบำรุงรักษาประจำปี เพื่อตรวจสอบสภาพทางกายภาพของแผงเซลล์แสงอาทิตย์ และสภาพระบบโดยรวม ดังตารางที่ ${maintenanceTableNo}`}
          </p>
          <BoundaryDiagram capacityKwp={fmt(totalKwp)} owner={ownerName} bundle={bundle} />
          {/* Fixed at 7 / 8 by the official form. Deriving them from the number of
              uploaded site photos made the captions drift with the evidence set. */}
          <p className="text-center font-bold">ภาพที่ 7 รูปแสดงผังจุดตรวจวัด พร้อมข้อมูล/ตัวแปรที่จัดเก็บ</p>
          <DataFlowDiagram measurement={str('measurement_method')} />
          <p className="text-center font-bold">ภาพที่ 8 แผนผังขั้นตอนการจัดเก็บข้อมูล และกระบวนการควบคุมคุณภาพ</p>
          {bundle && (
            <>
              <p className="mt-3 font-bold">ตารางที่ {maintenanceTableNo} แผนการบำรุงรักษาประจำปีของแต่ละพื้นที่ในโครงการ</p>
              <table data-testid="maintenance-table" className="doc-table w-full">
                <thead><tr><th>ลำดับ</th><th>ชื่อโครงการ</th><th>ความถี่ (ครั้ง/ปี)</th></tr></thead>
                <tbody>
                  {sites.map((s, i) => (
                    <tr key={`${s.owner}-${i}`}>
                      <td className="text-center">{i + 1}</td>
                      <td>{s.owner || '-'}</td>
                      <td className="text-center">{s.maintenance_per_year === null ? '-' : s.maintenance_per_year}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p>หมายเหตุ: อ้างอิงตามแผนการบำรุงรักษาของ {str('project_owner')}</p>
            </>
          )}

          {/* The aggregated reference's annual maintenance checklist (p.22-23).
              The แบบเดี่ยว reference (MCRU) has none, so it is bundle-only. */}
          {bundle && (
            <>
              <p className="mt-3 font-bold underline">รายละเอียดแผนการบำรุงรักษาประจำปี</p>
              <ol data-testid="maintenance-detail" className="mt-1 list-decimal pl-12">
                {MAINTENANCE_TOPICS.map((t) => (
                  <li key={t.topic} className="mt-1">
                    {t.topic}
                    <ul className="list-disc pl-6">
                      {t.items.map((i) => <li key={i}>{i}</li>)}
                    </ul>
                  </li>
                ))}
              </ol>
            </>
          )}

          <p className="mt-3 font-bold underline">4.2 พารามิเตอร์ที่ไม่ต้องติดตามผล</p>
          <p className="pl-8">ไม่มีพารามิเตอร์ที่ไม่ต้องติดตาม ที่ใช้ในการคำนวณตามระเบียบวิธีการลดก๊าซเรือนกระจกที่เลือกใช้</p>

          <p className="mt-3 font-bold underline">4.3 พารามิเตอร์ที่ต้องติดตามผล</p>
          <table className="doc-table keep-together mt-1 w-full">
            <tbody>
              <tr><td className="w-40 bg-[#f2f2f2] font-bold">พารามิเตอร์</td><td>EF<sub>EC,PJ,y</sub></td></tr>
              <tr><td className="bg-[#fbeeee] font-bold">หน่วย</td><td>tCO₂/MWh</td></tr>
              <tr><td className="bg-[#fbeeee] font-bold">ความหมาย</td><td>ค่าการปล่อยก๊าซเรือนกระจกสำหรับการใช้ไฟฟ้า ในปี y</td></tr>
              <tr><td className="bg-[#fbeeee] font-bold">แหล่งข้อมูล</td><td>ข้อมูลจากรายงานค่าการปล่อยก๊าซเรือนกระจกจากการผลิต/การใช้ไฟฟ้า (Emission Factor) สำหรับโครงการและกิจกรรมลดก๊าซเรือนกระจกที่ประกาศโดย อบก.</td></tr>
              <tr><td className="bg-[#fbeeee] font-bold">วิธีการติดตามผล</td><td>ใช้ค่า EF<sub>EC,PJ,y</sub> ที่ อบก. ประกาศตามปี พ.ศ. ของช่วงระยะเวลาที่ขอรับรองคาร์บอนเครดิต ทั้งนี้ กรณีที่ปี พ.ศ. ของช่วงระยะเวลาที่ขอรับรองคาร์บอนเครดิตนั้นยังไม่มีค่า EF<sub>EC,PJ,y</sub> ที่ อบก. ประกาศ ให้ใช้ค่า EF<sub>EC,PJ,y</sub> ล่าสุดที่ อบก. ประกาศแทนในปีนั้น</td></tr>
            </tbody>
          </table>
          <table className="doc-table keep-together mt-3 w-full">
            <tbody>
              <tr><td className="w-40 bg-[#f2f2f2] font-bold">พารามิเตอร์</td><td>EG<sub>Consumer,PJ,y</sub></td></tr>
              <tr><td className="bg-[#fbeeee] font-bold">หน่วย</td><td>kWh/year</td></tr>
              <tr><td className="bg-[#fbeeee] font-bold">ความหมาย</td><td>ปริมาณไฟฟ้าที่ผลิตได้เพื่อใช้เองจากการดำเนินโครงการพลังงานหมุนเวียน ในปี y</td></tr>
              <tr><td className="bg-[#fbeeee] font-bold">แหล่งข้อมูล</td><td>รายงานการตรวจวัด</td></tr>
              <tr><td className="bg-[#fbeeee] font-bold">วิธีการติดตามผล</td><td>
                {str('eg_monitoring_method') !== '-' ? str('eg_monitoring_method')
                  : 'ตรวจวัดโดย kWh Meter และตรวจวัดต่อเนื่องตลอดช่วงของการติดตามผล โดยรายงานข้อมูลที่มีความละเอียดเป็นรายเดือน'}
                {egDeductionPct > 0 && ` โดยผู้พัฒนาโครงการจะหักข้อมูลปริมาณไฟฟ้าที่ตรวจวัดได้ออก ${egDeductionPct.toLocaleString('en-US', { maximumFractionDigits: 2 })}% ก่อนนำไปคำนวณหาปริมาณก๊าซเรือนกระจกที่ลดได้`}
              </td></tr>
            </tbody>
          </table>
          <table className="doc-table keep-together mt-3 w-full">
            <tbody>
              <tr><td className="w-40 bg-[#f2f2f2] font-bold">พารามิเตอร์</td><td>EC<sub>PJ,y</sub></td></tr>
              <tr><td className="bg-[#fbeeee] font-bold">หน่วย</td><td>kWh/year</td></tr>
              <tr><td className="bg-[#fbeeee] font-bold">ความหมาย</td><td>ปริมาณการใช้ไฟฟ้าจากระบบสายส่งในการดำเนินโครงการ ในปี y</td></tr>
              <tr><td className="bg-[#fbeeee] font-bold">แหล่งข้อมูล</td><td>รายงานการตรวจวัด</td></tr>
              <tr><td className="bg-[#fbeeee] font-bold">วิธีการติดตามผล</td><td>คำนวณจากค่าพิกัดกำลังไฟฟ้าจากผู้ผลิตอุปกรณ์ และบันทึกชั่วโมงการทำงานของอุปกรณ์ โดยตรวจวัดชั่วโมงการทำงานต่อเนื่องตลอดช่วงของการติดตามผล และรายงานข้อมูลที่มีความละเอียดเป็นรายเดือน</td></tr>
            </tbody>
          </table>
        </Page>

        {/* ============ ภาคผนวก ============ */}
        {consumers.length > 0 && (
          <Page formLabel={formLabel}>
            <SectionBar>ภาคผนวก</SectionBar>
            {/* Reference p.32. หมายเหตุ is this app's own column, so it appears only
                when a row actually carries a note. */}
            <p className="mt-2 text-center font-bold">ตารางแสดงปริมาณการใช้ไฟฟ้าสำหรับอุปกรณ์ประกอบการติดตั้ง</p>
            <table data-testid="consumers-table" className="doc-table mt-1 w-full">
              <thead>
                <tr className="bg-[#f2f2f2] text-center font-bold">
                  <td>อุปกรณ์</td><td>จำนวน (ชุด)</td><td>กำลังไฟ (W)</td><td>ชั่วโมงทำงานต่อปี</td><td>พลังงานไฟฟ้ารวมต่อปี (kWh)</td>
                  {consumersHaveNotes && <td>หมายเหตุ</td>}
                </tr>
              </thead>
              <tbody>
                {consumers.map((r, i) => {
                  const kwh = consumerKwh(r);
                  return (
                    <tr key={i}>
                      <td>{String(r.equipment ?? '-')}</td>
                      <td className="text-center">{cellStr(r.qty) === '' ? '1' : fmtInt(Number(r.qty))}</td>
                      <td className="text-center">{cellStr(r.rated_w) === '' ? '-' : fmt(Number(r.rated_w))}</td>
                      <td className="text-center">{cellStr(r.hours_per_year) === '' ? '-' : fmtInt(Number(r.hours_per_year))}</td>
                      <td className="text-right">{kwh === null ? '-' : fmt(kwh)}</td>
                      {consumersHaveNotes && <td>{cellStr(r.note)}</td>}
                    </tr>
                  );
                })}
                <tr className="font-bold">
                  <td colSpan={4} className="text-center">รวม</td>
                  <td className="text-right" data-testid="ecpj-total">{fmt(ecPj)}</td>
                  {consumersHaveNotes && <td />}
                </tr>
              </tbody>
            </table>
          </Page>
        )}

        {/* ============ ภาคผนวก — เอกสาร/หลักฐานประกอบ รายพื้นที่ ============
            The official form gives every bundled site its own appendix block
            (p.25-30); an aggregated submission without them is incomplete. */}
        {bundle && (
          <Page formLabel={formLabel}>
            <SectionBar>เอกสาร/หลักฐานประกอบ</SectionBar>
            <div data-testid="site-appendix">
              {sites.map((s, i) => {
                const siteRows = s.owner === '' ? [] : equipmentSpecs.filter((r) => String(r.site ?? '') === s.owner);
                const support = s.owner === ''
                  ? undefined
                  : supportEquipment.find((r) => String(r.site ?? '') === s.owner);
                const supportCell = (k: string) => supportEquipmentValue(support?.[k]);
                const uncategorised = siteRows.filter((r) => appendixEquipmentCategory(String(r.item ?? '')) === -1);
                return (
                  <div key={`${s.owner}-${i}`} data-testid="site-appendix-block" className="keep-together mb-4">
                    <p className="font-bold">{i + 1}) {s.owner || '-'}</p>
                    <p className="mt-1">รายการอุปกรณ์สำหรับผลิตพลังงานไฟฟ้าจากแสงอาทิตย์ของโครงการ</p>
                    <table className="doc-table mt-1 w-full">
                      <tbody>
                        {APPENDIX_EQUIPMENT_ROWS.map((cat, ci) => (
                          <tr key={cat.label}>
                            <td className="w-1/2">{cat.label}</td>
                            <td>{appendixEquipmentValue(siteRows.filter((r) => appendixEquipmentCategory(String(r.item ?? '')) === ci))}</td>
                          </tr>
                        ))}
                        <tr><td>Smart Logger</td><td>{supportCell('smart_logger')}</td></tr>
                        <tr><td>PQM</td><td>{supportCell('pqm')}</td></tr>
                        <tr><td>Internet Router</td><td>{supportCell('router')}</td></tr>
                        <tr><td>Water Pump</td><td>{supportCell('water_pump')}</td></tr>
                        <tr><td>Weather Sensor</td><td>{supportCell('weather_sensor')}</td></tr>
                        {uncategorised.length > 0 && (
                          <tr><td>อื่นๆ</td><td>{appendixEquipmentValue(uncategorised)}</td></tr>
                        )}
                      </tbody>
                    </table>
                    <p className="mt-1">หลักฐานการเชื่อมต่อระบบผลิตไฟฟ้ากับระบบโครงข่ายไฟฟ้าการไฟฟ้าส่วนภูมิภาค/นครหลวง</p>
                  </div>
                );
              })}
            </div>
          </Page>
        )}

        {/* ============ ภาคผนวก — ปริมาณไฟฟ้าคาดการณ์รายปี ============ */}
        {table && (
          <Page formLabel={formLabel}>
            {/* แบบเดี่ยว only: a bundle's forecast is the per-site matrix below
                (reference p.31), and one degradation % cannot describe sites that
                degrade at 0.55% and 0.60%. */}
            {!bundle && (
              <>
                <p className="text-center font-bold">ตารางแสดงปริมาณไฟฟ้าคาดการณ์รายปี</p>
                <table className="doc-table mt-2 w-full" data-testid="forecast-table">
                  <thead>
                    <tr className="bg-[#e7f0e0] text-center font-bold">
                      <td>ปีที่</td><td>ปริมาณการผลิตไฟฟ้าจากระบบ Solar Rooftop (kWh)</td><td>%การเสื่อมของแผงฯ</td>
                    </tr>
                  </thead>
                  <tbody>
                    {table.rows.map((r) => (
                      <tr key={r.year}>
                        <td className="text-center">{r.year}</td>
                        <td className="text-right">{fmtInt(r.generation_kwh)}</td>
                        {/* MCRU p.23: every row prints the annual rate (0.40%), not the
                            loss accumulated since year 1. */}
                        <td className="text-center">{fmt(bundleDegradationPct)}%</td>
                      </tr>
                    ))}
                    <tr className="font-bold">
                      <td className="text-center">รวม</td>
                      <td className="text-right">{fmtInt(table.rows.reduce((a, r) => a + r.generation_kwh, 0))}</td>
                      {/* MCRU p.23 sums the column: 7 × 0.40% = 2.80%. */}
                      <td className="text-center">{fmt(bundleDegradationPct * table.rows.length)}%</td>
                    </tr>
                    <tr className="font-bold">
                      <td className="text-center">เฉลี่ยต่อปี</td>
                      <td className="text-right">{fmtInt(Math.round(table.rows.reduce((a, r) => a + r.generation_kwh, 0) / table.rows.length))}</td>
                      {/* the per-year rate, unchanged — this row is an annual average */}
                      <td className="text-center">{fmt(bundleDegradationPct)}%</td>
                    </tr>
                  </tbody>
                </table>
              </>
            )}
            {bundle && (() => {
              // Each site degrades from its own first-synchronisation year, so a
              // site that is not yet online shows blank — not a fabricated 0.
              // Fallback must match computeYearlyTable's `?? 0` exactly: this table
              // and the totals table above it print the same years on the same
              // page, so a different default would contradict it in the submitted
              // document. Read from `d`, not str() — str() yields '-' when absent.
              // Reference p.31 starts the table at the earliest synchronisation year,
              // so a site that ran before crediting shows its pre-period output and the
              // columns carry ปีที่ N only from the crediting start. Same matrix call
              // shifted back: the crediting-year cells are identical to the totals table.
              const syncYears = sites.map((s) => s.first_sync_year).filter((y): y is number => y !== null);
              const firstYear = Math.min(startYear, ...syncYears);
              const preYears = startYear - firstYear;
              const m = siteGenerationMatrix(sites, firstYear, preYears + years, bundleDegradationPct);
              return (
                <>
                  <p className="mt-3 font-bold">ตารางแสดงปริมาณไฟฟ้าคาดการณ์รายปี (หน่วย: kWh)</p>
                  <table data-testid="sites-forecast" className="doc-table w-full text-[11px]">
                    <thead>
                      <tr>
                        <th rowSpan={2}>รายชื่อโครงการ</th><th rowSpan={2}>First Synchronization</th>
                        {m.years.map((y) => <th key={y}>{y}</th>)}
                      </tr>
                      <tr>
                        {m.years.map((y, j) => <th key={y}>{j < preYears ? '-' : `ปีที่ ${j - preYears + 1}`}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {m.rows.map((r, i) => (
                        <tr key={`${r.site.owner}-${i}`}>
                          <td>{r.site.owner || '-'}</td>
                          <td className="text-center">{r.site.first_sync_year ?? '-'}</td>
                          {r.generation.map((g, j) => <td key={j} className="text-right">{g === 0 ? '' : fmtInt(g)}</td>)}
                        </tr>
                      ))}
                      <tr className="font-bold">
                        <td className="text-center">รวม</td>
                        <td />
                        {m.totals.map((t, j) => <td key={j} className="text-right">{j < preYears ? '' : fmtInt(t)}</td>)}
                      </tr>
                    </tbody>
                  </table>
                </>
              );
            })()}
          </Page>
        )}

        {/* No การประเมินทางด้านการเงิน appendix: the PDD holds no tariff, discount
            rate, O&M or salvage inputs, so the 25-year table could only come from
            PEA default assumptions — not the project's own figures. The MCRU
            reference attaches the preparer's own evaluation instead. */}
      </div>

      <style>{`
        .tver-doc { font-family: 'Sarabun', 'Leelawadee UI', 'Thonburi', 'Tahoma', sans-serif; print-color-adjust: exact; -webkit-print-color-adjust: exact; counter-reset: formpage; }
        /* Official-form page number: every .doc-page (cover included) advances the
           counter, so the first header page reads "หน้า 2" like the TGO original. */
        .tver-doc .doc-page { counter-increment: formpage; }
        .tver-doc .pageno { display: block; background: #3f7ec1; color: #fff; font-weight: 700; text-align: center; padding: 7px 2px; }
        .tver-doc .pageno::after { content: " " counter(formpage); }
        .tver-doc .doc-table { border-collapse: collapse; width: 100%; }
        .tver-doc .doc-table td, .tver-doc .doc-table th { border: 1px solid #333; padding: 4px 8px; vertical-align: top; }
        .tver-doc .page-frame { width: 100%; border-collapse: collapse; }
        .tver-doc .page-frame > thead > tr > td,
        .tver-doc .page-frame > tbody > tr > td,
        .tver-doc .page-frame > tfoot > tr > td {
          border: 0;
          /* 2px right inset — a 100%-wide collapsed table flush with the frame
             cell loses its 1px right border to subpixel clipping when printed */
          padding: 0 2px 0 0;
          vertical-align: top;
        }
        .tver-doc .doc-page { margin-bottom: 2rem; }
        .tver-doc .cover-photo { max-height: 110mm; }
        @media print {
          @page { size: A4; margin: 14mm 12mm; }
          body { background: white; }
          .tver-doc .doc-page { break-after: page; margin-bottom: 0; }
          .tver-doc .doc-page:last-child { break-after: auto; }
          /* fill the printable A4 area (297mm − 2×14mm margins, minus a
             rounding buffer) so the tbody row stretches and pushes the
             tfoot footer to the bottom edge of every sheet */
          .tver-doc .page-frame { height: 265mm; }
          /* never split a table row, figure or parameter card across sheets */
          .tver-doc .doc-table tr { break-inside: avoid; }
          .tver-doc figure, .tver-doc .keep-together { break-inside: avoid; }
          /* keep section headings attached to the content that follows */
          .tver-doc p.underline { break-after: avoid; break-inside: avoid; }
          /* site photos: cap height so one figure never overflows a sheet */
          .tver-doc figure img { max-height: 85mm; object-fit: cover; }
        }
      `}</style>
    </div>
  );
}
