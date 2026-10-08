// Copied from carbon-ready/src/lib/methodology-schema.ts — source of truth
// until workspaces (Phase 1b). Only the type import differs: the SPA imports
// Methodology from '../types'; the server carries a note-for-note minimal
// subset in ./methodology-types.ts.

import { z } from 'zod';
import type { Methodology } from './methodology-types.js';

// ============================================================
// Methodology document — JSON contract, schema v2
// ============================================================
// A methodology travels as a validated JSON document (export/import) so new
// standards can be added without writing TypeScript. `id` is assigned at
// import time and is NOT part of the document.

export const METHODOLOGY_SCHEMA_VERSION = 2 as const;

const PDD_FIELD_TYPES = [
  'text', 'textarea', 'number', 'select', 'date',
  'boolean', 'url', 'email', 'image', 'computed', 'table',
] as const;

const PDD_COMPUTED_SOURCES = [
  'capacity_kwp', 'project_location', 'commission_date',
  'grid_factor', 'er_estimate',
  'annual_generation', 'ec_pj', 'be_annual', 'pe_annual', 'er_annual',
] as const;

const DOCUMENT_TEMPLATES = ['T-VER-S-F001-PDD', 'EVIDENT-SF-02'] as const;

const EVIDENCE_CATEGORIES = [
  'meter_reading', 'utility_bill', 'commissioning_report', 'site_photo',
  'maintenance_report', 'supporting_evidence', 'verification_report',
] as const;

const CALC_FORMULAS = [
  'grid_displacement', 'biomass_stock_change', 'ch4_avoidance', 'direct_entry',
] as const;

const ShowIfSchema = z.strictObject({
  field: z.string().min(1),
  equals: z.string(),
});

const PddTableColumnSchema = z.strictObject({
  key: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(['text', 'number']),
  unit: z.string().min(1).optional(),
});

const PddFieldSchema = z.strictObject({
  key: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(PDD_FIELD_TYPES),
  unit: z.string().min(1).optional(),
  required: z.boolean(),
  options: z.array(z.string().min(1)).optional(),
  help: z.string().optional(),
  showIf: ShowIfSchema.optional(),
  source: z.enum(PDD_COMPUTED_SOURCES).optional(),
  sensitive: z.boolean().optional(),
  columns: z.array(PddTableColumnSchema).min(1).optional(),
  defaultValue: z.unknown().optional(),
  siteSpecific: z.boolean().optional(),
});

const PddSectionSchema = z.strictObject({
  key: z.string().min(1),
  title: z.string().min(1),
  help: z.string().optional(),
  fields: z.array(PddFieldSchema).min(1),
});

const MonitoringParamSchema = z.strictObject({
  key: z.string().min(1),
  label: z.string().min(1),
  unit: z.string().min(1),
  method: z.string().min(1),
  frequency: z.string().min(1),
});

const MethodologyCalculationSchema = z.strictObject({
  formula: z.enum(CALC_FORMULAS),
  input_param: z.string().min(1),
  input_unit: z.string().min(1),
  gwp_ch4: z.number().positive().optional(),
});

