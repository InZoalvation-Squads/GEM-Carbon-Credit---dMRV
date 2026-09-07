import { Fragment, useEffect, useState, type ReactNode } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Printer, ArrowLeft } from 'lucide-react';
import { useStore } from '../store';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { computeFinancialTable, computeYearlyTable, computeEcPj, resolveComputed, bundleCapacityKwp, creditingStartYear } from '../lib/pdd';
import { parseSites, isBundle, sumSiteCapacityKwp, sumSiteYear1Kwh, siteGenerationMatrix } from '../lib/pdd-sites';
import { serverMode, evidenceApi } from '../lib/server-api';
import type { EvidenceFile, PddComputedSource } from '../types';

// ============================================================
// T-VER-S-F001-PDD — official TGO single-project PDD layout.
// Static Thai boilerplate (applicability, emission sources, monitoring
// parameter cards) is identical for every T-VER-S-01 project and lives here;
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

const fmt = (n: number, d = 2) => n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtInt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 0 });

function thaiDate(iso: unknown): string {
  if (typeof iso !== 'string' || !iso) return '-';
  const dt = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(dt.getTime())) return String(iso);
  return dt.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' });
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
function BoundaryDiagram({ capacityKwp, owner }: { capacityKwp: string; owner: string }) {
  const box = 'border border-black bg-white px-2 py-1.5 text-center';
  return (
    <div data-testid="boundary-diagram" className="keep-together mx-auto my-2 flex w-[95%] items-stretch gap-2 text-[11px]">
      <div className="relative flex-1 border-2 border-dashed border-black p-3 pt-4">
        <span className="absolute -top-2 left-3 bg-white px-1">ขอบเขตโครงการ</span>
        <div className="flex items-center gap-1.5">
          <div className={`${box} w-36`}>ระบบผลิตไฟฟ้าพลังงานแสงอาทิตย์ {capacityKwp} kW</div>
          <span>→</span>
          <div className={box}>มิเตอร์</div>
          <span className="flex-1 text-center">EG<sub>Consumer,PJ,y</sub> →</span>
        </div>
        <div className="mt-3 flex items-center justify-end gap-1.5">
          <div className={box}>ใช้เองในโครงการ</div>
          <span>←</span>
          <div className={box}>มิเตอร์</div>
          <span className="text-center">← EC<sub>PJ,y</sub></span>
        </div>
      </div>
      <div className="flex w-32 flex-col justify-between py-2">
        <div className={box}>ผู้ใช้ไฟฟ้า<br />({owner})</div>
        <div className="text-center">↑<br />ระบบสายส่ง PEA</div>
      </div>
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
      <div className="mt-16 text-center text-[26px]">{developer}</div>
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
    return <EmptyState title="PDD not found" hint="This document does not exist." />;
  }

  const d = pdd.section_data as Record<string, unknown>;
  const ctx = { project, factors, sectionData: d };
  // แบบควบรวม: several installation sites bundled under one developer. Site
  // rows drive the capacity/generation totals in place of the parent project.
  const sites = parseSites(d.sites);
  const bundle = isBundle(d);
  const formLabel = bundle ? 'แบบควบรวม' : 'แบบเดี่ยว';
  const totalKwp = bundleCapacityKwp(ctx);
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
  const fin = computeFinancialTable(ctx);
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
  // Table numbering is a single running sequence in แบบควบรวม: 1 sites, 2 equipment
  // by site, 3 installations, then the support-equipment table only when it has
  // rows — so maintenance is 5 with it and 4 without. Single mode never renders
  // the first two, so its maintenance table does not exist at all.
  const maintenanceTableNo = bundle ? (supportEquipment.length > 0 ? 5 : 4) : 4;
  // Existing PDDs predate project_type; this methodology is solar-only, so an
  // absent value means the renewable-energy category rather than "none ticked".
  const projectType = str('project_type') !== '-' ? str('project_type') : PROJECT_TYPES[0];
  // ตารางที่ 2 (แบบควบรวม): equipment rows grouped under the site they belong to.
  // Rows whose `site` matches no site row are kept in a trailing ไม่ระบุพื้นที่
  // group rather than dropped — an unmatched row is a data-entry problem the
  // reviewer must see, not something the document may silently swallow.
  const equipmentGroups: Array<{ label: string; rows: Array<Record<string, unknown>> }> = bundle
    ? (() => {
        const matched = new Set<Record<string, unknown>>();
        const groups = sites.map((s) => {
          const rows = equipmentSpecs.filter((r) => String(r.site ?? '') === s.owner && s.owner !== '');
          rows.forEach((r) => matched.add(r));
          return { label: s.owner || '-', rows };
        });
        const orphans = equipmentSpecs.filter((r) => !matched.has(r));
        return orphans.length > 0 ? [...groups, { label: 'ไม่ระบุพื้นที่', rows: orphans }] : groups;
      })()
    : [];
  const address = typeof d.project_address === 'string' && d.project_address !== '' ? d.project_address : project.location;
  const ownerName = typeof d.owner_name === 'string' && d.owner_name !== '' ? d.owner_name : str('project_owner');
  const consumers = (Array.isArray(d.consumers) ? d.consumers : []) as Array<Record<string, unknown>>;
  const ecPj = computeEcPj(consumers);
  const consumerKwh = (r: Record<string, unknown>): number | null => {
    const direct = Number(r.kwh_year);
    if (r.kwh_year !== undefined && r.kwh_year !== null && r.kwh_year !== '' && !Number.isNaN(direct)) return direct;
    const w = Number(r.rated_w); const h = Number(r.hours_per_year);
    if (r.rated_w === undefined || r.rated_w === '' || r.hours_per_year === undefined || r.hours_per_year === '') return null;
    if (Number.isNaN(w) || Number.isNaN(h)) return null;
    return (w * h) / 1000;
  };
  const years = table?.years ?? Number(str('crediting_years')) ?? 7;
  const creditingLabel = `${str('crediting_years')} ปี (เริ่ม ${thaiDate(d.crediting_start)})`;
  const siteImages = pddSiteImages(allEvidence, project.id);
  // Explicitly chosen cover leaves the section-1 figures (the official doc
  // never repeats it); a fallback first-image cover stays in the figures so
  // no installation photo silently disappears.
  const explicitCover = siteImages.find((img) => img.id === d.cover_evidence_id);
  const coverImage = pickCoverImage(siteImages, d.cover_evidence_id);
  // Section-1 figures = site images minus an explicitly chosen cover; the
  // monitoring diagrams continue that numbering (MCRU: photos 1-7 → 8, 9).
  const figureCount = siteImages.filter((img) => img.id !== explicitCover?.id).length;

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link to={`/registration/${pdd.id}/document`}>
          <Button variant="ghost"><ArrowLeft size={16} /> Back to document</Button>
        </Link>
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
              <tr>
                <td className="font-bold">เจ้าของโครงการ</td>
                <td>
                  {bundle ? (
                    <table data-testid="owners-by-site" className="doc-table w-full">
                      <tbody>
                        {sites.map((s, i) => (
                          <tr key={`${s.owner}-${i}`}>
                            <td>{s.owner || '-'}</td>
                            <td className="whitespace-pre-wrap">{s.address || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : ownerName}
                </td>
              </tr>
              <tr>
                <td className="font-bold">ที่ตั้งโครงการ</td>
                <td className="whitespace-pre-wrap">
                  {bundle
                    ? sites.map((s, i) => <div key={`${s.owner}-${i}`}>{i + 1}. {s.address || '-'}</div>)
                    : address}
                </td>
              </tr>
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
                <td>{methodology.code} {methodology.name} ({methodology.version})</td>
              </tr>
              <tr>
                <td className="font-bold">กิจกรรมของโครงการ</td>
                <td>{str('after_project')}</td>
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
                  <Check on={has('crediting_years', '7')}>7 ปี {has('crediting_years', '7') ? `(เริ่ม ${thaiDate(d.crediting_start)})` : ''}</Check>
                  <Check on={has('crediting_years', '10')}>10 ปี {has('crediting_years', '10') ? `(เริ่ม ${thaiDate(d.crediting_start)})` : ''}</Check>
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
          {d.permit_no !== undefined && d.permit_no !== '' && (
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
              <p className="mt-3 font-bold">ตารางที่ 1 รายละเอียดโครงการเบื้องต้น กำลังผลิตติดตั้งและปริมาณไฟฟ้าที่คาดว่าจะผลิตได้</p>
              <table data-testid="sites-table" className="doc-table w-full">
                <thead>
                  <tr>
                    <th>ลำดับ</th><th>เจ้าของโครงการ</th><th>ผู้พัฒนาโครงการ</th>
                    <th>กำลังการผลิตติดตั้ง (kWp)</th><th>ปริมาณไฟฟ้าปีที่ 1 (kWh/year)</th>
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
                    <td colSpan={2} className="text-center">รวม</td><td />
                    <td className="text-right">{totalSiteKwp === null ? '-' : fmt(totalSiteKwp, 3)}</td>
                    <td className="text-right">{totalYear1 === null ? '-' : fmtInt(totalYear1)}</td>
                  </tr>
                </tbody>
              </table>
            </>
          )}
          <BoundaryDiagram capacityKwp={fmt(totalKwp)} owner={ownerName} />
          <p className="text-center font-bold">รูปที่ 1 ขอบเขตของโครงการ</p>
          {equipmentSpecs.length > 0 && (
            <>
              <p className="mt-2 indent-8">เทคโนโลยีที่ใช้ในโครงการจะเป็นเทคโนโลยีผลิตไฟฟ้าจากแผงเซลล์แสงอาทิตย์ ซึ่งประกอบไปด้วย</p>
              {bundle ? (
                <>
                  <p className="mt-2 text-center font-bold">ตารางที่ 2 รายการอุปกรณ์หลักสำหรับผลิตพลังงานไฟฟ้าจากแสงอาทิตย์ของโครงการ</p>
                  <table data-testid="equipment-by-site" className="doc-table mt-1 w-full">
                    <thead>
                      <tr className="bg-[#f2f2f2] text-center font-bold">
                        <td>ลำดับ</td><td>ชื่อโครงการ</td><td>รายการ</td><td>ยี่ห้อ</td><td>รุ่น</td><td>ขนาด/สเปค</td><td>จำนวน</td>
                      </tr>
                    </thead>
                    <tbody>
                      {equipmentGroups.map((g, gi) => {
                        // A site with no equipment rows still gets one row of '-' so the
                        // reviewer sees the gap instead of the site disappearing.
                        const rows = g.rows.length > 0 ? g.rows : [null];
                        return rows.map((r, ri) => (
                          <tr key={`${g.label}-${gi}-${ri}`}>
                            {ri === 0 && <td rowSpan={rows.length} className="text-center">{gi + 1}</td>}
                            {ri === 0 && <td rowSpan={rows.length}>{g.label}</td>}
                            <td>{r === null ? '-' : String(r.item ?? '-')}</td>
                            <td>{r === null || r.brand === undefined || r.brand === '' ? '-' : String(r.brand)}</td>
                            <td>{r === null || r.model === undefined || r.model === '' ? '-' : String(r.model)}</td>
                            <td>{r === null || r.spec === undefined || r.spec === '' ? '-' : String(r.spec)}</td>
                            <td className="text-center">{r === null || r.qty === undefined || r.qty === '' ? '-' : fmtInt(Number(r.qty))}</td>
                          </tr>
                        ));
                      })}
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
              <p className="mt-2 text-center font-bold">{bundle ? 'ตารางที่ 3' : 'ตารางที่ 1'} รายละเอียดอุปกรณ์หลักที่ติดตั้งในโครงการ</p>
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
                {bundle ? 'ตารางที่ 4' : 'ตารางที่ 2'} รายการอุปกรณ์สนับสนุนสำหรับผลิตพลังงานไฟฟ้าจากแสงอาทิตย์ของโครงการ
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
            <Check on={has('crediting_years', '7')}>7 ปี</Check>
            <Check on={has('crediting_years', '10')}>10 ปี</Check>
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
          <table className="doc-table mt-1 w-full">
            <thead>
              <tr className="bg-[#f2f2f2] text-center font-bold"><td className="w-1/2">เงื่อนไขของกิจกรรมโครงการ</td><td>เหตุผลของโครงการ</td></tr>
            </thead>
            <tbody>
              <tr>
                <td>เป็นโครงการที่มีกิจกรรมการผลิตไฟฟ้าจากพลังงานหมุนเวียนหรือทดแทนการผลิตไฟฟ้าจากเชื้อเพลิงฟอสซิล เพื่อใช้เองหรือจำหน่ายเข้าระบบสายส่ง (Greenfield / Retrofit / Replacement)</td>
                <td><span className="underline">เข้าข่าย</span> เนื่องจากเป็นโครงการผลิตไฟฟ้าจากพลังงานแสงอาทิตย์ ซึ่งเป็นพลังงานหมุนเวียน เพื่อทดแทนการใช้ไฟฟ้าจากเชื้อเพลิงฟอสซิลจากระบบสายส่ง</td>
              </tr>
              <tr>
                <td>กรณีการผลิตไฟฟ้าจากเชื้อเพลิงชีวมวลหรือขยะมูลฝอยที่มีกำลังการผลิตติดตั้งรวมเกิน 15 MW และระยะทางขนส่งเชื้อเพลิงนอกรัศมี 200 กิโลเมตร ต้องประเมินการปล่อยนอกขอบเขตโครงการ</td>
                <td><span className="underline">ไม่เกี่ยวข้อง</span> เนื่องจากไม่มีการใช้เชื้อเพลิงชีวมวลหรือขยะมูลฝอยในการผลิตไฟฟ้า</td>
              </tr>
              <tr>
                <td>กรณีการผลิตไฟฟ้าจากพลังงานหมุนเวียนระดับชุมชน ต้องมีกำลังการผลิตติดตั้งรวมไม่เกิน 100 kW และผลิตเพื่อใช้เองในชุมชน</td>
                <td><span className="underline">ไม่เกี่ยวข้อง</span> เนื่องจากไม่เป็นการผลิตไฟฟ้าเพื่อใช้เองในชุมชน</td>
              </tr>
              <tr>
                <td>กรณีการนำก๊าซชีวภาพนอกขอบเขตโครงการมาใช้ประโยชน์ ต้องประเมินการปล่อยก๊าซเรือนกระจกจากก๊าซชีวภาพที่รั่วไหลและการเผาทำลาย</td>
                <td><span className="underline">ไม่เกี่ยวข้อง</span> เนื่องจากไม่มีการนำก๊าซชีวภาพนอกขอบเขตโครงการมาใช้ประโยชน์</td>
              </tr>
            </tbody>
          </table>

          <p className="mt-3 font-bold underline">2.3 ข้อมูลที่เกี่ยวข้องต่อการคำนวณปริมาณการปล่อยก๊าซเรือนกระจก</p>
          <table className="doc-table mt-1 w-full">
            <thead>
              <tr className="bg-[#f2f2f2] text-center font-bold"><td>แหล่งปล่อยก๊าซเรือนกระจก</td><td>ชนิดก๊าซ</td><td>รายละเอียดของกิจกรรมโครงการ</td></tr>
            </thead>
            <tbody>
              <tr><td colSpan={3} className="bg-[#f7f7f7] font-bold">การปล่อยก๊าซเรือนกระจกจากกรณีฐาน</td></tr>
              <tr>
                <td>การผลิตไฟฟ้าของระบบสายส่ง</td><td className="text-center">CO₂</td>
                <td>การเผาไหม้เชื้อเพลิงฟอสซิลเพื่อผลิตไฟฟ้าของระบบสายส่ง</td>
              </tr>
              <tr><td colSpan={3} className="bg-[#f7f7f7] font-bold">การปล่อยก๊าซเรือนกระจกจากการดำเนินโครงการ</td></tr>
              <tr>
                <td>การใช้ไฟฟ้า</td><td className="text-center">CO₂</td>
                <td>ไฟฟ้าจากระบบสายส่งที่ใช้กับอุปกรณ์ของโครงการในช่วงเวลากลางคืนและช่วงที่ระบบผลิตได้ไม่เพียงพอ</td>
              </tr>
              <tr><td colSpan={3} className="bg-[#f7f7f7] font-bold">การปล่อยก๊าซเรือนกระจกนอกขอบเขตโครงการ</td></tr>
              <tr><td>การขนส่งเชื้อเพลิง / ระบบก๊าซชีวภาพ</td><td className="text-center">CO₂, CH₄</td><td>ไม่เกี่ยวข้อง</td></tr>
            </tbody>
          </table>
        </Page>

        {/* ============ ส่วนที่ 3 การคำนวณ ============ */}
        <Page formLabel={formLabel}>
          <SectionBar>ส่วนที่ 3 การคำนวณการลดก๊าซเรือนกระจก</SectionBar>

          <p className="font-bold underline">3.1 การคำนวณปริมาณก๊าซเรือนกระจกกรณีฐาน (Baseline Emission)</p>
          <p className="mt-1 pl-8">สมการที่ใช้: BE<sub>y</sub> = (EG<sub>Consumer,PJ,y</sub> × 10⁻³) × EF<sub>EC,PJ,y</sub></p>
          <table className="doc-table mt-1 w-full">
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
                <td className="text-center">EG<sub>Consumer,PJ,y</sub></td><td>ปริมาณไฟฟ้าที่ผลิตได้เพื่อใช้เองจากการดำเนินโครงการพลังงานหมุนเวียน ในปี y (เฉลี่ย)</td>
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

          <p className="mt-3 font-bold underline">3.2 การคำนวณปริมาณก๊าซเรือนกระจกจากการดำเนินโครงการ (Project Emission)</p>
          <p className="mt-1 pl-8">สมการที่ใช้: PE<sub>y</sub> = PE<sub>FF,y</sub> + PE<sub>EL,y</sub> โดย PE<sub>EL,y</sub> = (EC<sub>PJ,y</sub> × 10⁻³) × EF<sub>EC,PJ,y</sub></p>
          <table className="doc-table mt-1 w-full">
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

          <p className="mt-3 font-bold underline">3.4 สรุปปริมาณการลดก๊าซเรือนกระจก (ER<sub>y</sub> = BE<sub>y</sub> − PE<sub>y</sub> − LE<sub>y</sub>)</p>
          <p className="mt-3 font-bold underline">3.5 สรุปปริมาณก๊าซเรือนกระจกที่คาดว่าจะลด/กักเก็บได้ — {creditingLabel}</p>
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
                    <td className="text-center">{r.year}</td>
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
          <p className="indent-8">
            พารามิเตอร์ที่ติดตาม: {str('monitored_parameter')} · วิธีตรวจวัด: {str('measurement_method')} ·
            ความถี่: {str('monitoring_frequency')}
          </p>
          <p className="mt-1 indent-8">QA/QC: {str('qaqc_procedure')}</p>
          <BoundaryDiagram capacityKwp={fmt(totalKwp)} owner={ownerName} />
          <p className="text-center font-bold">ภาพที่ {figureCount + 1} รูปแสดงผังจุดตรวจวัด พร้อมข้อมูล/ตัวแปรที่จัดเก็บ</p>
          <DataFlowDiagram measurement={str('measurement_method')} />
          <p className="text-center font-bold">ภาพที่ {figureCount + 2} แผนผังขั้นตอนการจัดเก็บข้อมูล และกระบวนการควบคุมคุณภาพ</p>
          {bundle && (
            <>
              <p className="mt-3 font-bold">ตารางที่ {maintenanceTableNo} แผนการบำรุงรักษาประจำปีของแต่ละพื้นที่ในโครงการ</p>
              <table data-testid="maintenance-table" className="doc-table w-full">
                <thead><tr><th>ลำดับ</th><th>เจ้าของโครงการ</th><th>ความถี่ (ครั้ง/ปี)</th></tr></thead>
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
              <tr><td className="bg-[#fbeeee] font-bold">แหล่งข้อมูล</td><td>รายงานค่า Emission Factor สำหรับโครงการลดก๊าซเรือนกระจกที่ประกาศโดย อบก.</td></tr>
              <tr><td className="bg-[#fbeeee] font-bold">วิธีการติดตามผล</td><td>ใช้ค่าที่ อบก. ประกาศตามปีของช่วงระยะเวลาที่ขอรับรองคาร์บอนเครดิต หากปีนั้นยังไม่ประกาศ ให้ใช้ค่าล่าสุดแทน</td></tr>
            </tbody>
          </table>
          <table className="doc-table keep-together mt-3 w-full">
            <tbody>
              <tr><td className="w-40 bg-[#f2f2f2] font-bold">พารามิเตอร์</td><td>EG<sub>Consumer,PJ,y</sub></td></tr>
              <tr><td className="bg-[#fbeeee] font-bold">หน่วย</td><td>kWh/year</td></tr>
              <tr><td className="bg-[#fbeeee] font-bold">ความหมาย</td><td>ปริมาณไฟฟ้าที่ผลิตได้เพื่อใช้เองจากการดำเนินโครงการพลังงานหมุนเวียน ในปี y</td></tr>
              <tr><td className="bg-[#fbeeee] font-bold">แหล่งข้อมูล</td><td>รายงานการตรวจวัด</td></tr>
              <tr><td className="bg-[#fbeeee] font-bold">วิธีการติดตามผล</td><td>{str('measurement_method')} — ความถี่ {str('monitoring_frequency')}</td></tr>
            </tbody>
          </table>
          <table className="doc-table keep-together mt-3 w-full">
            <tbody>
              <tr><td className="w-40 bg-[#f2f2f2] font-bold">พารามิเตอร์</td><td>EC<sub>PJ,y</sub></td></tr>
              <tr><td className="bg-[#fbeeee] font-bold">หน่วย</td><td>kWh/year</td></tr>
              <tr><td className="bg-[#fbeeee] font-bold">ความหมาย</td><td>ปริมาณการใช้ไฟฟ้าจากระบบสายส่งในการดำเนินโครงการ ในปี y</td></tr>
              <tr><td className="bg-[#fbeeee] font-bold">แหล่งข้อมูล</td><td>รายงานการตรวจวัด</td></tr>
              <tr><td className="bg-[#fbeeee] font-bold">วิธีการติดตามผล</td><td>คำนวณจากค่าพิกัดกำลังไฟฟ้าจากผู้ผลิตอุปกรณ์ และบันทึกชั่วโมงการทำงานของอุปกรณ์ รายงานรายเดือน</td></tr>
            </tbody>
          </table>
        </Page>

        {/* ============ ภาคผนวก ============ */}
        {consumers.length > 0 && (
          <Page formLabel={formLabel}>
            <SectionBar>ภาคผนวก — รายการอุปกรณ์ไฟฟ้าและประมาณการไฟฟ้าที่ใช้ในโครงการ</SectionBar>
            <table className="doc-table w-full">
              <thead>
                <tr className="bg-[#f2f2f2] text-center font-bold">
                  <td>รายการอุปกรณ์</td><td>พิกัดอุปกรณ์ (W)</td><td>ชั่วโมงการทำงานต่อปี</td><td>Total (kWh/Year)</td><td>หมายเหตุ</td>
                </tr>
              </thead>
              <tbody>
                {consumers.map((r, i) => {
                  const kwh = consumerKwh(r);
                  return (
                    <tr key={i}>
                      <td>{String(r.equipment ?? '-')}</td>
                      <td className="text-center">{r.rated_w === undefined || r.rated_w === '' ? '-' : fmtInt(Number(r.rated_w))}</td>
                      <td className="text-center">{r.hours_per_year === undefined || r.hours_per_year === '' ? '-' : fmt(Number(r.hours_per_year))}</td>
                      <td className="text-right">{kwh === null ? '-' : fmt(kwh)}</td>
                      <td>{String(r.note ?? '')}</td>
                    </tr>
                  );
                })}
                <tr className="font-bold">
                  <td colSpan={3} className="text-center">รวม</td>
                  <td className="text-right" data-testid="ecpj-total">{fmt(ecPj)}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </Page>
        )}

        {/* ============ ภาคผนวก — ปริมาณไฟฟ้าคาดการณ์รายปี ============ */}
        {table && (
          <Page formLabel={formLabel}>
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
                    <td className="text-center">{fmt(Number(d.degradation_pct ?? 0))}%</td>
                  </tr>
                ))}
                <tr className="font-bold">
                  <td className="text-center">รวม</td>
                  <td className="text-right">{fmtInt(table.rows.reduce((a, r) => a + r.generation_kwh, 0))}</td>
                  <td className="text-center">{fmt(Number(d.degradation_pct ?? 0) * table.rows.length)}%</td>
                </tr>
                <tr className="font-bold">
                  <td className="text-center">เฉลี่ยต่อปี</td>
                  <td className="text-right">{fmtInt(Math.round(table.rows.reduce((a, r) => a + r.generation_kwh, 0) / table.rows.length))}</td>
                  <td className="text-center">{fmt(Number(d.degradation_pct ?? 0))}%</td>
                </tr>
              </tbody>
            </table>
            {bundle && (() => {
              // Each site degrades from its own first-synchronisation year, so a
              // site that is not yet online shows blank — not a fabricated 0.
              // Fallback must match computeYearlyTable's `?? 0` exactly: this table
              // and the totals table above it print the same years on the same
              // page, so a different default would contradict it in the submitted
              // document. Read from `d`, not str() — str() yields '-' when absent.
              const m = siteGenerationMatrix(sites, startYear, years, bundleDegradationPct);
              return (
                <>
                  <p className="mt-3 font-bold">ตารางแสดงปริมาณไฟฟ้าคาดการณ์รายปี (หน่วย: kWh)</p>
                  <table data-testid="sites-forecast" className="doc-table w-full">
                    <thead>
                      <tr><th>รายชื่อโครงการ</th>{m.years.map((y) => <th key={y}>{y}</th>)}</tr>
                    </thead>
                    <tbody>
                      {m.rows.map((r, i) => (
                        <tr key={`${r.site.owner}-${i}`}>
                          <td>{r.site.owner || '-'}</td>
                          {r.generation.map((g, j) => <td key={j} className="text-right">{g === 0 ? '' : fmtInt(g)}</td>)}
                        </tr>
                      ))}
                      <tr className="font-bold">
                        <td className="text-center">รวม</td>
                        {m.totals.map((t, j) => <td key={j} className="text-right">{fmtInt(t)}</td>)}
                      </tr>
                    </tbody>
                  </table>
                </>
              );
            })()}
          </Page>
        )}

        {/* ============ ภาคผนวก — การประเมินทางด้านการเงิน (รูปแบบ PEA) ============ */}
        {fin && (
          <Page formLabel={formLabel}>
            <p className="text-center font-bold">รายละเอียดโครงการ Solar PV จากการประเมินทางด้านการเงินของระบบผลิตไฟฟ้า</p>
            <table className="doc-table mt-2 w-full text-[10.5px]" data-testid="financial-summary">
              <tbody>
                <tr>
                  <td className="font-bold">ขนาดติดตั้ง Solar Rooftop</td><td>{fmt(totalKwp)} kWp</td>
                  <td className="font-bold">เงินลงทุน</td><td className="text-right">{fmtInt(fin.investment_thb)} บาท</td>
                </tr>
                <tr>
                  <td className="font-bold">อัตราค่าไฟฟ้าเฉลี่ย</td><td>{fmt(fin.price_thb_kwh)} บาท/kWh</td>
                  <td className="font-bold">อัตราคิดลด (Discount Rate)</td><td className="text-right">{fmt(fin.discount_rate_pct)}%</td>
                </tr>
                <tr>
                  <td className="font-bold">ผลตอบแทนที่ได้รับ (IRR)</td><td>{fin.irr_pct === null ? '-' : `${fmt(fin.irr_pct)}%`}</td>
                  <td className="font-bold">ระยะเวลาคุ้มทุน ประมาณ</td><td className="text-right">{fin.payback_years === null ? '-' : `${fmt(fin.payback_years)} ปี`}</td>
                </tr>
              </tbody>
            </table>
            <table className="doc-table mt-2 w-full text-[9.5px]" data-testid="financial-table">
              <thead>
                <tr className="bg-[#f2f2f2] text-center font-bold">
                  <td>Year</td><td>Discount Factor {fmt(fin.discount_rate_pct)}%</td>
                  <td>Annual Generation (kWh/y)</td><td>Total Benefit (THB)</td>
                  <td>Total Cost (THB)</td><td>SNPV</td><td>AC.SNPV</td>
                </tr>
              </thead>
              <tbody>
                {fin.rows.map((r) => (
                  <tr key={r.year} className={r.cum_snpv_thb < 0 ? 'text-[#b00]' : ''}>
                    <td className="text-center">{r.year}</td>
                    <td className="text-center">{r.discount_factor.toFixed(3)}</td>
                    <td className="text-right">{r.generation_kwh === null ? '-' : fmtInt(r.generation_kwh)}</td>
                    <td className="text-right">{r.benefit_thb === 0 ? '-' : fmtInt(r.benefit_thb)}</td>
                    <td className="text-right">{r.cost_thb === 0 ? '-' : fmtInt(r.cost_thb)}</td>
                    <td className="text-right">{fmtInt(r.snpv_thb)}</td>
                    <td className="text-right">{fmtInt(r.cum_snpv_thb)}</td>
                  </tr>
                ))}
                <tr className="font-bold">
                  <td colSpan={3} className="text-center">Sum</td>
                  <td className="text-right">{fmtInt(fin.totals.benefit_thb)}</td>
                  <td className="text-right">{fmtInt(fin.totals.cost_thb)}</td>
                  <td />
                  <td className="text-right">{fmtInt(fin.totals.npv_thb)}</td>
                </tr>
              </tbody>
            </table>
            <p className="mt-1 text-[10px] text-[#555]">
              หมายเหตุ: คำนวณจากข้อมูลโครงการจริง (เงินลงทุน {fmt(Number(d.investment_mthb ?? 0))} ล้านบาท, เสื่อมสภาพแผง {fmt(Number(d.degradation_pct ?? 0))}%/ปี)
              ด้วยสมมติฐานมาตรฐานการประเมินของ กฟภ.: ค่าไฟ {fmt(fin.price_thb_kwh)} บาท/kWh · O&M ปีที่ {fin.om_start_year} เป็นต้นไป {fmtInt(fin.om_cost_thb_year)} บาท/ปี ·
              มูลค่าซาก {fmtInt(fin.scrap_thb)} บาท ในปีที่ {fin.lifetime_years}
            </p>
          </Page>
        )}
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
