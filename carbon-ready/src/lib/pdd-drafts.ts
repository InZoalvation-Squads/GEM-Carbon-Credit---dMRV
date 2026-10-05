// Boilerplate drafts for the free-text PDD activity fields — composed from
// data the form already holds, in the standard TGO wording. Deterministic and
// offline: the user gets an editable starting point, never a locked sentence.
import { computeYearlyTable } from './pdd';
import type { EmissionFactor, Project } from '../types';

export const draftableKeys = ['project_activity', 'before_project', 'after_project'] as const;
export type DraftableKey = (typeof draftableKeys)[number];

const MEA_AREAS = ['กรุงเทพ', 'นนทบุรี', 'สมุทรปราการ', 'Bangkok', 'Nonthaburi', 'Samut Prakan'];

function utilityFor(address: string): string {
  return MEA_AREAS.some((a) => address.includes(a)) ? 'การไฟฟ้านครหลวง' : 'การไฟฟ้าส่วนภูมิภาค';
}

function thaiDate(iso: unknown): string | null {
  if (typeof iso !== 'string' || !iso) return null;
  const dt = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' });
}

const fmtCap = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function draftActivityText(
  key: DraftableKey,
  project: Project,
  sectionData: Record<string, unknown>,
  factors: EmissionFactor[] = [],
): string {
  const str = (k: string) => {
    const v = sectionData[k];
    return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
  };
  const owner = str('owner_name') ?? str('project_owner') ?? project.name;
  const address = str('project_address') ?? project.location;
  const utility = utilityFor(`${address} ${project.location}`);

  if (key === 'project_activity') {
    // One sentence, mirroring the MCRU reference cover (p.3 "กิจกรรมของโครงการ"):
    // what is installed, how big, and how it connects — not the §1.1 narrative.
    const mount = str('technology') === 'Solar PV ground-mounted'
      ? 'แบบติดตั้งบนพื้นดิน (Solar Ground-mounted)'
      : 'ที่ติดตั้งบนหลังคา (Solar Rooftop)';
    const connection = str('grid_connection') === 'Off-grid'
      ? 'โดยไม่เชื่อมต่อกับระบบสายส่ง (Off-grid)'
      : `โดยการเชื่อมต่อกับสายส่งของ${utility}`;
    return (
      `โครงการติดตั้งระบบผลิตไฟฟ้าพลังงานแสงอาทิตย์${mount} ` +
      `ขนาดกำลังติดตั้งไม่น้อยกว่า ${fmtCap(project.capacity_kwp)} กิโลวัตต์สูงสุด (kWp) ` +
      `${connection}เพื่อผลิตใช้เองภายใน${owner}`
    );
  }

  if (key === 'before_project') {
    // Two paragraphs, mirroring the MCRU reference PDD (p.6): an organisation
    // introduction the user completes, then the baseline energy-use sentence
    // in the exact TGO wording the VVB looks for.
    return (
      `${owner} ตั้งอยู่ที่ ${address} ` +
      `[โปรดระบุคำอธิบายองค์กร เช่น ประเภทหน่วยงาน ภารกิจ และวิสัยทัศน์]\n` +
      `ปัจจุบัน ${owner} ได้ดำเนินกิจกรรมขององค์กรโดยการใช้พลังงานไฟฟ้าจาก${utility} ` +
      `ซึ่งเป็นพลังงานที่มาจากการเผาไหม้ของเชื้อเพลิงฟอสซิลเป็นหลัก`
    );
  }

  // after_project — three paragraphs, mirroring MCRU reference pp.6-7:
  // policy/goal boilerplate → installation facts → objective with methodology
  // reference and (when the calc engine can run) the expected ER figures.
  const start = thaiDate(sectionData.crediting_start);
  const installations = Array.isArray(sectionData.installations) ? sectionData.installations : [];
  const buildingCount = installations.length > 0 ? `${installations.length}` : '[ระบุจำนวนอาคาร]';
  const permitNo = str('permit_no');
  const permitDate = thaiDate(sectionData.permit_date);

  const p1 =
    `${owner} มีเป้าหมายการนำพลังงานทดแทนมาประยุกต์ใช้สำหรับการผลิตไฟฟ้าเพื่อใช้ภายในองค์กร ` +
    `เพื่อมุ่งหวังให้เกิดการประหยัดพลังงาน ลดค่าใช้จ่ายด้านพลังงานไฟฟ้า ` +
    `และเป็นส่วนช่วยในการลดปริมาณการปล่อยก๊าซเรือนกระจกขององค์กร ` +
    `ซึ่งเป็นปัญหาสำคัญยิ่งกับสถานการณ์พลังงานและสิ่งแวดล้อมของโลกในปัจจุบัน ` +
    `ทั้งนี้ ยังสอดคล้องกับแผนพัฒนาพลังงานทดแทนและพลังงานทางเลือก พ.ศ. 2558 – 2579 ` +
    `(Alternative Energy Development Plan: AEDP2015) ซึ่งรัฐบาลมีนโยบายส่งเสริมให้ผู้ใช้ไฟฟ้าประหยัดพลังงาน ` +
    `โดยการติดตั้งระบบผลิตไฟฟ้าพลังงานแสงอาทิตย์ที่ติดตั้งบนหลังคา (Solar Rooftop) แบบผลิตใช้เองภายในองค์กร`;

  const p2 =
    `โครงการผลิตไฟฟ้าจากพลังงานแสงอาทิตย์แบบติดตั้งบนหลังคา สำหรับ${owner} ` +
    `ขนาดติดตั้ง ${fmtCap(project.capacity_kwp)} กิโลวัตต์ ทำการติดตั้งบนหลังคาและดาดฟ้า จำนวน ${buildingCount} อาคาร` +
    (permitNo && permitDate
      ? ` ซึ่งตั้งอยู่บนพื้นที่เดียวกันตามใบอนุญาตก่อสร้างอาคาร ดัดแปลงอาคาร หรือรื้อถอนอาคาร เลขที่ ${permitNo} ลงวันที่ ${permitDate}`
      : '');

  // ER figures only when the calc engine has what it needs (a TH factor + data).
  const table = computeYearlyTable({ project, factors, sectionData });
  const erClause = table
    ? ` โดยปริมาณก๊าซเรือนกระจกเฉลี่ยที่คาดว่าจะลดได้เท่ากับ ${table.avg.er.toLocaleString('en-US')} ตันคาร์บอนไดออกไซด์เทียบเท่าต่อปี (tCO2e/year) ` +
      `หรือคิดเป็น ${table.totals.er.toLocaleString('en-US')} ตันคาร์บอนไดออกไซด์เทียบเท่า (tCO2e) ` +
      `ตลอดระยะเวลาคิดคาร์บอนเครดิตของโครงการ ${table.years} ปี`
    : '';

  const p3 =
    `โครงการฯ มีวัตถุประสงค์เพื่อผลิตไฟฟ้าจากพลังงานแสงอาทิตย์ซึ่งเป็นพลังงานหมุนเวียน ` +
    `เพื่อทดแทนการใช้ไฟฟ้าจากระบบสายส่งของ${utility}ที่ผลิตจากแหล่งพลังงานที่มีส่วนผสมของเชื้อเพลิงฟอสซิล ` +
    `เป็นรูปแบบการติดตั้งบนหลังคา (Solar Rooftop) แบบผลิตใช้เองภายในองค์กรด้วยระบบออนกริด (On-Grid)` +
    (start ? ` โดยโครงการฯ จะเริ่มดำเนินโครงการ (Project Starting Date) ตั้งแต่วันที่ ${start}` : '') +
    ` และอ้างอิงตามที่กำหนดไว้ใน T-VER-S-METH-01-01 ระเบียบวิธีการลดก๊าซเรือนกระจกภาคสมัครใจสำหรับการผลิตไฟฟ้าจากพลังงานหมุนเวียน ` +
    `(Electricity Generation from Renewable Energy) ฉบับที่ 03` +
    (start ? ` และกำหนดให้วันเริ่มคิดเครดิต (Crediting Start Date) เป็นวันที่ ${start} ` : ' ') +
    `ตามแนวทางการพัฒนาโครงการลดก๊าซเรือนกระจกภาคสมัครใจ ตามมาตรฐานของประเทศไทย (Standard T-VER) (ฉบับที่ 6.0)` +
    erClause;

  return `${p1}\n${p2}\n${p3}`;
}
