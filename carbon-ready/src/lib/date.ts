import { format, parseISO } from 'date-fns';

export function fmtDate(iso: string): string {
  return format(parseISO(iso), 'd MMM yyyy');
}
export function fmtDateTime(iso: string): string {
  return format(parseISO(iso), 'd MMM yyyy, HH:mm');
}
export function monthLabel(yyyyMm: string): string {
  return format(parseISO(yyyyMm + '-01'), 'MMM yyyy');
}
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
