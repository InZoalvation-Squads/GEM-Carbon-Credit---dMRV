import { describe, it, expect, vi } from 'vitest';
import { fetchEurThb, parseBotDailyAvg } from './bot-fx.js';

const BOT_FIXTURE = {
  result: {
    data: {
      data_detail: [
        { period: '2026-10-02', currency_id: 'EUR', mid_rate: '37.9012' },
        { period: '2026-10-03', currency_id: 'EUR', mid_rate: '38.1234' },
        { period: '2026-10-04', currency_id: 'EUR', mid_rate: '' }, // holiday row
      ],
    },
  },
};

describe('parseBotDailyAvg', () => {
  it('picks the latest period with a numeric mid rate', () => {
    expect(parseBotDailyAvg(BOT_FIXTURE)).toEqual({ rate: 38.1234, period: '2026-10-03' });
  });
  it('returns null for an unexpected shape', () => {
    expect(parseBotDailyAvg({})).toBeNull();
    expect(parseBotDailyAvg({ result: { data: { data_detail: [] } } })).toBeNull();
  });
});

describe('fetchEurThb', () => {
  it('is dormant without a token', async () => {
    const f = vi.fn();
    expect(await fetchEurThb(undefined, f as unknown as typeof fetch)).toEqual({ available: false });
    expect(f).not.toHaveBeenCalled();
  });

  it('returns the rate with its source when BOT answers', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify(BOT_FIXTURE), { status: 200 }));
    const r = await fetchEurThb('tok', f as unknown as typeof fetch, new Date('2026-10-05T03:00:00Z'));
    expect(r).toEqual({ available: true, rate: 38.1234, period: '2026-10-03', source: 'BOT 2026-10-03' });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('start_period=2026-09-21');
    expect(url).toContain('end_period=2026-10-05');
    expect(url).toContain('currency=EUR');
    expect((init.headers as Record<string, string>).Authorization).toBe('tok');
  });

  it('reports upstream errors in the body instead of throwing', async () => {
    const bad = vi.fn(async () => new Response('nope', { status: 401 }));
    expect(await fetchEurThb('tok', bad as unknown as typeof fetch)).toEqual({
      available: true, rate: null, error: 'BOT API responded 401',
    });
    const down = vi.fn(async () => { throw new Error('ECONNREFUSED'); });
    expect(await fetchEurThb('tok', down as unknown as typeof fetch)).toEqual({
      available: true, rate: null, error: 'BOT API unreachable: ECONNREFUSED',
    });
  });
});
