import { describe, it, expect } from 'vitest';
import { parseMethodologyJson, methodologyToJson } from './methodology-schema';
import { seedMethodologies } from '../data/seed';
import { TVER_WASTE_LFG_METHODOLOGY } from '../test/methodologies';
import { TVER_SOLAR_METHODOLOGY } from '../data/methodology-tver-solar';
import { buildDefaults } from './pdd-prefill';

describe('methodology JSON schema v2', () => {
  it('bundles exactly the registry catalog: T-VER solar, T-VER forestry, REC SF-02', () => {
    expect(seedMethodologies.map((m) => m.code)).toEqual(['T-VER-S-METH-01-01', 'T-VER-F-01', 'SF-02']);
  });

  it('accepts every bundled methodology (export → import parity)', () => {
    for (const m of seedMethodologies) {
      const r = parseMethodologyJson(methodologyToJson(m));
      expect(r.ok, `${m.code}: ${JSON.stringify(!r.ok && r.errors)}`).toBe(true);
    }
  });

  it('rejects calculation.input_param not present in monitoring_params', () => {
    const bad = JSON.parse(methodologyToJson(seedMethodologies[0]));
    bad.calculation.input_param = 'nope';
    expect(parseMethodologyJson(JSON.stringify(bad)).ok).toBe(false);
  });

  it('rejects unit mismatch between calculation and its driver param', () => {
    const bad = JSON.parse(methodologyToJson(seedMethodologies[0]));
    bad.calculation.input_unit = 'bananas';
    expect(parseMethodologyJson(JSON.stringify(bad)).ok).toBe(false);
  });

  it('rejects showIf pointing at a nonexistent field', () => {
    const bad = JSON.parse(methodologyToJson(seedMethodologies[0]));
    bad.pdd_sections[0].fields[0].showIf = { field: 'ghost', equals: 'x' };
    expect(parseMethodologyJson(JSON.stringify(bad)).ok).toBe(false);
  });

  it('rejects duplicate field keys across sections', () => {
    const bad = JSON.parse(methodologyToJson(seedMethodologies[0]));
    const f = { ...bad.pdd_sections[0].fields[0] };
    bad.pdd_sections[bad.pdd_sections.length - 1].fields.push(f);
    expect(parseMethodologyJson(JSON.stringify(bad)).ok).toBe(false);
  });

  it('requires gwp_ch4 for ch4_avoidance and rejects it on other formulas', () => {
    // No catalog methodology uses ch4_avoidance; the retired T-VER-W-01 (landfill gas) still does.
    const lfg = TVER_WASTE_LFG_METHODOLOGY;
    const missing = JSON.parse(methodologyToJson(lfg));
    delete missing.calculation.gwp_ch4;
    expect(parseMethodologyJson(JSON.stringify(missing)).ok).toBe(false);

    // seedMethodologies[0] is grid_displacement — gwp_ch4 must not ride along.
    const stray = JSON.parse(methodologyToJson(seedMethodologies[0]));
    stray.calculation.gwp_ch4 = 28;
    expect(parseMethodologyJson(JSON.stringify(stray)).ok).toBe(false);
  });

  it('rejects wrong schema_version', () => {
    const bad = JSON.parse(methodologyToJson(seedMethodologies[0]));
    bad.schema_version = 1;
    expect(parseMethodologyJson(JSON.stringify(bad)).ok).toBe(false);
  });
});

describe('extended T-VER solar methodology (T-VER-S-F001-PDD)', () => {
  it('roundtrips through the JSON contract with the full official-form field set', () => {
    const solar = seedMethodologies.find((m) => m.code === 'T-VER-S-METH-01-01')!;
    const res = parseMethodologyJson(methodologyToJson(solar));
    expect(res.ok, JSON.stringify(!res.ok && res.errors)).toBe(true);
    if (res.ok) {
      expect(res.methodology.document_template).toBe('T-VER-S-F001-PDD');
      const keys = res.methodology.pdd_sections.flatMap((s) => s.fields.map((f) => f.key));
      for (const k of ['project_title_th', 'installations', 'consumers', 'crediting_years',
        'degradation_pct', 'preparer_name', 'registered_elsewhere', 'ec_pj', 'er_annual',
        'owner_name', 'project_address', 'permit_no', 'permit_date', 'equipment_specs']) {
        expect(keys, `missing field ${k}`).toContain(k);
      }
    }
  });
});

