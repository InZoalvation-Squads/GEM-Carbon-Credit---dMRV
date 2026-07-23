import { z } from 'zod';

/**
 * ISO calendar date (`YYYY-MM-DD`) — the SPA stores record/commission/effective
 * dates as date-only strings, and the schema mirrors that (String columns).
 */
export const isoDateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'expected an ISO date (YYYY-MM-DD)')
  .refine((s) => !Number.isNaN(Date.parse(s)), 'not a real calendar date');
