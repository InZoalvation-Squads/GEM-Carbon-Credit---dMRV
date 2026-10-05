// Bank of Thailand daily weighted-average EUR→THB (mid rate), used to convert
// the Evident participant fees (€500 opening, €2,000/yr) in the REC ROI page.
// Dormant until BOT_API_TOKEN is set — same pattern as the IoT ingest worker.
// Upstream failures are reported in the body (never thrown): the API error
// envelope masks 5xx messages, and the UI falls back to manual entry anyway.
//
// NOTE: the URL, auth header name and response shape below are the plan's
// assumptions and have NOT been verified against the BOT API portal docs.

import { config as appConfig, type Config } from '../config.js';

const BOT_URL = 'https://gateway.api.bot.or.th/Stat-ExchangeRate/v2/DAILY_AVG_EXG_RATE/';
const LOOKBACK_DAYS = 14; // spans weekends + Thai holiday runs
const BOT_TIMEOUT_MS = 8_000;

/**
 * The BOT token to use for live lookups. Under vitest the real app config
 * yields undefined so a token in server/.env can never trigger an outbound
 * call during `npm test` (same guard as iotConfigFromEnv in lib/iot.ts).
 * Pass an explicit cfg to exercise the token path in unit tests.
 */
export function botTokenFromConfig(
  cfg: Config = appConfig,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  if (env.NODE_ENV === 'test' && cfg === appConfig) return undefined;
  return cfg.BOT_API_TOKEN;
}

export type EurThbResult =
  | { available: false }
  | { available: true; rate: number; period: string; source: string }
  | { available: true; rate: null; error: string };

/** Latest row with a numeric, positive mid_rate; null when the shape is unexpected. */
export function parseBotDailyAvg(json: unknown): { rate: number; period: string } | null {
  const detail = (json as { result?: { data?: { data_detail?: unknown } } })?.result?.data?.data_detail;
  if (!Array.isArray(detail)) return null;
  const rows = detail
    .map((d: { period?: unknown; mid_rate?: unknown }) => ({
      period: typeof d?.period === 'string' ? d.period : '',
      rate: d?.mid_rate === '' || d?.mid_rate === null || d?.mid_rate === undefined ? NaN : Number(d.mid_rate),
    }))
    .filter((r) => r.period !== '' && Number.isFinite(r.rate) && r.rate > 0)
    .sort((x, y) => y.period.localeCompare(x.period));
  return rows[0] ?? null;
}

export async function fetchEurThb(
  token: string | undefined,
  fetchImpl: typeof fetch = fetch,
  today: Date = new Date(),
): Promise<EurThbResult> {
  if (!token) return { available: false };
  const end = today.toISOString().slice(0, 10);
  const start = new Date(today.getTime() - LOOKBACK_DAYS * 86_400_000).toISOString().slice(0, 10);
  const url = `${BOT_URL}?start_period=${start}&end_period=${end}&currency=EUR`;
  try {
    const res = await fetchImpl(url, {
      headers: { Authorization: token, accept: 'application/json' },
      signal: AbortSignal.timeout(BOT_TIMEOUT_MS),
    });
    if (!res.ok) return { available: true, rate: null, error: `BOT API responded ${res.status}` };
    let json: unknown;
    try {
      json = await res.json();
    } catch {
      return { available: true, rate: null, error: 'BOT API returned an unreadable response' };
    }
    const parsed = parseBotDailyAvg(json);
    if (!parsed) return { available: true, rate: null, error: `BOT API returned no EUR rate for the last ${LOOKBACK_DAYS} days` };
    return { available: true, rate: parsed.rate, period: parsed.period, source: `BOT ${parsed.period}` };
  } catch (e) {
    return { available: true, rate: null, error: `BOT API unreachable: ${(e as Error).message}` };
  }
}