describe('REC solar methodology (EVIDENT-SF-02)', () => {
  it('roundtrips through the JSON contract and carries the SF-02 template', () => {
    const rec = seedMethodologies.find((m) => m.id === 'meth-rec-solar')!;
    const res = parseMethodologyJson(methodologyToJson(rec));
    expect(res.ok, JSON.stringify(!res.ok && res.errors)).toBe(true);
    if (res.ok) {
      expect(res.methodology.document_template).toBe('EVIDENT-SF-02');
    }
  });
});

describe('schema v2 — table fields & document_template', () => {
  const baseDoc = () => JSON.parse(methodologyToJson(seedMethodologies[0]));

  it('accepts a table field with columns and a document_template', () => {
    const doc = baseDoc();
    doc.document_template = 'T-VER-S-F001-PDD';
    doc.pdd_sections[0].fields.push({
      key: 'test_table_field', label: 'Installations', type: 'table', required: false,
      columns: [
        { key: 'building', label: 'Building', type: 'text' },
        { key: 'kwp', label: 'Capacity', type: 'number', unit: 'kWp' },
      ],
    });
    const res = parseMethodologyJson(JSON.stringify(doc));
    expect(res.ok, JSON.stringify(!res.ok && res.errors)).toBe(true);
  });

  it('rejects a table field without columns', () => {
    const doc = baseDoc();
    doc.pdd_sections[0].fields.push({ key: 't', label: 'T', type: 'table', required: false });
    expect(parseMethodologyJson(JSON.stringify(doc)).ok).toBe(false);
  });

  it('rejects columns on a non-table field', () => {
    const doc = baseDoc();
    doc.pdd_sections[0].fields.push({
      key: 't', label: 'T', type: 'text', required: false,
      columns: [{ key: 'c', label: 'C', type: 'text' }],
    });
    expect(parseMethodologyJson(JSON.stringify(doc)).ok).toBe(false);
  });

  it('rejects an unknown document_template', () => {
    const doc = baseDoc();
    doc.document_template = 'NOT-A-FORM';
    expect(parseMethodologyJson(JSON.stringify(doc)).ok).toBe(false);
  });

  it('accepts the new computed sources', () => {
    const doc = baseDoc();
    for (const source of ['annual_generation', 'ec_pj', 'be_annual', 'pe_annual', 'er_annual']) {
      doc.pdd_sections[0].fields.push({ key: `c_${source}`, label: source, type: 'computed', required: false, source });
    }
    const res = parseMethodologyJson(JSON.stringify(doc));
    expect(res.ok, JSON.stringify(!res.ok && res.errors)).toBe(true);
  });
});

describe('schema v2 — defaultValue & siteSpecific', () => {
  const baseDoc = () => JSON.parse(methodologyToJson(seedMethodologies[0]));

  it('round-trips a field with both new flags', () => {
    const doc = baseDoc();
    doc.pdd_sections[0].fields.push({
      key: 'test_default_field', label: 'Default field', type: 'number', required: false,
      defaultValue: 0.8, siteSpecific: true,
    });
    const res = parseMethodologyJson(JSON.stringify(doc));
    expect(res.ok, JSON.stringify(!res.ok && res.errors)).toBe(true);
    if (res.ok) {
      const f = res.methodology.pdd_sections.flatMap((s) => s.fields).find((f) => f.key === 'test_default_field');
      expect(f?.defaultValue).toBe(0.8);
      expect(f?.siteSpecific).toBe(true);
    }
  });

  it('rejects defaultValue on a computed field', () => {
    const doc = baseDoc();
    doc.pdd_sections[0].fields.push({
      key: 't', label: 'T', type: 'computed', required: false, source: 'capacity_kwp',
      defaultValue: 5,
    });
    expect(parseMethodologyJson(JSON.stringify(doc)).ok).toBe(false);
  });

  it('rejects a select defaultValue not present in options', () => {
    const doc = baseDoc();
    doc.pdd_sections[0].fields.push({
      key: 't', label: 'T', type: 'select', required: false, options: ['a', 'b'],
      defaultValue: 'c',
    });
    expect(parseMethodologyJson(JSON.stringify(doc)).ok).toBe(false);
  });
});

describe('schema v2 — REC standard', () => {
  it('accepts standard "REC"', () => {
    const doc = JSON.parse(methodologyToJson(seedMethodologies[0]));
    doc.standard = 'REC';
    const res = parseMethodologyJson(JSON.stringify(doc));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.methodology.standard).toBe('REC');
  });
});

