import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './app.js';

describe('app scaffold', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    // Throwaway routes to exercise the error handler's code mapping.
    const throwWith = (code: string | undefined, statusCode: number, message: string) => async () => {
      const err = new Error(message) as Error & { code?: string; statusCode?: number };
      err.code = code;
      err.statusCode = statusCode;
      throw err;
    };
    app.get('/boom-fst', throwWith('FST_ERR_CTP_EMPTY_JSON_BODY', 400, 'framework detail'));
    app.get('/boom-conflict', throwWith('CONFLICT', 409, 'already exists'));
    app.get('/boom-internal', throwWith('ERR_SOME_NODE_THING', 500, 'secret internals'));
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health returns 200 { ok: true }', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });

  it('unknown route returns 404 with the error envelope', async () => {
    const res = await app.inject({ method: 'GET', url: '/no-such-route' });
    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body).toHaveProperty('error');
    expect(typeof body.error.code).toBe('string');
    expect(typeof body.error.message).toBe('string');
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('maps framework (FST_*) error codes to the BAD_REQUEST family', async () => {
    const res = await app.inject({ method: 'GET', url: '/boom-fst' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('BAD_REQUEST');
  });

  it('passes allowlisted application error codes through verbatim', async () => {
    const res = await app.inject({ method: 'GET', url: '/boom-conflict' });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: { code: 'CONFLICT', message: 'already exists' } });
  });

  it('hides 5xx details behind the INTERNAL code', async () => {
    const res = await app.inject({ method: 'GET', url: '/boom-internal' });
    expect(res.statusCode).toBe(500);
    const body = res.json();
    expect(body.error.code).toBe('INTERNAL');
    expect(body.error.message).not.toContain('secret');
  });
});
