// Boilerplate drafts for the free-text PDD activity fields — composed from
// data the form already holds, in the standard TGO wording. Deterministic and
// offline: the user gets an editable starting point, never a locked sentence.
import { computeYearlyTable, documentCapacityKwp } from './pdd';
import { isBundle } from './pdd-sites';
import type { EmissionFactor, Project } from '../types';

export const draftableKeys = ['project_activity', 'before_project', 'after_project', 'boundary_description'] as const;
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
  // Same figure the document prints in §1.2 — the ตารางที่ 1 total when filled.
  const capacityKwp = documentCapacityKwp({ project, factors, sectionData });
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
      `ขนาดกำลังติดตั้งไม่น้อยกว่า ${fmtCap(capacityKwp)} กิโลวัตต์สูงสุด (kWp) ` +
      `${connection}เพื่อผลิตใช้เองภายใน${owner}`
    );
  }

  if (key === 'boundary_description') {
    if (isBundle(sectionData)) {
      // Aggregated reference pp.7-8: the PPA supply model, then the equipment.
      return (
        `โครงการผลิตไฟฟ้าจากพลังงานแสงอาทิตย์แบบติดตั้งบนหลังคา (Solar Rooftop) เป็นรูปแบบการผลิตไฟฟ้าที่มีวัตถุประสงค์หลัก` +
        `เพื่อจำหน่ายให้แก่กลุ่มลูกค้าหรือผู้ใช้ไฟฟ้า ภายใต้สัญญาซื้อขายไฟฟ้า (Private PPA) ` +
        `โดยในสภาวะปกติที่มีแสงอาทิตย์ ระบบผลิตไฟฟ้าดังกล่าวจะผลิตพลังงานไฟฟ้าและจ่ายเข้าในระบบไฟฟ้าภายในของผู้ใช้ไฟฟ้าเท่านั้น ` +
        `และหากเป็นช่วงเวลากลางคืนหรือช่วงที่พลังงานไฟฟ้าที่ผลิตได้มีปริมาณไม่เพียงพอตามความต้องการ ` +
        `ผู้ใช้ไฟฟ้าก็จะดึงไฟฟ้าจากระบบจำหน่ายของการไฟฟ้าส่วนภูมิภาค/การไฟฟ้านครหลวงมาเพิ่มเติม\n` +
        `เทคโนโลยีและอุปกรณ์ที่ติดตั้งในระบบผลิตไฟฟ้าพลังงานแสงอาทิตย์ ประกอบไปด้วย 1) แผงเซลล์แสงอาทิตย์ (PV Panel), ` +
        `2) เครื่องแปลงกระแสไฟฟ้า (Inverter) และ 3) มิเตอร์ซื้อขายไฟฟ้า (Energy Meter) ` +
        `โดยแผงเซลล์แสงอาทิตย์จะทำหน้าที่เปลี่ยนแสงอาทิตย์ที่ตกกระทบที่แผงเป็นไฟฟ้ากระแสตรง (DC) ` +
        `และผ่านเครื่องแปลงกระแสไฟฟ้า (Inverter) แปลงกระแสไฟฟ้าเป็นกระแสสลับ (AC) ` +
        `และมีอุปกรณ์มิเตอร์ซื้อขายไฟฟ้า (Energy Meter) เป็นเครื่องวัดค่าพลังงานจากระบบผลิตไฟฟ้าพลังงานแสงอาทิตย์ ` +
        `โดยไฟฟ้าที่ผลิตได้จะจำหน่ายให้กับลูกค้าหรือผู้ใช้ไฟฟ้า และบางส่วนจะถูกนำไปใช้สำหรับอุปกรณ์สนับสนุนในโครงการในช่วงเวลากลางวัน ` +
        `อีกทั้งจะมีการนำเข้าไฟฟ้าจากภายนอก (สายส่ง) ผ่านผู้ใช้ไฟฟ้าสำหรับอุปกรณ์สนับสนุนในโครงการ ` +
        `เช่น ปั๊มน้ำล้างแผง, เครื่องวัดคุณภาพพลังงานไฟฟ้า (PQM) และ Internet Router เป็นต้น ` +
        `โดยมีขอบเขตการดำเนินโครงการ (Project Boundary) ตามรูปที่ 1 และแสดงรายการอุปกรณ์หลักของโครงการ ` +
        `ดังมีรายละเอียด ยี่ห้อ รุ่น จำนวน ดังตารางที่ 2`
      );
    }
    // MCRU reference p.8: self consumption, topped up from the grid.
    return (
      `โครงการผลิตไฟฟ้าจากพลังงานแสงอาทิตย์แบบติดตั้งบนหลังคา สำหรับ${owner} ` +
      `เป็นรูปแบบการผลิตไฟฟ้าที่มีวัตถุประสงค์หลักในการผลิตใช้ภายในของผู้ใช้ไฟฟ้าเอง (Self Consumption) ` +
      `กล่าวคือ ในสภาวะปกติที่มีแสงอาทิตย์ ระบบผลิตไฟฟ้าดังกล่าวจะผลิตพลังงานไฟฟ้าและจ่ายเข้าในระบบไฟฟ้าภายในของผู้ใช้ไฟฟ้าเท่านั้น ` +
      `และหากเป็นช่วงเวลากลางคืนหรือช่วงที่พลังงานไฟฟ้าที่ผลิตได้มีปริมาณไม่เพียงพอตามความต้องการ ` +
      `${owner}ก็จะดึงไฟฟ้าจากระบบจำหน่ายของ${utility}มาเพิ่มเติม`
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
    `ขนาดติดตั้ง ${fmtCap(capacityKwp)} กิโลวัตต์ ทำการติดตั้งบนหลังคาและดาดฟ้า จำนวน ${buildingCount} อาคาร` +
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
