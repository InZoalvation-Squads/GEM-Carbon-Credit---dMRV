import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import argon2 from 'argon2';
import { Prisma, type PrismaClient, type User, type UserRole } from '@prisma/client';
import { appError } from '../../lib/errors.js';
import { uid } from '../../lib/uid.js';

/** argon2id for passwords (low-entropy, needs memory-hard hashing). */
const ARGON2_OPTS = { type: argon2.argon2id } as const;

/**
 * Storage hash for refresh tokens. The token already carries 256 bits of
 * entropy, so memory-hard hashing buys nothing — plain SHA-256 keeps the DB
 * copy useless to a thief without slowing every rotation down.
 */
function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/** One message for unknown email AND wrong password — no account oracle. */
const BAD_CREDENTIALS = 'Invalid email or password';
const INVALID_REFRESH = 'Invalid refresh token';

// ---------------------------------------------------------------------------
// Register / login
// ---------------------------------------------------------------------------

export interface RegisterInput {
  name: string;
  email: string; // already normalized lowercase by the route schema
  role: Exclude<UserRole, 'admin'>; // admins are never self-registered
  password: string;
}

export async function registerUser(prisma: PrismaClient, input: RegisterInput): Promise<User> {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw appError(409, 'CONFLICT', 'Email already registered');

  // Single-org world in Phase 1a — new users join the seeded organization.
  const org = await prisma.organization.findFirst({ orderBy: { created_at: 'asc' } });
  if (!org) throw appError(500, 'INTERNAL', 'No organization configured (run the seed)');

  const password_hash = await argon2.hash(input.password, ARGON2_OPTS);
  try {
    return await prisma.user.create({
      data: {
        id: uid('usr'),
        organization_id: org.id,
        email: input.email,
        name: input.name,
        role: input.role,
        password_hash,
      },
    });
  } catch (err) {
    // Unique-violation race between the pre-check and the insert.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw appError(409, 'CONFLICT', 'Email already registered');
    }
    throw err;
  }
}

// Lazily-built dummy hash so unknown-email logins still pay the argon2
// verification cost (timing parity with the wrong-password path).
let dummyHashPromise: Promise<string> | undefined;
function dummyHash(): Promise<string> {
  dummyHashPromise ??= argon2.hash(randomBytes(16).toString('hex'), ARGON2_OPTS);
  return dummyHashPromise;
}

export async function loginUser(
  prisma: PrismaClient,
  email: string,
  password: string,
): Promise<User> {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user) {
    await argon2.verify(await dummyHash(), password).catch(() => false);
    throw appError(401, 'UNAUTHORIZED', BAD_CREDENTIALS);
  }
  const ok = await argon2.verify(user.password_hash, password);
  if (!ok) throw appError(401, 'UNAUTHORIZED', BAD_CREDENTIALS);
  return user;
}

// ---------------------------------------------------------------------------
// Refresh tokens — `<userId>.<256-bit random hex>` so lookup is a PK fetch,
// stored SHA-256-hashed on the user row, rotated on every use.
// ---------------------------------------------------------------------------

export async function issueRefreshToken(prisma: PrismaClient, userId: string): Promise<string> {
  const token = `${userId}.${randomBytes(32).toString('hex')}`;
  const refresh_token_hash = hashRefreshToken(token);
  await prisma.user.update({
    where: { id: userId },
    data: {
      refresh_token_hash,
      refresh_token_expires_at: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    },
  });
  return token;
}

async function revokeStoredRefreshToken(prisma: PrismaClient, userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { refresh_token_hash: null, refresh_token_expires_at: null },
  });
}

export async function rotateRefreshToken(
  prisma: PrismaClient,
  presented: string,
): Promise<{ user: User; refresh_token: string }> {
  const sep = presented.lastIndexOf('.');
  if (sep <= 0) throw appError(401, 'UNAUTHORIZED', INVALID_REFRESH);
  const userId = presented.slice(0, sep);

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.refresh_token_hash) {
    throw appError(401, 'UNAUTHORIZED', INVALID_REFRESH);
  }

  if (!user.refresh_token_expires_at || user.refresh_token_expires_at.getTime() <= Date.now()) {
    await revokeStoredRefreshToken(prisma, userId);
    throw appError(401, 'UNAUTHORIZED', INVALID_REFRESH);
  }

  const presentedHash = Buffer.from(hashRefreshToken(presented), 'hex');
  const storedHash = Buffer.from(user.refresh_token_hash, 'hex');
  const matches =
    presentedHash.length === storedHash.length && timingSafeEqual(presentedHash, storedHash);
  if (!matches) {
    // Reuse detection: a structurally valid token for this user that does not
    // match the CURRENT hash is an already-rotated (or forged) token being
    // replayed — revoke the active session so the thief's copy dies too.
    await revokeStoredRefreshToken(prisma, userId);
    throw appError(401, 'UNAUTHORIZED', INVALID_REFRESH);
  }

  const refresh_token = await issueRefreshToken(prisma, userId);
  return { user, refresh_token };
}

export async function logoutUser(prisma: PrismaClient, userId: string): Promise<void> {
  await revokeStoredRefreshToken(prisma, userId);
}