describe('REC production facility registration doc (SF-02)', () => {
  it('is bundled, standard REC, with the 7 SF-02 sections', () => {
    const rec = seedMethodologies.find((m) => m.id === 'meth-rec-solar');
    expect(rec).toBeDefined();
    expect(rec!.standard).toBe('REC');
    expect(rec!.code).toBe('SF-02');
    expect(rec!.pdd_sections.map((s) => s.key)).toEqual([
      'registration_info', 'registrant_contact', 'facility_details',
      'fuel_technology', 'business_details', 'verification_agent', 'additional_info',
    ]);
  });
});

describe('aggregated-PDD schema', () => {
  const fields = TVER_SOLAR_METHODOLOGY.pdd_sections.flatMap((s) => s.fields);
  const byKey = (k: string) => fields.find((f) => f.key === k);

  it('offers the single/aggregated form selector, defaulting to single', () => {
    const f = byKey('project_form');
    expect(f?.type).toBe('select');
    expect(f?.options).toEqual(['แบบเดี่ยว', 'แบบควบรวม']);
    expect(f?.defaultValue).toBe('แบบเดี่ยว');
  });

  it('declares the sites table with every column the aggregated form needs', () => {
    const f = byKey('sites');
    expect(f?.type).toBe('table');
    expect(f?.siteSpecific).toBe(true);
    expect(f?.columns?.map((c) => c.key)).toEqual([
      'owner', 'address', 'coordinates', 'kwp', 'year1_kwh',
      'first_sync_year', 'degradation_pct', 'maintenance_per_year', 'project_id',
    ]);
  });

  it('attributes equipment rows to a site', () => {
    expect(byKey('installations')?.columns?.[0].key).toBe('site');
    expect(byKey('equipment_specs')?.columns?.[0].key).toBe('site');
  });

  it('seeds project_form but not sites into a new PDD', () => {
    const defaults = buildDefaults(TVER_SOLAR_METHODOLOGY);
    expect(defaults.project_form).toBe('แบบเดี่ยว');
    expect(defaults.sites).toBeUndefined();
  });
});

describe('official-form completeness fields (T-VER-S-F001-PDD)', () => {
  const fields = TVER_SOLAR_METHODOLOGY.pdd_sections.flatMap((s) => s.fields);
  const byKey = (k: string) => fields.find((f) => f.key === k);

  // A new field marked required retroactively invalidates registered PDDs whose
  // content hash is frozen — this has already happened once in this project.
  it('adds all four fields as optional', () => {
    for (const k of ['support_equipment', 'project_type', 'coordinator_fax', 'project_start_date']) {
      expect(byKey(k), `missing field ${k}`).toBeDefined();
      expect(byKey(k)!.required, `${k} must stay optional`).toBe(false);
    }
  });

  it('declares support_equipment as a per-site table with the ตารางที่ 3 columns', () => {
    const f = byKey('support_equipment');
    expect(f?.type).toBe('table');
    expect(f?.columns?.map((c) => c.key)).toEqual(['site', 'smart_logger', 'pqm', 'router', 'water_pump', 'weather_sensor']);
    expect(f?.columns?.every((c) => c.type === 'text')).toBe(true);
  });

  it('declares project_type as a select carrying all 15 official categories', () => {
    const f = byKey('project_type');
    expect(f?.type).toBe('select');
    expect(f?.options).toHaveLength(15);
    expect(f?.options?.[0]).toBe('พลังงานหมุนเวียนหรือพลังงานที่ใช้ทดแทนเชื้อเพลิงฟอสซิล');
    expect(f?.options?.[14]).toBe('อื่นๆ');
    // Deliberately unseeded — the template's absent-key fallback covers it, and a
    // defaultValue would change buildDefaults() for every new PDD.
    expect(f?.defaultValue).toBeUndefined();
  });

  it('declares coordinator_fax as text and project_start_date as a site-specific date', () => {
    expect(byKey('coordinator_fax')?.type).toBe('text');
    expect(byKey('project_start_date')?.type).toBe('date');
    expect(byKey('project_start_date')?.siteSpecific).toBe(true);
  });

  it('still round-trips through the JSON contract with the new fields', () => {
    const res = parseMethodologyJson(methodologyToJson(TVER_SOLAR_METHODOLOGY));
    expect(res.ok, JSON.stringify(!res.ok && res.errors)).toBe(true);
  });
});
