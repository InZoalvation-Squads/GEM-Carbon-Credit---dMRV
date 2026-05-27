import { describe, it, expect } from 'vitest';
import { parseAndValidateCsv } from './csv';

const header = 'Date,Generation_kWh\n';

describe('parseAndValidateCsv', () => {
  it('accepts a valid CSV', () => {
    const csv = header + '2026-01-01,120.5\n2026-01-02,118.2\n';
    const r = parseAndValidateCsv(csv, []);
    expect(r.accepted).toHaveLength(2);
    expect(r.rejected).toHaveLength(0);
    expect(r.accepted[0]).toEqual({ record_date: '2026-01-01', generation_kwh: 120.5 });
  });

  it('rejects missing date', () => {
    const csv = header + ',120.5\n';
    const r = parseAndValidateCsv(csv, []);
    expect(r.accepted).toHaveLength(0);
    expect(r.rejected[0].code).toBe('MISSING_DATE');
  });

  it('rejects negative generation', () => {
    const csv = header + '2026-01-01,-3.2\n';
    const r = parseAndValidateCsv(csv, []);
    expect(r.rejected[0].code).toBe('NEGATIVE_VALUE');
    expect(r.rejected[0].value).toBe(-3.2);
  });

  it('rejects non-numeric generation', () => {
    const csv = header + '2026-01-01,abc\n';
    const r = parseAndValidateCsv(csv, []);
    expect(r.rejected[0].code).toBe('INVALID_NUMBER');
  });

  it('rejects invalid date format', () => {
    const csv = header + '01/01/2026,120\n';
    const r = parseAndValidateCsv(csv, []);
    expect(r.rejected[0].code).toBe('INVALID_DATE');
  });

  it('rejects duplicate dates within file', () => {
    const csv = header + '2026-01-01,120\n2026-01-01,130\n';
    const r = parseAndValidateCsv(csv, []);
    expect(r.accepted).toHaveLength(1);
    expect(r.rejected[0].code).toBe('DUPLICATE_DATE');
    expect(r.rejected[0].date).toBe('2026-01-01');
  });

  it('rejects dates already in existing records', () => {
    const csv = header + '2026-01-01,120\n';
    const r = parseAndValidateCsv(csv, ['2026-01-01']);
    expect(r.accepted).toHaveLength(0);
    expect(r.rejected[0].code).toBe('DUPLICATE_DATE');
  });

  it('partially accepts a mixed-validity file', () => {
    const csv =
      header +
      '2026-01-01,120\n' +
      '2026-01-02,-5\n' +
      '2026-01-03,abc\n' +
      '2026-01-04,200\n';
    const r = parseAndValidateCsv(csv, []);
    expect(r.accepted.map((a) => a.record_date)).toEqual(['2026-01-01', '2026-01-04']);
    expect(r.rejected.map((x) => x.code)).toEqual(['NEGATIVE_VALUE', 'INVALID_NUMBER']);
  });

  it('strips BOM and trims whitespace', () => {
    const csv = '﻿' + header + '  2026-01-01 , 120.5 \n';
    const r = parseAndValidateCsv(csv, []);
    expect(r.accepted).toHaveLength(1);
    expect(r.accepted[0].record_date).toBe('2026-01-01');
  });

  it('accepts zero generation', () => {
    const csv = header + '2026-01-01,0\n';
    const r = parseAndValidateCsv(csv, []);
    expect(r.accepted).toHaveLength(1);
  });

  it('reports correct row numbers (1-indexed, header is row 1)', () => {
    const csv = header + '2026-01-01,120\n,50\n';
    const r = parseAndValidateCsv(csv, []);
    expect(r.rejected[0].row).toBe(3);
  });

  it('handles empty file gracefully', () => {
    const r = parseAndValidateCsv('', []);
    expect(r.accepted).toHaveLength(0);
    expect(r.rejected).toHaveLength(0);
  });
});
