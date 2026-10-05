import { Illustration, illustrations } from '../components/ui/Illustration';
import type { ReactNode } from 'react';
import {
  MonitorSmartphone, Database, HardDrive, Globe2, Link2, Coins, ShieldCheck,
  FilePlus2, Send, BadgeCheck, Anchor, UploadCloud, ClipboardCheck, Sparkles,
  ArrowRight, ArrowDown, Fingerprint, FileJson, Radio, Gem, ScrollText, ExternalLink,
  Users, KeyRound, Wallet,
} from 'lucide-react';
import clsx from 'clsx';
import { PageHeader } from '../components/layout/PageHeader';

// ============================================================
// How it works — a reader's guide to the dMRV pipeline: where
// every piece of data lives (7 layers) and how a project travels
// from draft to on-chain carbon credits. Static content, no store.
// ============================================================

type LayerKey = 'browser' | 'postgres' | 'disk' | 'ipfs' | 'hcs' | 'hts' | 'guardian';

const LAYERS: Record<LayerKey, {
  name: string; icon: typeof Database; chip: string; dot: string;
  title: string; what: string; why: string;
}> = {
  browser: {
    name: 'Browser', icon: MonitorSmartphone, chip: 'bg-surface-sunk text-ink-secondary', dot: 'bg-rule-strong',
    title: 'เบราว์เซอร์ของผู้ใช้',
    what: 'State ของหน้าจอ และกุญแจ Ed25519 ที่ใช้เซ็น Verifiable Credential',
    why: 'กุญแจไม่เคยออกจากเครื่องเจ้าของ — server เห็นเฉพาะลายเซ็นที่ตรวจได้',
  },
  postgres: {
    name: 'PostgreSQL', icon: Database, chip: 'bg-petrol-50 text-petrol-800', dot: 'bg-petrol-600',
    title: 'ฐานข้อมูลหลัก (ระบบบัญชี)',
    what: 'โปรเจกต์ · PDD ทั้งฉบับ + disclosure salts · monitoring · verification · credential · audit log แบบ hash-chain',
    why: 'ข้อมูลเต็ม ค้นเร็ว ควบคุมสิทธิ์ตามบทบาท — ทุกอย่างเขียนที่นี่ก่อนเสมอ',
  },
  disk: {
    name: 'File Store', icon: HardDrive, chip: 'bg-state-revision/5 text-state-revision', dot: 'bg-state-revision',
    title: 'ไฟล์หลักฐาน (content-addressed)',
    what: 'รูปถ่าย / PDF / สเปรดชีตของ evidence เก็บด้วยชื่อ = SHA-256 ของไฟล์',
    why: 'ไฟล์ถูกสลับแก้ไม่ได้โดยไม่เปลี่ยน hash และไฟล์ซ้ำไม่เปลืองพื้นที่',
  },
  ipfs: {
    name: 'IPFS', icon: Globe2, chip: 'bg-petrol-50 text-petrol-800', dot: 'bg-petrol-600',
    title: 'สำเนาสาธารณะของ PDD',
    what: 'เนื้อหา PDD ที่ freeze แล้ว (canonical JSON) ถูก pin เป็น CID จริง',
    why: 'ใครก็ดึงเอกสารมา re-hash เทียบกับค่าบน chain ได้เอง ไม่ต้องเชื่อเรา',
  },
  hcs: {
    name: 'Hedera HCS', icon: Radio, chip: 'bg-petrol-50 text-petrol-800', dot: 'bg-petrol-600',
    title: 'สมุดบันทึกสาธารณะ (topic ต่อโปรเจกต์)',
    what: 'ข้อความ 4 ชนิด: project_listed → pdd_registration → verification_approval → token_mint',
    why: 'ประทับเวลาด้วย consensus ของเครือข่าย — แก้ย้อนหลังไม่ได้ ดูได้บน HashScan',
  },
  hts: {
    name: 'Hedera HTS', icon: Coins, chip: 'bg-lime-300 text-petrol-800', dot: 'bg-lime-ink',
    title: 'คาร์บอนเครดิต — token แยกต่อโปรเจกต์',
    what: 'แต่ละโปรเจกต์มี HTS token ของตัวเอง (ชื่อเหรียญ = ชื่อโปรเจกต์, 1.00 = 1 tCO₂e) mint เป็น batch พร้อมช่วง serial ต่อเนื่องแบบทะเบียน Verra',
    why: 'ยอดเครดิตของแต่ละโปรเจกต์นับได้ตรง ๆ จาก supply ของเหรียญโปรเจกต์นั้นบน HashScan',
  },
  guardian: {
    name: 'Guardian', icon: ShieldCheck, chip: 'bg-petrol-50 text-state-review', dot: 'bg-state-review',
    title: 'Hedera Guardian (policy กลาง)',
    what: 'เอกสารในรูป VC เดินผ่าน policy ที่ publish บน testnet — trust chain ตามมาตรฐาน registry',
    why: 'โครงสร้างเดียวกับ registry สากล เปิด Guardian UI ตรวจได้อีกชั้น',
  },
};

