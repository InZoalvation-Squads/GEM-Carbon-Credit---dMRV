import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { setupTestDatabase, resetDatabase } from '../../test/db.js';
import { buildApp } from '../../app.js';

describe('users module', () => {
  let prisma: PrismaClient;
  let app: FastifyInstance;
  let accessToken: string;
  let userId: string;

  beforeAll(async () => {
    const url = await setupTestDatabase();
    prisma = new PrismaClient({ datasourceUrl: url });
    await resetDatabase(prisma);
    await prisma.organization.create({
      data: { id: 'org-0001', name: 'GreenGrid Asia', country: 'IN' },
    });
    app = await buildApp({ prisma });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        name: 'Mia Chen',
        email: 'mia@example.com',
        role: 'esg_manager',
        password: 'password-123',
      },
    });
    expect(res.statusCode).toBe(201);
    accessToken = res.json().access_token;
    userId = res.json().user.id;
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe('GET /api/v1/users/me', () => {
    it('returns 401 without a token', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/users/me' });
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe('UNAUTHORIZED');
    });

    it('returns 401 for a garbage token', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/users/me',
        headers: { authorization: 'Bearer not-a-jwt' },
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe('UNAUTHORIZED');
    });

    it('returns the current user without any sensitive fields', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/users/me',
        headers: { authorization: `Bearer ${accessToken}` },
      });
      expect(res.statusCode).toBe(200);
      const user = res.json().user;
      expect(user).toEqual({
        id: userId,
        organization_id: 'org-0001',
        email: 'mia@example.com',
        name: 'Mia Chen',
        role: 'esg_manager',
        created_at: expect.any(String),
      });
      expect(user).not.toHaveProperty('password_hash');
      expect(user).not.toHaveProperty('refresh_token_hash');
      expect(user).not.toHaveProperty('refresh_token_expires_at');
    });

    it('returns 401 when the token points at a deleted user', async () => {
      const reg = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          name: 'Ghost',
          email: 'ghost@example.com',
          role: 'verifier',
          password: 'password-123',
        },
      });
      expect(reg.statusCode).toBe(201);
      const { user, access_token } = reg.json();
      await prisma.user.delete({ where: { id: user.id } });

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/users/me',
        headers: { authorization: `Bearer ${access_token}` },
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe('UNAUTHORIZED');
    });
  });
});
