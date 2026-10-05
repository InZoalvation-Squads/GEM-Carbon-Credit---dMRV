import { describe, it, expect, vi } from 'vitest';
import { botTokenFromConfig, fetchEurThb, parseBotDailyAvg } from './bot-fx.js';
import { config as appConfig, loadConfig } from '../config.js';

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

describe('fetchEurThb robustness', () => {
  it('passes an abort signal and maps a timeout to an unreachable error', async () => {
    const f = vi.fn(async (_u: string, init?: RequestInit) => {
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      throw new DOMException('The operation timed out.', 'TimeoutError');
    });
    const r = await fetchEurThb('tok', f as unknown as typeof fetch);
    expect(r).toMatchObject({ available: true, rate: null });
    expect((r as { error: string }).error.startsWith('BOT API unreachable')).toBe(true);
  });

  it('reports a non-JSON 200 as an unreadable response', async () => {
    const f = vi.fn(async () => new Response('<html>gateway</html>', { status: 200 }));
    expect(await fetchEurThb('tok', f as unknown as typeof fetch)).toEqual({
      available: true, rate: null, error: 'BOT API returned an unreadable response',
    });
  });

  it('reports a 200 with an unexpected shape as no EUR rate', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ foo: 1 }), { status: 200 }));
    const r = await fetchEurThb('tok', f as unknown as typeof fetch);
    expect(r).toMatchObject({ available: true, rate: null });
    expect((r as { error: string }).error).toContain('no EUR rate');
  });
});

describe('botTokenFromConfig', () => {
  const base = {
    DATABASE_URL: 'postgresql://x', JWT_SECRET: 'x'.repeat(32), BOT_API_TOKEN: 'dummy-token',
  } as NodeJS.ProcessEnv;
  const cfg = loadConfig(base);

  it('returns the explicit config token outside tests', () => {
    expect(botTokenFromConfig(cfg, { NODE_ENV: 'production' })).toBe('dummy-token');
  });
  it('is undefined for the real app config under NODE_ENV=test, even if a token is set', () => {
    const prev = appConfig.BOT_API_TOKEN;
    appConfig.BOT_API_TOKEN = 'dummy-token';
    try {
      expect(botTokenFromConfig(undefined, { NODE_ENV: 'test' })).toBeUndefined();
      expect(botTokenFromConfig(undefined, { NODE_ENV: 'production' })).toBe('dummy-token');
    } finally {
      appConfig.BOT_API_TOKEN = prev;
    }
  });
  it('is undefined when no token is configured', () => {
    const noTok = loadConfig({ DATABASE_URL: 'postgresql://x', JWT_SECRET: 'x'.repeat(32) } as NodeJS.ProcessEnv);
    expect(botTokenFromConfig(noTok, { NODE_ENV: 'production' })).toBeUndefined();
  });
});
