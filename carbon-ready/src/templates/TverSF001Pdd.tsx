import { useEffect, useState, type ReactNode } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Printer, ArrowLeft } from 'lucide-react';
import { useStore } from '../store';
import { Button } from '../components/Button';
import { EmptyState } from '../components/EmptyState';
import { computeYearlyTable, computeEcPj, resolveComputed } from '../lib/pdd';
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

function HeaderBox() {
  return (
    <table className="doc-table mb-3 w-full">
      <tbody>
        <tr>
          <td rowSpan={3} className="w-20 text-center align-middle">
            <img src="/tgo-logo-notext.svg" alt="T-VER" className="mx-auto h-12 w-auto" />
          </td>
          <td>โครงการลดก๊าซเรือนกระจกภาคสมัครใจตามมาตรฐานของประเทศไทย</td>
          <td rowSpan={2} className="w-40 text-center align-middle">{FORM_CODE}</td>
        </tr>
        <tr><td>Standard T-VER</td></tr>
        <tr>
          <td>เอกสารข้อเสนอโครงการ (PDD) แบบเดี่ยว</td>
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

function Page({ children }: { children: ReactNode }) {
  return (
    <section className="doc-page">
      <HeaderBox />
      {children}
      <Footer />
    </section>
  );
}

/** Active image evidence of the project — the figures embedded in section 1. */
export function pddSiteImages(evidence: EvidenceFile[], projectId: string): EvidenceFile[] {
  return evidence.filter((e) => e.project_id === projectId && e.kind === 'image' && e.status === 'active');
}

/**
 * ภาพประกอบการติดตั้ง — image evidence rendered as numbered figures.
 * Bytes only exist behind the server API, so figures render in server mode
 * only; local-store mode carries evidence metadata without file content.
 */
function EvidenceFigures({ projectId }: { projectId: string }) {
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

  const shown = images.filter((img) => urls[img.id]);
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

export function TverSF001Pdd({ pddId: pddIdProp }: { pddId?: string } = {}) {
  const params = useParams();
  const pddId = pddIdProp ?? params.pddId;
  const pdd = useStore((s) => s.pdds.find((p) => p.id === pddId));
  const methodology = useStore((s) => s.methodologies.find((m) => m.id === pdd?.methodology_id));
  const project = useStore((s) => s.projects.find((p) => p.id === pdd?.project_id));
  const factors = useStore((s) => s.factors);

  if (!pdd || !methodology || !project) {
    return <EmptyState title="PDD not found" hint="This document does not exist." />;
  }

  const d = pdd.section_data as Record<string, unknown>;
  const ctx = { project, factors, sectionData: d };
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

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link to={`/registration/${pdd.id}/document`}>
          <Button variant="ghost"><ArrowLeft size={16} /> Back to document</Button>
        </Link>
        <Button onClick={() => window.print()}><Printer size={16} /> Print / PDF</Button>
      </div>

      <div className="tver-doc bg-white p-8 text-[13px] leading-relaxed text-black shadow print:p-0 print:shadow-none">

        {/* ============ หน้าปก: รายละเอียดโครงการ ============ */}
        <Page>
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
              <tr><td className="font-bold">เจ้าของโครงการ</td><td>{ownerName}</td></tr>
              <tr><td className="font-bold">ที่ตั้งโครงการ</td><td className="whitespace-pre-wrap">{address}</td></tr>
              <tr>
                <td className="font-bold">พิกัดที่ตั้งโครงการ</td>
                <td>
                  {installations.length === 0 ? '-' : installations.map((r, i) => (
                    <div key={i}>{i + 1}. {String(r.building ?? '-')} {String(r.coordinates ?? '')}</div>
                  ))}
                </td>
              </tr>
              <tr>
                <td className="font-bold">ประเภทโครงการ</td>
                <td>
                  <Check on>พลังงานหมุนเวียนหรือพลังงานที่ใช้ทดแทนเชื้อเพลิงฟอสซิล</Check>
                  <Check on={false}>การเพิ่มประสิทธิภาพในการผลิตไฟฟ้าและการผลิตความร้อน</Check>
                  <Check on={false}>การเพิ่มประสิทธิภาพการใช้พลังงานในอาคารและโรงงาน และในครัวเรือน</Check>
                  <Check on={false}>การจัดการขยะมูลฝอย / น้ำเสีย / ก๊าซมีเทน</Check>
                  <Check on={false}>การลด ดูดซับ และการกักเก็บก๊าซเรือนกระจกจากภาคป่าไม้และการเกษตร</Check>
                  <Check on={false}>อื่นๆ</Check>
                </td>
              </tr>
              <tr>
                <td className="font-bold">รูปแบบการดำเนินโครงการ</td>
                <td>
                  <Check on>แบบเดี่ยว</Check>
                  <Check on={false}>แบบควบรวม</Check>
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
              <tr>
                <td className="font-bold">ระเบียบวิธีการลดก๊าซเรือนกระจก และเครื่องมือคำนวณที่เลือกใช้</td>
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
        <Page>
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
              <tr><td className="font-bold">E-mail</td><td>{str('coordinator_email')}</td></tr>
            </tbody>
          </table>
        </Page>

        {/* ============ ส่วนที่ 1 รายละเอียดโครงการ ============ */}
        <Page>
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
            โครงการผลิตไฟฟ้าจากพลังงานแสงอาทิตย์ ขนาดกำลังติดตั้งรวม {fmt(project.capacity_kwp)} kWp
            ({str('technology')}, {str('grid_connection')}) เพื่อทดแทนการใช้ไฟฟ้าจากระบบสายส่ง
          </p>
          {equipmentSpecs.length > 0 && (
            <>
              <p className="mt-2 indent-8">เทคโนโลยีที่ใช้ในโครงการจะเป็นเทคโนโลยีผลิตไฟฟ้าจากแผงเซลล์แสงอาทิตย์ ซึ่งประกอบไปด้วย</p>
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
            </>
          )}
          {installations.length > 0 && (
            <>
              <p className="mt-2 text-center font-bold">ตารางที่ 1 รายละเอียดอุปกรณ์หลักที่ติดตั้งในโครงการ</p>
              <table className="doc-table mt-1 w-full">
                <thead>
                  <tr className="bg-[#f2f2f2] text-center font-bold">
                    <td>พื้นที่ติดตั้ง</td><td>พิกัด</td><td>จำนวนแผงเซลล์แสงอาทิตย์ (แผ่น)</td>
                    <td>จำนวนอินเวอร์เตอร์ (เครื่อง)</td><td>ขนาดการติดตั้งรวม (kWp)</td>
                  </tr>
                </thead>
                <tbody>
                  {installations.map((r, i) => (
                    <tr key={i}>
                      <td>{String(r.building ?? '-')}</td>
                      <td className="text-center">{String(r.coordinates ?? '-')}</td>
                      <td className="text-center">{r.panels === undefined || r.panels === '' ? '-' : fmtInt(Number(r.panels))}</td>
                      <td className="text-center">{r.inverters === undefined || r.inverters === '' ? '-' : fmtInt(Number(r.inverters))}</td>
                      <td className="text-right">{r.kwp === undefined || r.kwp === '' ? '-' : fmt(Number(r.kwp))}</td>
                    </tr>
                  ))}
                  <tr className="font-bold">
                    <td className="text-center" colSpan={2}>รวม</td>
                    <td className="text-center">{fmtInt(installations.reduce((a, r) => a + (Number(r.panels) || 0), 0))}</td>
                    <td className="text-center">{fmtInt(installations.reduce((a, r) => a + (Number(r.inverters) || 0), 0))}</td>
                    <td className="text-right">{fmt(installations.reduce((a, r) => a + (Number(r.kwp) || 0), 0))}</td>
                  </tr>
                </tbody>
              </table>
            </>
          )}
          <EvidenceFigures projectId={project.id} />

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
            <p>วันเริ่มดำเนินโครงการ: {thaiDate(d.crediting_start)}</p>
            <Check on={has('crediting_years', '7')}>7 ปี</Check>
            <Check on={has('crediting_years', '10')}>10 ปี</Check>
          </div>

          <p className="mt-3 font-bold underline">1.6 โครงการประเภทการลด ดูดซับ และการกักเก็บก๊าซเรือนกระจกจากภาคป่าไม้และการเกษตร</p>
          <p className="pl-8">- ไม่เกี่ยวข้อง</p>
        </Page>

        {/* ============ ส่วนที่ 2 ระเบียบวิธี ============ */}
        <Page>
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
        <Page>
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
        <Page>
          <SectionBar>ส่วนที่ 4 แผนการติดตามผลการดำเนินโครงการ</SectionBar>

          <p className="font-bold underline">4.1 สรุปแนวทางการติดตามผล</p>
          <p className="indent-8">
            พารามิเตอร์ที่ติดตาม: {str('monitored_parameter')} · วิธีตรวจวัด: {str('measurement_method')} ·
            ความถี่: {str('monitoring_frequency')}
          </p>
          <p className="mt-1 indent-8">QA/QC: {str('qaqc_procedure')}</p>

          <p className="mt-3 font-bold underline">4.2 พารามิเตอร์ที่ไม่ต้องติดตามผล</p>
          <p className="pl-8">ไม่มีพารามิเตอร์ที่ไม่ต้องติดตาม ที่ใช้ในการคำนวณตามระเบียบวิธีการลดก๊าซเรือนกระจกที่เลือกใช้</p>

          <p className="mt-3 font-bold underline">4.3 พารามิเตอร์ที่ต้องติดตามผล</p>
          <table className="doc-table mt-1 w-full">
            <tbody>
              <tr><td className="w-40 bg-[#f2f2f2] font-bold">พารามิเตอร์</td><td>EF<sub>EC,PJ,y</sub></td></tr>
              <tr><td className="bg-[#fbeeee] font-bold">หน่วย</td><td>tCO₂/MWh</td></tr>
              <tr><td className="bg-[#fbeeee] font-bold">ความหมาย</td><td>ค่าการปล่อยก๊าซเรือนกระจกสำหรับการใช้ไฟฟ้า ในปี y</td></tr>
              <tr><td className="bg-[#fbeeee] font-bold">แหล่งข้อมูล</td><td>รายงานค่า Emission Factor สำหรับโครงการลดก๊าซเรือนกระจกที่ประกาศโดย อบก.</td></tr>
              <tr><td className="bg-[#fbeeee] font-bold">วิธีการติดตามผล</td><td>ใช้ค่าที่ อบก. ประกาศตามปีของช่วงระยะเวลาที่ขอรับรองคาร์บอนเครดิต หากปีนั้นยังไม่ประกาศ ให้ใช้ค่าล่าสุดแทน</td></tr>
            </tbody>
          </table>
          <table className="doc-table mt-3 w-full">
            <tbody>
              <tr><td className="w-40 bg-[#f2f2f2] font-bold">พารามิเตอร์</td><td>EG<sub>Consumer,PJ,y</sub></td></tr>
              <tr><td className="bg-[#fbeeee] font-bold">หน่วย</td><td>kWh/year</td></tr>
              <tr><td className="bg-[#fbeeee] font-bold">ความหมาย</td><td>ปริมาณไฟฟ้าที่ผลิตได้เพื่อใช้เองจากการดำเนินโครงการพลังงานหมุนเวียน ในปี y</td></tr>
              <tr><td className="bg-[#fbeeee] font-bold">แหล่งข้อมูล</td><td>รายงานการตรวจวัด</td></tr>
              <tr><td className="bg-[#fbeeee] font-bold">วิธีการติดตามผล</td><td>{str('measurement_method')} — ความถี่ {str('monitoring_frequency')}</td></tr>
            </tbody>
          </table>
          <table className="doc-table mt-3 w-full">
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
          <Page>
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
      </div>

      <style>{`
        .tver-doc { font-family: 'Sarabun', 'Leelawadee UI', 'Thonburi', 'Tahoma', sans-serif; }
        .tver-doc .doc-table { border-collapse: collapse; width: 100%; }
        .tver-doc .doc-table td, .tver-doc .doc-table th { border: 1px solid #333; padding: 4px 8px; vertical-align: top; }
        .tver-doc .doc-page { margin-bottom: 2rem; }
        @media print {
          @page { size: A4; margin: 14mm 12mm; }
          body { background: white; }
          .tver-doc .doc-page { break-after: page; margin-bottom: 0; }
          .tver-doc .doc-page:last-child { break-after: auto; }
        }
      `}</style>
    </div>
  );
}
