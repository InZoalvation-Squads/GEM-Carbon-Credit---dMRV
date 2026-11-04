import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { setupTestDatabase, resetDatabase } from '../../test/db.js';
import { buildApp } from '../../app.js';
import { auth, createAdmin } from '../../test/fixtures.js';

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
        role: 'project_owner',
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
        role: 'project_owner',
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
          role: 'project_owner',
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

  describe('POST /api/v1/users (admin provisioning)', () => {
    const body = {
      name: 'Daniel Okoye',
      email: 'vvb@example.com',
      role: 'verifier',
      password: 'password-123',
    };

    it('SECURITY: rejects non-admin callers with 403', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/users',
        headers: auth(accessToken),
        payload: body,
      });
      expect(res.statusCode).toBe(403);
      expect(await prisma.user.count({ where: { email: body.email } })).toBe(0);
    });

    it('rejects provisioning an admin with 400', async () => {
      const admin = await createAdmin(app, prisma);
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/users',
        headers: auth(admin.token),
        payload: { ...body, email: 'new-admin@example.com', role: 'admin' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('lets an admin provision a verifier in their org, audited', async () => {
      const admin = await createAdmin(app, prisma);
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/users',
        headers: auth(admin.token),
        payload: body,
      });
      expect(res.statusCode).toBe(201);
      const user = res.json().user;
      expect(user).toMatchObject({ email: body.email, role: 'verifier', organization_id: 'org-0001' });
      expect(user).not.toHaveProperty('password_hash');

      const audit = await prisma.auditLog.findFirst({
        where: { action: 'USER_PROVISIONED', entity_id: user.id },
      });
      expect(audit?.user_id).toBe(admin.id);

      const login = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: body.email, password: body.password },
      });
      expect(login.statusCode).toBe(200);
    });
  });
});
