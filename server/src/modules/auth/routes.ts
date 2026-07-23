import type { FastifyInstance } from 'fastify';
import type { User } from '@prisma/client';
import { z } from 'zod';
import { serializeUser } from '../users/service.js';
import {
  loginUser,
  logoutUser,
  registerUser,
  rotateRefreshToken,
  issueRefreshToken,
} from './service.js';

// Auth routes are brute-forceable — 20 requests/min per client (plan §Task 3).
const AUTH_RATE_LIMIT = { rateLimit: { max: 20, timeWindow: '1 minute' } };

const RegisterBody = z.object({
  name: z.string().trim().min(1, 'name is required'),
  email: z.email().transform((e) => e.toLowerCase()),
  // SECURITY: 'admin' is deliberately absent — admins are provisioned via
  // seed/ops, never through self-service registration.
  role: z.enum(['project_owner', 'esg_manager', 'verifier']),
  password: z.string().min(8, 'password must be at least 8 characters'),
});

const LoginBody = z.object({
  email: z.string().min(1, 'email is required'),
  password: z.string().min(1, 'password is required'),
});

const RefreshBody = z.object({
  refresh_token: z.string().min(1, 'refresh_token is required'),
});

function signAccessToken(app: FastifyInstance, user: User): string {
  return app.jwt.sign({ sub: user.id, role: user.role, org: user.organization_id });
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post('/register', { config: AUTH_RATE_LIMIT }, async (req, reply) => {
    const body = RegisterBody.parse(req.body ?? {});
    const user = await registerUser(app.prisma, body);
    const refresh_token = await issueRefreshToken(app.prisma, user.id);
    return reply.code(201).send({
      user: serializeUser(user),
      access_token: signAccessToken(app, user),
      refresh_token,
    });
  });

  app.post('/login', { config: AUTH_RATE_LIMIT }, async (req) => {
    const body = LoginBody.parse(req.body ?? {});
    const user = await loginUser(app.prisma, body.email, body.password);
    const refresh_token = await issueRefreshToken(app.prisma, user.id);
    return {
      user: serializeUser(user),
      access_token: signAccessToken(app, user),
      refresh_token,
    };
  });

  app.post('/refresh', { config: AUTH_RATE_LIMIT }, async (req) => {
    const body = RefreshBody.parse(req.body ?? {});
    const { user, refresh_token } = await rotateRefreshToken(app.prisma, body.refresh_token);
    return { access_token: signAccessToken(app, user), refresh_token };
  });

  app.post(
    '/logout',
    { config: AUTH_RATE_LIMIT, preHandler: [app.authenticate] },
    async (req, reply) => {
      await logoutUser(app.prisma, req.user.sub);
      return reply.code(204).send();
    },
  );
}
