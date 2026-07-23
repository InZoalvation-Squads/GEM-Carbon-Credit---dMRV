import { PrismaClient } from '@prisma/client';

// PrismaClient singleton — cached on globalThis so `tsx watch` reloads and
// test workers reuse one connection pool instead of exhausting Postgres.
const globalForPrisma = globalThis as unknown as { __prisma?: PrismaClient };

export const prisma: PrismaClient = globalForPrisma.__prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__prisma = prisma;
}