const MethodologyDocSchema = z.strictObject({
  schema_version: z.literal(METHODOLOGY_SCHEMA_VERSION),
  code: z.string().min(1),
  name: z.string().min(1),
  standard: z.enum(['T-VER', 'Verra', 'CDM', 'REC']),
  version: z.string().min(1),
  sectoral_scope: z.string().min(1),
  status: z.enum(['active', 'deprecated']),
  calculation: MethodologyCalculationSchema,
  pdd_sections: z.array(PddSectionSchema).min(1),
  required_evidence: z.array(z.enum(EVIDENCE_CATEGORIES)).min(1),
  monitoring_params: z.array(MonitoringParamSchema).min(1),
  document_template: z.enum(DOCUMENT_TEMPLATES).optional(),
  // Developer-handoff metadata — optional so pre-schema JSON exports still import,
  // and so hand-maintained text next to each methodology travels with its JSON.
  usage: z.string().min(1).optional(),
}).superRefine((doc, ctx) => {
  // --- calculation ↔ monitoring_params ---
  const driver = doc.monitoring_params.find((p) => p.key === doc.calculation.input_param);
  if (!driver) {
    ctx.addIssue({
      code: 'custom', path: ['calculation', 'input_param'],
      message: `references "${doc.calculation.input_param}", which is not a monitoring_params key`,
    });
  } else if (driver.unit !== doc.calculation.input_unit) {
    ctx.addIssue({
      code: 'custom', path: ['calculation', 'input_unit'],
      message: `"${doc.calculation.input_unit}" does not match the "${driver.key}" parameter unit "${driver.unit}"`,
    });
  }

  // gwp_ch4 travels with ch4_avoidance and nothing else — keep documents clean.
  if (doc.calculation.formula === 'ch4_avoidance' && doc.calculation.gwp_ch4 === undefined) {
    ctx.addIssue({
      code: 'custom', path: ['calculation', 'gwp_ch4'],
      message: 'is required when formula is "ch4_avoidance"',
    });
  }
  if (doc.calculation.formula !== 'ch4_avoidance' && doc.calculation.gwp_ch4 !== undefined) {
    ctx.addIssue({
      code: 'custom', path: ['calculation', 'gwp_ch4'],
      message: `is only allowed when formula is "ch4_avoidance" (got "${doc.calculation.formula}")`,
    });
  }

  // Duplicate monitoring param keys.
  const paramKeys = new Set<string>();
  doc.monitoring_params.forEach((p, i) => {
    if (paramKeys.has(p.key)) {
      ctx.addIssue({
        code: 'custom', path: ['monitoring_params', i, 'key'],
        message: `duplicate monitoring parameter key "${p.key}"`,
      });
    }
    paramKeys.add(p.key);
  });

  // --- PDD fields: unique keys across ALL sections ---
  const fieldKeys = new Set<string>();
  doc.pdd_sections.forEach((section, si) => {
    section.fields.forEach((f, fi) => {
      if (fieldKeys.has(f.key)) {
        ctx.addIssue({
          code: 'custom', path: ['pdd_sections', si, 'fields', fi, 'key'],
          message: `duplicate field key "${f.key}" (field keys must be unique across all sections)`,
        });
      }
      fieldKeys.add(f.key);
    });
  });

  // --- per-field cross-checks ---
  doc.pdd_sections.forEach((section, si) => {
    section.fields.forEach((f, fi) => {
      const path = ['pdd_sections', si, 'fields', fi];
      if (f.type === 'select' && (!f.options || f.options.length === 0)) {
        ctx.addIssue({ code: 'custom', path: [...path, 'options'], message: `select field "${f.key}" must declare non-empty options` });
      }
      if (f.type === 'computed' && !f.source) {
        ctx.addIssue({ code: 'custom', path: [...path, 'source'], message: `computed field "${f.key}" must declare a source` });
      }
      if (f.type !== 'computed' && f.source) {
        ctx.addIssue({ code: 'custom', path: [...path, 'source'], message: `field "${f.key}" is not computed and must not declare a source` });
      }
      if (f.type === 'computed' && f.sensitive) {
        ctx.addIssue({ code: 'custom', path: [...path, 'sensitive'], message: `computed field "${f.key}" cannot be marked sensitive` });
      }
      if (f.type === 'table' && (!f.columns || f.columns.length === 0)) {
        ctx.addIssue({ code: 'custom', path: [...path, 'columns'], message: `table field "${f.key}" must declare non-empty columns` });
      }
      if (f.type !== 'table' && f.columns) {
        ctx.addIssue({ code: 'custom', path: [...path, 'columns'], message: `field "${f.key}" is not a table and must not declare columns` });
      }
      if (f.showIf && !fieldKeys.has(f.showIf.field)) {
        ctx.addIssue({ code: 'custom', path: [...path, 'showIf', 'field'], message: `showIf on "${f.key}" references unknown field "${f.showIf.field}"` });
      }
      if (f.type === 'computed' && f.defaultValue !== undefined) {
        ctx.addIssue({ code: 'custom', path: [...path, 'defaultValue'], message: `computed field "${f.key}" must not declare a defaultValue (it would be silently ignored)` });
      }
      if (f.type === 'select' && f.defaultValue !== undefined && !(f.options ?? []).includes(f.defaultValue as string)) {
        ctx.addIssue({ code: 'custom', path: [...path, 'defaultValue'], message: `select field "${f.key}" defaultValue must be one of its options` });
      }
    });
  });
});

export type MethodologyDoc = z.infer<typeof MethodologyDocSchema>;

export type ParseResult =
  | { ok: true; methodology: Omit<Methodology, 'id'> }
  | { ok: false; errors: string[] };

/** Parse + validate a methodology JSON document (schema v2). */
export function parseMethodologyJson(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { ok: false, errors: [`Invalid JSON: ${e instanceof Error ? e.message : String(e)}`] };
  }
  // Friendly version gate before zod — a mismatched schema_version would otherwise
  // surface as an opaque literal-mismatch issue.
  if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
    const v = (raw as Record<string, unknown>).schema_version;
    if (v !== METHODOLOGY_SCHEMA_VERSION) {
      return {
        ok: false,
        errors: [`This file uses methodology format version ${v ?? 'unknown'}; this app requires version ${METHODOLOGY_SCHEMA_VERSION}.`],
      };
    }
    delete (raw as Record<string, unknown>).source_path;
  }
  const result = MethodologyDocSchema.safeParse(raw);
  if (!result.success) {
    const errors = result.error.issues.map((i) => {
      const path = i.path.join('.');
      return path ? `${path}: ${i.message}` : i.message;
    });
    return { ok: false, errors };
  }
  const { schema_version: _v, ...methodology } = result.data;
  return { ok: true, methodology };
}

/** Serialize a methodology to its JSON document: id stripped, schema_version stamped. */
export function methodologyToJson(m: Methodology): string {
  const { id: _id, ...rest } = m;
  return JSON.stringify({ schema_version: METHODOLOGY_SCHEMA_VERSION, ...rest }, null, 2);
}
