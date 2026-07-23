import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { setupTestDatabase, resetDatabase } from '../../test/db.js';
import { buildApp } from '../../app.js';

const ORG = { id: 'org-0001', name: 'GreenGrid Asia', country: 'IN' };

function decodeJwtPayload(token: string): Record<string, unknown> {
  const part = token.split('.')[1]!;
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
}

async function registerUser(
  app: FastifyInstance,
  overrides: Record<string, unknown> = {},
) {
  return app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: {
      name: 'Asha Iyer',
      email: 'asha@example.com',
      role: 'project_owner',
      password: 'correct-horse-1',
      ...overrides,
    },
  });
}

describe('auth module', () => {
  let prisma: PrismaClient;
  let app: FastifyInstance;

  beforeAll(async () => {
    const url = await setupTestDatabase();
    prisma = new PrismaClient({ datasourceUrl: url });
    await resetDatabase(prisma);
    await prisma.organization.create({ data: ORG });
    app = await buildApp({ prisma });
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  // ---------------- register ----------------

  describe('POST /api/v1/auth/register', () => {
    it('creates a user and returns 201 {user, access_token, refresh_token}', async () => {
      const res = await registerUser(app, { email: 'Asha@Example.com' });
      expect(res.statusCode).toBe(201);
      const body = res.json();

      // email normalized lowercase
      expect(body.user.email).toBe('asha@example.com');
      expect(body.user.name).toBe('Asha Iyer');
      expect(body.user.role).toBe('project_owner');
      expect(body.user.organization_id).toBe(ORG.id);
      expect(typeof body.user.id).toBe('string');

      // no sensitive fields, ever
      expect(body.user).not.toHaveProperty('password_hash');
      expect(body.user).not.toHaveProperty('refresh_token_hash');
      expect(body.user).not.toHaveProperty('refresh_token_expires_at');

      // access token: JWT with {sub, role, org}, 15-minute validity
      const claims = decodeJwtPayload(body.access_token);
      expect(claims.sub).toBe(body.user.id);
      expect(claims.role).toBe('project_owner');
      expect(claims.org).toBe(ORG.id);
      expect((claims.exp as number) - (claims.iat as number)).toBe(15 * 60);

      // refresh token embeds the user id so lookup never scans
      expect(body.refresh_token.startsWith(`${body.user.id}.`)).toBe(true);
      const random = body.refresh_token.slice(body.user.id.length + 1);
      expect(random).toMatch(/^[0-9a-f]{64}$/); // 256-bit hex

      // stored hashed (argon2), never plaintext; expiry ~7 days out
      const row = await prisma.user.findUniqueOrThrow({ where: { id: body.user.id } });
      expect(row.refresh_token_hash).toMatch(/^\$argon2id\$/);
      expect(row.refresh_token_hash).not.toContain(random);
      expect(row.password_hash).toMatch(/^\$argon2id\$/);
      const ttlMs = row.refresh_token_expires_at!.getTime() - Date.now();
      expect(ttlMs).toBeGreaterThan(6.9 * 24 * 60 * 60 * 1000);
      expect(ttlMs).toBeLessThanOrEqual(7 * 24 * 60 * 60 * 1000);
    });

    it('rejects duplicate email with 409 CONFLICT (case-insensitive)', async () => {
      const res = await registerUser(app, { email: 'ASHA@example.com' });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe('CONFLICT');
    });

    it('rejects a weak password (<8 chars) with 400', async () => {
      const res = await registerUser(app, { email: 'weak@example.com', password: 'short7!' });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects an unknown role with 400', async () => {
      const res = await registerUser(app, { email: 'role@example.com', role: 'superuser' });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('VALIDATION_ERROR');
    });
  });

  // ---------------- login ----------------

  describe('POST /api/v1/auth/login', () => {
    it('logs in with correct credentials', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: 'asha@example.com', password: 'correct-horse-1' },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.user.email).toBe('asha@example.com');
      expect(body.user).not.toHaveProperty('password_hash');
      expect(typeof body.access_token).toBe('string');
      expect(typeof body.refresh_token).toBe('string');
    });

    it('returns the SAME 401 for wrong password and unknown email', async () => {
      const wrongPw = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: 'asha@example.com', password: 'wrong-password' },
      });
      const unknown = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: 'nobody@example.com', password: 'whatever-123' },
      });
      expect(wrongPw.statusCode).toBe(401);
      expect(unknown.statusCode).toBe(401);
      expect(wrongPw.json().error.code).toBe('UNAUTHORIZED');
      expect(unknown.json().error.code).toBe('UNAUTHORIZED');
      // identical message — no account-existence oracle
      expect(wrongPw.json().error.message).toBe(unknown.json().error.message);
    });
  });

  // ---------------- refresh rotation ----------------

  describe('POST /api/v1/auth/refresh', () => {
    async function login() {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: 'asha@example.com', password: 'correct-horse-1' },
      });
      expect(res.statusCode).toBe(200);
      return res.json() as { user: { id: string }; access_token: string; refresh_token: string };
    }

    it('rotates the pair; the old refresh token stops working', async () => {
      const { refresh_token: first } = await login();

      const rotated = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        payload: { refresh_token: first },
      });
      expect(rotated.statusCode).toBe(200);
      const pair = rotated.json();
      expect(typeof pair.access_token).toBe('string');
      expect(typeof pair.refresh_token).toBe('string');
      expect(pair.refresh_token).not.toBe(first);

      // old token is dead
      const replay = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        payload: { refresh_token: first },
      });
      expect(replay.statusCode).toBe(401);
      expect(replay.json().error.code).toBe('UNAUTHORIZED');
    });

    it('reuse detection: replaying a rotated token revokes the current one too', async () => {
      const { user, refresh_token: first } = await login();
      const rotated = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        payload: { refresh_token: first },
      });
      const current = rotated.json().refresh_token as string;

      // attacker replays the old token → 401 AND the session is revoked
      const replay = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        payload: { refresh_token: first },
      });
      expect(replay.statusCode).toBe(401);

      const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(row.refresh_token_hash).toBeNull();
      expect(row.refresh_token_expires_at).toBeNull();

      // the legitimate (current) token no longer works either
      const victim = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        payload: { refresh_token: current },
      });
      expect(victim.statusCode).toBe(401);
    });

    it('rejects garbage tokens with 401', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        payload: { refresh_token: 'usr-nonexistent.deadbeef' },
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe('UNAUTHORIZED');
    });

    it('rejects an expired refresh token with 401', async () => {
      const { user, refresh_token } = await login();
      await prisma.user.update({
        where: { id: user.id },
        data: { refresh_token_expires_at: new Date(Date.now() - 1000) },
      });
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        payload: { refresh_token },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  // ---------------- logout ----------------

  describe('POST /api/v1/auth/logout', () => {
    it('requires authentication', async () => {
      const res = await app.inject({ method: 'POST', url: '/api/v1/auth/logout' });
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe('UNAUTHORIZED');
    });

    it('clears the stored refresh token; refresh afterwards fails', async () => {
      const login = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: 'asha@example.com', password: 'correct-horse-1' },
      });
      const { user, access_token, refresh_token } = login.json();

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/logout',
        headers: { authorization: `Bearer ${access_token}` },
      });
      expect(res.statusCode).toBe(204);

      const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(row.refresh_token_hash).toBeNull();
      expect(row.refresh_token_expires_at).toBeNull();

      const refresh = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        payload: { refresh_token },
      });
      expect(refresh.statusCode).toBe(401);
    });
  });

  // ---------------- role guard ----------------

  describe('requireRole guard', () => {
    let guarded: FastifyInstance;

    beforeAll(async () => {
      guarded = await buildApp({ prisma });
      guarded.get(
        '/admin-only',
        { preHandler: [guarded.authenticate, guarded.requireRole('admin')] },
        async () => ({ ok: true }),
      );
    });

    afterAll(async () => {
      await guarded.close();
    });

    async function tokenFor(email: string, role: string) {
      const res = await guarded.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: { name: 'Guard Test', email, role, password: 'password-123' },
      });
      expect(res.statusCode).toBe(201);
      return res.json().access_token as string;
    }

    it('returns 403 FORBIDDEN envelope for the wrong role', async () => {
      const token = await tokenFor('guard-verifier@example.com', 'verifier');
      const res = await guarded.inject({
        method: 'GET',
        url: '/admin-only',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(403);
      const body = res.json();
      expect(body.error.code).toBe('FORBIDDEN');
      expect(typeof body.error.message).toBe('string');
    });

    it('lets the allowed role through', async () => {
      const token = await tokenFor('guard-admin@example.com', 'admin');
      const res = await guarded.inject({
        method: 'GET',
        url: '/admin-only',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ ok: true });
    });

    it('returns 401 without a token', async () => {
      const res = await guarded.inject({ method: 'GET', url: '/admin-only' });
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe('UNAUTHORIZED');
    });
  });

  // ---------------- rate limit ----------------

  describe('rate limiting on auth routes', () => {
    it('returns 429 RATE_LIMITED on the 21st rapid login attempt', async () => {
      // fresh app instance → fresh in-memory rate-limit counters
      const fresh = await buildApp({ prisma });
      try {
        for (let i = 0; i < 20; i++) {
          const res = await fresh.inject({
            method: 'POST',
            url: '/api/v1/auth/login',
            payload: { email: 'asha@example.com', password: 'wrong-password' },
          });
          expect(res.statusCode).toBe(401);
        }
        const blocked = await fresh.inject({
          method: 'POST',
          url: '/api/v1/auth/login',
          payload: { email: 'asha@example.com', password: 'wrong-password' },
        });
        expect(blocked.statusCode).toBe(429);
        expect(blocked.json().error.code).toBe('RATE_LIMITED');
      } finally {
        await fresh.close();
      }
    }, 60_000);
  });
});
