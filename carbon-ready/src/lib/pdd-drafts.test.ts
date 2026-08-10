import { describe, it, expect } from 'vitest';
import { draftableKeys, draftActivityText } from './pdd-drafts';
import type { EmissionFactor, Project } from '../types';

const PROJECT: Project = {
  id: 'prj-x', organization_id: 'org-1', name: 'Solar Rooftop มรภ.หมู่บ้านจอมบึง',
  location: 'Chom Bueng, Ratchaburi, Thailand', capacity_kwp: 667.2,
  commission_date: '2025-12-01', status: 'active', lifecycle_stage: 'pdd_draft',
  created_at: '', updated_at: '',
};

const TGO_FACTORS: EmissionFactor[] = [
  { id: 'ef-tgo', country: 'TH', source: 'TGO 2568', factor_kgco2e_per_kwh: 0.4682,
    effective_date: '2025-01-01', version: 1, is_current: true, created_at: '' },
];

// The MCRU dataset — with factors the draft can quote the computed ER figures.
const MCRU_DATA = {
  owner_name: 'มหาวิทยาลัยราชภัฏหมู่บ้านจอมบึง',
  crediting_start: '2026-01-01',
  crediting_years: '7',
  year1_generation_kwh: 963915,
  degradation_pct: 0.4,
  permit_no: '12/2568',
  permit_date: '2025-03-25',
  installations: [1, 2, 3, 4, 5].map((i) => ({ building: `อาคาร ${i}` })),
  consumers: [{ equipment: 'Logger', rated_w: 40, hours_per_year: 8760 }, { equipment: 'PSU', rated_w: 550, hours_per_year: 8760 }, { equipment: 'Pump', rated_w: 2300, hours_per_year: 10 }, { equipment: 'Inv', kwh_year: 610.28 }],
};

describe('draftActivityText — boilerplate composed from real project data', () => {
  it('after_project: three MCRU-style paragraphs — policy, installation, objective + figures', () => {
    const text = draftActivityText('after_project', PROJECT, MCRU_DATA, TGO_FACTORS);
    const paragraphs = text.split('\n');
    expect(paragraphs).toHaveLength(3);
    // ¶1 policy/goal boilerplate incl. AEDP2015
    expect(paragraphs[0]).toContain('มหาวิทยาลัยราชภัฏหมู่บ้านจอมบึง มีเป้าหมายการนำพลังงานทดแทน');
    expect(paragraphs[0]).toContain('AEDP2015');
    // ¶2 installation: capacity + building count + permit
    expect(paragraphs[1]).toContain('ขนาดติดตั้ง 667.20 กิโลวัตต์');
    expect(paragraphs[1]).toContain('จำนวน 5 อาคาร');
    expect(paragraphs[1]).toContain('เลขที่ 12/2568');
    // ¶3 objective: methodology ref, dates, computed ER figures
    expect(paragraphs[2]).toContain('T-VER-S-METH-01-01');
    expect(paragraphs[2]).toContain('การไฟฟ้าส่วนภูมิภาค');
    expect(paragraphs[2]).toMatch(/2569/);
    expect(paragraphs[2]).toContain('443 ตันคาร์บอนไดออกไซด์เทียบเท่าต่อปี');
    expect(paragraphs[2]).toContain('3,098 ตันคาร์บอนไดออกไซด์เทียบเท่า (tCO2e)');
    expect(paragraphs[2]).toContain('7 ปี');
  });

  it('after_project without factors/permit still drafts, omitting the uncomputable clauses', () => {
    const text = draftActivityText('after_project', PROJECT, { owner_name: 'วิทยาลัยชุมชนตราด' });
    expect(text).toContain('วิทยาลัยชุมชนตราด');
    expect(text).toContain('667.20 กิโลวัตต์');
    expect(text).not.toContain('ตันคาร์บอนไดออกไซด์'); // no factors → no ER claim
    expect(text).not.toContain('เลขที่'); // no permit line
    expect(text).toContain('[ระบุจำนวนอาคาร]'); // installations empty → prompt
  });

  it('before_project: two paragraphs — org intro (with fill-in prompt) then baseline energy use', () => {
    const text = draftActivityText('before_project', PROJECT, {
      owner_name: 'มหาวิทยาลัยราชภัฏหมู่บ้านจอมบึง',
      project_address: '46 หมู่ 3 ตำบลจอมบึง อำเภอจอมบึง จังหวัดราชบุรี 70150',
    });
    const paragraphs = text.split('\n');
    expect(paragraphs).toHaveLength(2);
    // ¶1 — org intro: name + address + an explicit prompt the user replaces
    expect(paragraphs[0]).toContain('มหาวิทยาลัยราชภัฏหมู่บ้านจอมบึง ตั้งอยู่ที่ 46 หมู่ 3 ตำบลจอมบึง');
    expect(paragraphs[0]).toContain('[');
    expect(paragraphs[0]).toMatch(/ประเภทหน่วยงาน|วิสัยทัศน์/);
    // ¶2 — baseline sentence, MCRU reference wording
    expect(paragraphs[1]).toContain('ปัจจุบัน มหาวิทยาลัยราชภัฏหมู่บ้านจอมบึง ได้ดำเนินกิจกรรมขององค์กรโดยการใช้พลังงานไฟฟ้าจากการไฟฟ้าส่วนภูมิภาค');
    expect(paragraphs[1]).toContain('ซึ่งเป็นพลังงานที่มาจากการเผาไหม้ของเชื้อเพลิงฟอสซิลเป็นหลัก');
  });

  it('uses การไฟฟ้านครหลวง for Bangkok-area addresses', () => {
    const bkk = { ...PROJECT, location: 'เขตจตุจักร กรุงเทพมหานคร 10900' };
    expect(draftActivityText('after_project', bkk, {})).toContain('การไฟฟ้านครหลวง');
  });

  it('falls back to the project name when no owner field is filled', () => {
    expect(draftActivityText('after_project', PROJECT, {})).toContain('Solar Rooftop มรภ.หมู่บ้านจอมบึง');
  });

  it('exposes the draftable field keys for the wizard', () => {
    expect(draftableKeys).toContain('before_project');
    expect(draftableKeys).toContain('after_project');
  });
});
