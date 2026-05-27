import Papa from 'papaparse';
import type { CsvRowError, CsvValidationResult } from '../types';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function parseAndValidateCsv(
  csvText: string,
  existingDates: string[]
): CsvValidationResult {
  const trimmed = csvText.replace(/^﻿/, '').trim();
  if (!trimmed) return { accepted: [], rejected: [] };

  const parsed = Papa.parse<string[]>(trimmed, { skipEmptyLines: true });
  const rows = parsed.data;
  if (rows.length <= 1) return { accepted: [], rejected: [] };

  const accepted: CsvValidationResult['accepted'] = [];
  const rejected: CsvRowError[] = [];
  const seenInFile = new Set<string>();
  const existing = new Set(existingDates);

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 1; // header is row 1
    const dateRaw = (row[0] ?? '').trim();
    const valRaw  = (row[1] ?? '').trim();

    if (!dateRaw) { rejected.push({ row: rowNum, code: 'MISSING_DATE' }); continue; }
    if (!ISO_DATE.test(dateRaw) || Number.isNaN(Date.parse(dateRaw))) {
      rejected.push({ row: rowNum, code: 'INVALID_DATE', date: dateRaw }); continue;
    }
    const val = Number(valRaw);
    if (valRaw === '' || Number.isNaN(val)) {
      rejected.push({ row: rowNum, code: 'INVALID_NUMBER', date: dateRaw, value: valRaw }); continue;
    }
    if (val < 0) {
      rejected.push({ row: rowNum, code: 'NEGATIVE_VALUE', date: dateRaw, value: val }); continue;
    }
    if (seenInFile.has(dateRaw) || existing.has(dateRaw)) {
      rejected.push({ row: rowNum, code: 'DUPLICATE_DATE', date: dateRaw }); continue;
    }
    seenInFile.add(dateRaw);
    accepted.push({ record_date: dateRaw, generation_kwh: val });
  }
  return { accepted, rejected };
}
