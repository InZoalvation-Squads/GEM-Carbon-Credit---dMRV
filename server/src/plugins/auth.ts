import fp from 'fastify-plugin';
import jwt from '@fastify/jwt';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { UserRole } from '@prisma/client';
import { config } from '../config.js';
import { appError, unauthorized } from '../lib/errors.js';

/** Claims carried by the 15-minute access token. */
export interface AccessTokenClaims {
  sub: string; // user id
  role: UserRole;
  org: string; // organization id
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: AccessTokenClaims;
    user: AccessTokenClaims & { iat: number; exp: number };
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    /** preHandler: verifies the Bearer JWT; 401 UNAUTHORIZED envelope on failure. */
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    /**
     * preHandler factory: allows only the given roles; 403 FORBIDDEN envelope
     * otherwise. Run it AFTER `authenticate` in the preHandler chain.
     */
    requireRole: (
      ...roles: UserRole[]
    ) => (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export const ACCESS_TOKEN_TTL = '15m';

export const authPlugin = fp(
  async (app) => {
    await app.register(jwt, {
      secret: config.JWT_SECRET,
      sign: { expiresIn: ACCESS_TOKEN_TTL },
    });

    app.decorate('authenticate', async (req: FastifyRequest) => {
      try {
        await req.jwtVerify();
      } catch {
        throw unauthorized();
      }
    });

    app.decorate('requireRole', (...roles: UserRole[]) => {
      return async (req: FastifyRequest) => {
        // Defensive: guard used without `authenticate` first.
        if (!req.user) throw unauthorized();
        if (!roles.includes(req.user.role)) {
          throw appError(403, 'FORBIDDEN', `Requires role: ${roles.join(' or ')}`);
        }
      };
    });
  },
  { name: 'auth-plugin' },
);