function LayerChip({ k }: { k: LayerKey }) {
  const l = LAYERS[k];
  return (
    <span className={clsx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', l.chip)}>
      <span className={clsx('h-1.5 w-1.5 rounded-full', l.dot)} />
      {l.name}
    </span>
  );
}

// ---------- 2. lifecycle timeline ----------

const STEPS: Array<{
  icon: typeof FilePlus2; role: string; roleTone: string;
  title: string; detail: string; writes: LayerKey[];
}> = [
  {
    icon: FilePlus2, role: 'Project Proponent', roleTone: 'bg-petrol-50 text-petrol-700',
    title: 'สร้างโปรเจกต์ + กรอก PDD + แนบหลักฐาน',
    detail: 'ข้อมูลโครงการและเอกสารข้อเสนอ (T-VER-S-F001-PDD) ถูกบันทึกเป็น draft ไฟล์หลักฐานอัปโหลดขึ้น server พร้อม SHA-256 ของไฟล์จริง',
    writes: ['postgres', 'disk'],
  },
  {
    icon: Send, role: 'Project Proponent', roleTone: 'bg-petrol-50 text-petrol-700',
    title: 'Submit — โครงการขึ้นทะเบียน pipeline',
    detail: 'แบบเดียวกับ Verra: ยื่นครั้งแรกระบบสร้าง HCS topic ประจำโปรเจกต์ และประกาศ "project_listed" ต่อสาธารณะทันที ยังไม่ต้องรออนุมัติ',
    writes: ['postgres', 'hcs'],
  },
  {
    icon: BadgeCheck, role: 'VVB (ผู้ตรวจ)', roleTone: 'bg-petrol-50 text-state-review',
    title: 'Validate + Register (Gate 1)',
    detail: 'ผู้ตรวจอนุมัติ → ระบบ freeze content_hash, pin เอกสารขึ้น IPFS เป็น CID จริง, สร้าง salts สำหรับ selective disclosure และส่งเอกสารเข้า Guardian policy ในนามผู้พัฒนา',
    writes: ['postgres', 'ipfs', 'guardian'],
  },
  {
    icon: Anchor, role: 'VVB (ผู้ตรวจ)', roleTone: 'bg-petrol-50 text-state-review',
    title: 'เซ็นและ anchor credential',
    detail: 'เบราว์เซอร์เซ็น PDD Registration VC (กุญแจอยู่กับผู้ใช้) → server ตรวจลายเซ็นแล้วเขียน "pdd_registration" ลง topic จริง จากนั้น Guardian approve + mint GEMVCU ตาม ER อัตโนมัติเบื้องหลัง',
    writes: ['browser', 'postgres', 'hcs', 'guardian', 'hts'],
  },
  {
    icon: UploadCloud, role: 'Project Proponent', roleTone: 'bg-petrol-50 text-petrol-700',
    title: 'อัปโหลดข้อมูล monitoring',
    detail: 'ค่าการผลิตไฟฟ้ารายเดือน (kWh) เข้าระบบ ผูกกับ methodology และ emission factor เวอร์ชันที่ประกาศใช้',
    writes: ['postgres'],
  },
  {
    icon: ClipboardCheck, role: 'VVB (ผู้ตรวจ)', roleTone: 'bg-petrol-50 text-state-review',
    title: 'Verification + anchor',
    detail: 'ตรวจแพ็กเกจ → approve จะผนึก hash_value ของทั้งชุด แล้ว anchor "verification_approval" ลง topic เดิมของโปรเจกต์',
    writes: ['postgres', 'hcs'],
  },
  {
    icon: Sparkles, role: 'Registry', roleTone: 'bg-petrol-50 text-state-review',
    title: 'Mint คาร์บอนเครดิต',
    detail: 'mint ครั้งแรกของโปรเจกต์จะสร้าง HTS token ประจำโปรเจกต์ (ชื่อเหรียญ = ชื่อโปรเจกต์) แล้วออก batch พร้อมช่วง serial ต่อเนื่อง + ข้อความ "token_mint" ปิดท้าย trust chain',
    writes: ['postgres', 'hts', 'hcs'],
  },
];

// ---------- 3. verify chain ----------

const VERIFY: Array<{ icon: typeof Fingerprint; title: string; detail: string }> = [
  { icon: Globe2, title: 'ดึงไฟล์จาก IPFS CID', detail: 'ได้เอกสาร PDD ฉบับ freeze' },
  { icon: Fingerprint, title: 'SHA-256 ใหม่', detail: 'ต้องตรง content_hash ทุกไบต์' },
  { icon: Radio, title: 'เทียบกับ HCS', detail: 'hash เดียวกันอยู่ในข้อความบน topic พร้อมเวลา consensus' },
  { icon: FileJson, title: 'ตรวจลายเซ็น VC', detail: 'Ed25519 verify ได้ offline — ข้อมูลลับถูก redact เป็น salted hash' },
  { icon: Gem, title: 'นับเครดิตบน HashScan', detail: 'supply / serial ของ token ตรงกับที่ระบบรายงาน' },
];

// ---------- 3b. detailed data inventory ----------

const INVENTORY: Array<{ layer: LayerKey; open?: boolean; entities: Array<{ name: string; items: string[] }> }> = [
  {
    layer: 'postgres', open: true,
    entities: [
      { name: 'organizations · users', items: ['อีเมล ชื่อ บทบาท', 'รหัสผ่านเก็บเป็น hash เท่านั้น (ไม่มี plaintext)', 'refresh token แบบ hash + วันหมดอายุ'] },
      { name: 'projects', items: ['ชื่อ ที่ตั้ง กำลังติดตั้ง (kWp) วัน COD', 'สถานะ lifecycle (unregistered → registered)', 'hcs_topic_id — topic ประจำโปรเจกต์บน Hedera'] },
      { name: 'methodologies', items: ['เอกสาร methodology ทั้งชุด (ฟอร์ม PDD รายฟิลด์, สูตรคำนวณ, หลักฐานที่ต้องใช้, พารามิเตอร์ monitoring)'] },
      { name: 'pdds', items: ['section_data — ทุกช่องของฟอร์ม T-VER-S-F001-PDD', 'evidence_ids ที่ผูก', 'content_hash (freeze ตอน register) + ipfs_cid', 'disclosure_salts — server เก็บฝั่งลับของ selective disclosure', 'credential_id + guardian_ref (policy/tracking/approved_at)', 'สถานะ + เวลา submit/validate + เหตุผลถ้าถูกตีกลับ'] },
      { name: 'monitoring_records', items: ['ค่าการผลิตไฟฟ้า (kWh) ต่อวันที่บันทึก', 'พารามิเตอร์และหน่วยตาม methodology', 'แหล่งข้อมูล + เวลาอัปโหลด'] },
      { name: 'emission_factors', items: ['ค่า EF ต่อประเทศ/แหล่ง (tCO₂/MWh)', 'เวอร์ชัน + วันบังคับใช้ + ธงตัวปัจจุบัน'] },
      { name: 'evidence_files', items: ['ชื่อไฟล์ ชนิด ขนาด หมวด คำอธิบาย', 'SHA-256 ของไฟล์จริง + path แบบ content-addressed', 'โซ่เวอร์ชัน (ไฟล์ใหม่ชี้ parent) + สถานะ active/superseded/archived', 'ใครอัปโหลด เมื่อไหร่'] },
      { name: 'verification_requests', items: ['ช่วงเวลา monitoring + ปริมาณลดที่เคลม', 'snapshot ของ EF ที่ใช้คำนวณ', 'hash_value — ผนึกทั้งแพ็กเกจตอน approve', 'ผู้ตรวจ, SLA, สถานะ, พิกัด HCS หลัง anchor'] },
      { name: 'credentials', items: ['VC ที่เซ็นแล้วทั้ง payload (รวม proof)', 'anchor — topic/sequence/เวลา consensus จริงบน Hedera'] },
      { name: 'guardian_tokens', items: ['จำนวน tCO₂e + ช่วงเวลา monitoring', 'batch: serial range ของ GVCU + รายละเอียด ERC-1155 (address/id/tx)', 'ใคร mint เมื่อไหร่'] },
      { name: 'verification_comments', items: ['ความเห็นผู้ตรวจ/ผู้พัฒนา ผูกกับเอกสารหรือหลักฐานรายชิ้น'] },
      { name: 'audit_log (hash-chain)', items: ['ทุก action: ใคร (id, role, IP) ทำอะไร กับ entity ไหน เมื่อไหร่', 'ค่าเก่า → ค่าใหม่ของการเปลี่ยนแปลง', 'row_hash + prev_row_hash — แก้ประวัติย้อนหลังแล้วโซ่ขาดทันที'] },
    ],
  },
  {
    layer: 'browser',
    entities: [
      { name: 'zustand store / localStorage', items: ['สถานะหน้าจอ + ข้อมูลที่ hydrate จาก server', 'access/refresh token ของ session', 'กุญแจ Ed25519 สำหรับเซ็น VC — ไม่เคยส่งออกจากเครื่อง'] },
    ],
  },
  {
    layer: 'disk',
    entities: [
      { name: 'STORAGE_DIR', items: ['ไบต์จริงของไฟล์ evidence ทุกไฟล์', 'ชื่อไฟล์ = SHA-256 ของเนื้อไฟล์ (เนื้อเดียวกันเก็บครั้งเดียว)'] },
    ],
  },
  {
    layer: 'ipfs',
    entities: [
      { name: 'CID ต่อ PDD ที่ register', items: ['canonical JSON: methodology_snapshot + section_data + evidence_ids (เรียงลำดับ)', 'ไบต์ชุดนี้ re-hash ได้เท่ากับ content_hash เป๊ะ — คนนอกตรวจเองได้'] },
    ],
  },
  {
    layer: 'hcs',
    entities: [
      { name: 'topic ต่อโปรเจกต์ (memo gem-dmrv:<id>)', items: [
        'project_listed — {project_id, pdd_id} ตอน submit ครั้งแรก',
        'pdd_registration — {credential_id, package_hash, ipfs_cid} ตอน anchor VC',
        'verification_approval — {credential_id, package_hash} ตอนผลตรวจถูก anchor',
        'token_mint — {credential_id, package_hash} ตอนออกเครดิต',
        'ทุกข้อความได้ sequence number + เวลา consensus จากเครือข่าย'] },
    ],
  },
  {
    layer: 'hts',
    entities: [
      { name: 'HTS token ประจำโปรเจกต์ (2 ตำแหน่ง)', items: ['ชื่อเหรียญ = ชื่อโปรเจกต์ · memo = project id', 'supply = เครดิตสะสมของโปรเจกต์นั้นตรง ๆ', 'ช่วง serial ต่อ batch (จาก totalSupply ใน receipt)'] },
      { name: 'GEMVCU (token ของ Guardian)', items: ['supply ที่ policy mint ตาม ER ที่อนุมัติ + การโอนเข้าบัญชีผู้พัฒนา'] },
    ],
  },
  {
    layer: 'guardian',
    entities: [
      { name: 'policy "GEM Carbon Credit dMRV"', items: ['เอกสาร PDD ในรูป VC เซ็นด้วย DID ของผู้ส่ง', 'สถานะเอกสาร (Waiting for approval / Approved)', 'trust chain ของทุกใบ ดูได้ใน Guardian UI'] },
    ],
  },
];

// ---------- 4. accounts & roles ----------

const ACCOUNT_GROUPS: Array<{
  icon: typeof Users; title: string; subtitle: string;
  accounts: Array<{ name: string; role: string; tone: string; duty: string }>;
}> = [
  {
    icon: Users, title: 'บัญชีในแอป (localhost:5173)', subtitle: 'แยกหน้าที่แบบทะเบียนจริง — คนเดียวทำครบวงจรไม่ได้',
    accounts: [
      { name: 'proponent@gem.demo', role: 'Project Proponent', tone: 'bg-petrol-50 text-petrol-700',
        duty: 'สร้างโปรเจกต์ · กรอก PDD + หลักฐาน · submit · อัปโหลด monitoring · ยื่น verification' },
      { name: 'vvb@gem.demo', role: 'VVB / Verifier', tone: 'bg-petrol-50 text-state-review',
        duty: 'ตรวจ + อนุมัติ PDD (Register / Gate 1) · ตรวจแพ็กเกจ verification · anchor credential ขึ้น Hedera' },
      { name: 'registry@gem.demo', role: 'Registry / Admin', tone: 'bg-petrol-50 text-state-review',
        duty: 'ขั้นสุดท้ายของ chain: mint คาร์บอนเครดิต (GVCU batch + ERC-1155) · ภาพรวม pipeline' },
      { name: 'esg@gem.demo', role: 'ESG Manager', tone: 'bg-state-revision/5 text-state-revision',
        duty: 'ดูแล emission factors ตามประกาศ อบก. · รันการคำนวณ · สนับสนุนฝั่งข้อมูล' },
    ],
  },
  {
    icon: KeyRound, title: 'บัญชี Guardian (localhost:3006)', subtitle: 'ตัวแสดงใน policy ที่ publish บน testnet',
    accounts: [
      { name: 'gemregistry', role: 'Standard Registry', tone: 'bg-petrol-50 text-state-review',
        duty: 'เจ้าของ policy / schema / token GEMVCU — server สวมบทนี้กด approve หลัง VVB anchor แล้ว Guardian mint อัตโนมัติ · login ดู trust chain ทั้งหมด' },
      { name: 'gem-developer', role: 'Project Proponent', tone: 'bg-petrol-50 text-petrol-700',
        duty: 'server ใช้ส่งเอกสาร PDD เข้า policy ตอน Register — Guardian เซ็น VC ด้วย DID ของบัญชีนี้ และเป็นผู้รับเครดิต GEMVCU' },
      { name: 'gem-vvb', role: 'VVB', tone: 'bg-petrol-50 text-state-review',
        duty: 'เตรียมไว้สำหรับ flow ตรวจสอบใน Guardian (ปัจจุบันการอนุมัติของ VVB ในแอปถูก map เป็น approve ของ SR)' },
    ],
  },
  {
    icon: Wallet, title: 'บัญชี Hedera บน testnet', subtitle: 'ชั้น blockchain — ผู้จ่ายค่าธรรมเนียมและผู้ถือ token',
    accounts: [
      { name: '0.0.9651712 (operator)', role: 'Platform treasury', tone: 'bg-petrol-50 text-petrol-700',
        duty: 'จ่ายค่าธรรมเนียมทุกธุรกรรมของ server (topic / anchor / mint) · treasury ของ GVCU + ERC-1155 · key เดียวกันเป็น EVM address 0x91cF…864f ที่ deploy contract' },
      { name: '0.0.9714436', role: 'Hedera ของ gem-developer', tone: 'bg-petrol-50 text-petrol-700',
        duty: 'ผู้รับเครดิต GEMVCU ที่ Guardian mint (ต้อง associate token ก่อนรับ — ทำแล้ว)' },
      { name: '0.0.9714453', role: 'Hedera ของ gem-vvb', tone: 'bg-petrol-50 text-state-review',
        duty: 'เซ็นธุรกรรมฝั่ง VVB ใน Guardian (ยังไม่ถูกใช้ใน flow ปัจจุบัน)' },
    ],
  },
];

function SectionTitle({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <h2 className="mb-4 mt-10 flex items-center gap-2 text-lg font-semibold tracking-tight text-ink">
      <span className="text-petrol-700">{icon}</span>
      {children}
    </h2>
  );
}

export function HowItWorks() {
  return (
    <div className="max-w-5xl">
      <PageHeader
        title="ระบบทำงานอย่างไร"
        subtitle="เส้นทางของข้อมูลตั้งแต่ร่างโครงการจนเป็นคาร์บอนเครดิตบน Hedera — และวิธีที่คนนอกตรวจสอบเราได้โดยไม่ต้องเชื่อใจ"
      />

      <Illustration src="/illustrations/hiw-hero.webp" className="mb-6 h-auto w-full" />

      {/* ============ pipeline hero ============ */}
      <div className="rounded-sheet border border-rule bg-surface p-6 text-ink">
        <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-stretch">
          {[
            { icon: FilePlus2, t: 'Draft', d: 'PDD + หลักฐาน' },
            { icon: Send, t: 'Listed', d: 'ขึ้น topic สาธารณะ' },
            { icon: BadgeCheck, t: 'Registered', d: 'hash + IPFS + Guardian' },
            { icon: ClipboardCheck, t: 'Verified', d: 'ผลตรวจถูก anchor' },
            { icon: Gem, t: 'Credited', d: 'token จริงบน Hedera' },
          ].map((s, i, arr) => (
            <div key={s.t} className="flex flex-1 items-center gap-3">
              <div className="flex-1 border-b border-rule px-4 py-3">
                <s.icon size={18} className="text-ink-secondary" />
                <div className="mt-1.5 text-sm font-semibold">{s.t}</div>
                <div className="text-sm leading-snug text-ink-secondary">{s.d}</div>
              </div>
              {i < arr.length - 1 && (
                <>
                  <ArrowRight size={16} className="hidden shrink-0 text-ink-secondary md:block" />
                  <ArrowDown size={16} className="mx-auto shrink-0 text-ink-secondary md:hidden" />
                </>
              )}
            </div>
          ))}
        </div>
        <p className="mt-4 max-w-3xl text-sm leading-relaxed text-ink-secondary">
          ทุกการเขียนขึ้น blockchain เป็นแบบ <span className="font-semibold text-ink-secondary">best-effort</span> —
          ข้อมูลถูกบันทึกในฐานข้อมูลก่อนเสมอ เครือข่ายล่มจึงไม่เคยทำให้งานอนุมัติสะดุด และมีการ retry ให้จนครบ
        </p>
      </div>

      {/* ============ storage layers ============ */}
      <SectionTitle icon={<Database size={16} />}>ข้อมูลถูกเก็บไว้ที่ไหนบ้าง — 7 ชั้น</SectionTitle>
      <div className="divide-y divide-rule rounded-sheet border border-rule bg-surface">
        {(Object.keys(LAYERS) as LayerKey[]).map((k) => {
          const l = LAYERS[k];
          return (
            <div key={k} className="p-4">
              <div className="flex items-center justify-between">
                <span className={clsx('text-petrol-700', l.chip)}>
                  <l.icon size={18} />
                </span>
                <LayerChip k={k} />
              </div>
              <div className="mt-3 text-sm font-semibold text-ink">{l.title}</div>
              <p className="mt-1 text-sm leading-relaxed text-ink-secondary">{l.what}</p>
              <p className="mt-2 border-t border-dashed border-rule pt-2 text-sm leading-relaxed text-ink-meta">
                {l.why}
              </p>
            </div>
          );
        })}
      </div>

      {/* ============ data inventory ============ */}
      <SectionTitle icon={<HardDrive size={16} />}>เจาะลึก: แต่ละชั้นเก็บอะไรบ้าง</SectionTitle>
      <div className="space-y-2">
        {INVENTORY.map((inv) => {
          const l = LAYERS[inv.layer];
          return (
            <details key={inv.layer} open={inv.open} className="group rounded-sheet border border-rule/80 bg-white">
              <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 [&::-webkit-details-marker]:hidden">
                <span className={clsx('text-petrol-700', l.chip)}><l.icon size={14} /></span>
                <span className="text-sm font-semibold text-ink">{l.title}</span>
                <LayerChip k={inv.layer} />
                <span className="ml-auto text-ink-meta transition-colors duration-150 ease-out group-open:rotate-90"><ArrowRight size={14} /></span>
              </summary>
              <div className="grid gap-x-6 gap-y-3 border-t border-rule px-4 py-3 sm:grid-cols-2">
                {inv.entities.map((e) => (
                  <div key={e.name}>
                    <div className="text-sm font-semibold text-ink">{e.name}</div>
                    <ul className="mt-1 space-y-0.5">
                      {e.items.map((it) => (
                        <li key={it} className="flex gap-1.5 text-sm leading-relaxed text-ink-secondary">
                          <span className={clsx('mt-1.5 h-1 w-1 shrink-0 rounded-full', l.dot)} />
                          {it}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </details>
          );
        })}
      </div>

      {/* ============ lifecycle timeline ============ */}
      <SectionTitle icon={<ScrollText size={16} />}>การเดินทางของข้อมูล ทีละขั้น</SectionTitle>
      <ol className="relative ml-4 border-l-2 border-petrol-700">
        {STEPS.map((s, i) => (
          <li key={s.title} className="relative border-b border-rule py-5 pl-8 last:border-b-0 md:pr-28">
            <span className="absolute -left-[17px] top-5 grid h-8 w-8 place-items-center rounded-full border-2 border-white bg-petrol-700 text-on-petrol">
              <s.icon size={14} />
            </span>
            <div className="mb-3 h-24 w-24 md:absolute md:right-0 md:top-5 md:mb-0">
              <Illustration src={illustrations.steps[i]} className="h-full w-full object-contain" />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-ink-meta">{String(i + 1).padStart(2, '0')}</span>
              <h3 className="text-sm font-semibold text-ink">{s.title}</h3>
              <span className={clsx('rounded-full px-2 py-0.5 text-xs font-medium', s.roleTone)}>{s.role}</span>
            </div>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-secondary">{s.detail}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {s.writes.map((w) => <LayerChip key={w} k={w} />)}
            </div>
          </li>
        ))}
      </ol>

      {/* ============ accounts & roles ============ */}
      <SectionTitle icon={<Users size={16} />}>บัญชีและบทบาท — ใครทำอะไร</SectionTitle>
      <div className="divide-y divide-rule rounded-sheet border border-rule bg-surface">
        {ACCOUNT_GROUPS.map((g) => (
          <div key={g.title} className="p-4">
            <div className="flex items-center gap-2">
              <span className="text-petrol-700"><g.icon size={16} /></span>
              <div>
                <div className="text-sm font-semibold text-ink">{g.title}</div>
                <div className="text-xs text-ink-meta">{g.subtitle}</div>
              </div>
            </div>
            <ul className="mt-3 space-y-3">
              {g.accounts.map((a) => (
                <li key={a.name} className="border-t border-dashed border-rule pt-2.5 first:border-t-0 first:pt-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <code className="rounded bg-ground px-1.5 py-0.5 text-xs font-medium text-ink">{a.name}</code>
                    <span className={clsx('rounded-full px-2 py-0.5 text-xs font-semibold', a.tone)}>{a.role}</span>
                  </div>
                  <p className="mt-1 text-sm leading-relaxed text-ink-secondary">{a.duty}</p>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="mt-3 rounded-sheet border border-rule bg-ground/60 px-4 py-3 text-sm leading-relaxed text-ink-meta">
        เส้นเชื่อมสำคัญ: สามระบบนี้เป็นคนละชั้นกันโดย server เป็นตัวกลาง — เช่น VVB กด Anchor ในแอป → server เขียน HCS ด้วยบัญชี operator
        → สวมบท gemregistry ไป approve ใน Guardian → Guardian ใช้บัญชี Hedera ของแต่ละฝ่ายทำธุรกรรมจริงบน chain
      </p>

      {/* ============ verify chain ============ */}
      <SectionTitle icon={<Link2 size={16} />}>คนนอกตรวจสอบเราได้อย่างไร</SectionTitle>
      <div className="rounded-sheet border border-rule/80 bg-white p-5">
        <p className="mb-4 text-sm leading-relaxed text-ink-secondary">
          หัวใจของระบบคือ <span className="font-semibold text-ink">ห่วงโซ่ hash ที่ตรวจซ้ำได้ทุกข้อต่อ</span> —
          ผู้ตรวจอิสระไม่ต้องขอสิทธิ์เข้าระบบเราเลย
        </p>
        <div className="flex flex-col gap-2 md:flex-row md:items-stretch">
          {VERIFY.map((v, i) => (
            <div key={v.title} className="flex flex-1 items-center gap-2">
              <div className="flex-1 border-b border-rule px-3 py-3">
                <v.icon size={16} className="text-petrol-600" />
                <div className="mt-1.5 text-sm font-semibold text-ink">{v.title}</div>
                <div className="mt-0.5 text-sm leading-snug text-ink-meta">{v.detail}</div>
              </div>
              {i < VERIFY.length - 1 && (
                <>
                  <ArrowRight size={14} className="hidden shrink-0 text-ink-meta md:block" />
                  <ArrowDown size={14} className="mx-auto shrink-0 text-ink-meta md:hidden" />
                </>
              )}
            </div>
          ))}
        </div>
        <p className="mt-4 border-t border-rule pt-3 text-sm leading-relaxed text-ink-meta">
          ภายในองค์กรมีชั้นที่หก: audit log แบบ hash-chain — ทุกแถวผูกกับ hash ของแถวก่อนหน้า
          การแก้ประวัติย้อนหลังจะทำให้โซ่ขาดและตรวจพบทันที
        </p>
      </div>

      {/* ============ live links ============ */}
      <SectionTitle icon={<ExternalLink size={16} />}>ดูของจริงบนเครือข่าย</SectionTitle>
      <div className="mb-10 grid gap-3 sm:grid-cols-3">
        {[
          { t: 'สัญญา ERC-1155 (GemCarbonCredit1155)', d: '1 batch = 1 token id + retire ได้', href: 'https://hashscan.io/testnet/contract/0xEF87e486b77D6ed63BE632a731b73aE1225F1130' },
          { t: 'Token GEMVCU ของ Guardian', d: 'mint ตามปริมาณ ER ที่อนุมัติ', href: 'https://hashscan.io/testnet/token/0.0.9909017' },
          { t: 'Guardian UI (trust chain)', d: 'เอกสาร VC ทุกใบใน policy', href: 'http://localhost:3006' },
        ].map((x) => (
          <a
            key={x.href} href={x.href} target="_blank" rel="noreferrer"
            className="group rounded-sheet border border-rule/80 bg-white p-4 transition-colors duration-150 ease-out hover:border-petrol-100"
          >
            <div className="flex items-center justify-between text-sm font-semibold text-ink">
              {x.t}
              <ExternalLink size={14} className="text-ink-meta transition-colors group-hover:text-petrol-600" />
            </div>
            <div className="mt-1 text-xs text-ink-meta">{x.d}</div>
          </a>
        ))}
      </div>
    </div>
  );
}
