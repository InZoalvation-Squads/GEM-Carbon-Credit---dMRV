import { z } from 'zod';

/**
 * ISO calendar date (`YYYY-MM-DD`) — the SPA stores record/commission/effective
 * dates as date-only strings, and the schema mirrors that (String columns).
 */
export const isoDateString = z.iso.date();

/** Route params for the ubiquitous `/:id` pattern. */
export const idParams = z.object({ id: z.string().min(1) });
