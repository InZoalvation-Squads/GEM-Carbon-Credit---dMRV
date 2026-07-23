// Ports the minimal core of carbon-ready/src/data/seed.ts (source of truth):
// the organization, the 4 demo accounts (carbon-ready/src/data/accounts.ts),
// the IN/TH/VN emission factors, and the 9 methodology documents generated from
// the SPA package via methodologyToJson (prisma/seed-data/methodologies/*.json,
// one file per SPA methodology id).
//
// Idempotent by construction: every row is an upsert keyed by its stable SPA id,
// so `prisma db seed` can run any number of times. Demo users are created ONLY
// when DEMO_SEED_PASSWORD is set (argon2id) — leave it unset in production.
import 'dotenv/config';
import { readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PrismaClient, type Prisma, type UserRole } from '@prisma/client';
import argon2 from 'argon2';

const SEED_DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), 'seed-data');

// ---- Organization (carbon-ready/src/data/seed.ts seedOrg) ----
const SEED_ORG = {
  id: 'org-0001',
  name: 'GreenGrid Asia',
  country: 'IN',
  created_at: new Date('2025-01-01T00:00:00Z'),
};

// ---- Demo accounts (carbon-ready/src/data/accounts.ts DEMO_ACCOUNTS) ----
const DEMO_USERS: Array<{ id: string; email: string; name: string; role: UserRole }> = [
  { id: 'usr-proponent', email: 'proponent@gem.demo', name: 'Asha Iyer', role: 'project_owner' },
  { id: 'usr-vvb', email: 'vvb@gem.demo', name: 'Daniel Okoye', role: 'verifier' },
  { id: 'usr-registry', email: 'registry@gem.demo', name: 'Verra Registry', role: 'admin' },
  { id: 'usr-esg', email: 'esg@gem.demo', name: 'Mia Chen', role: 'esg_manager' },
];
const DEMO_USER_CREATED_AT = new Date('2025-01-01T00:00:00Z');

// ---- Emission factors (carbon-ready/src/data/seed.ts seedFactors) ----
const SEED_FACTORS = [
  { id: 'ef-0001', country: 'IN', source: 'CEA', factor_kgco2e_per_kwh: 0.82, effective_date: '2024-01-01', version: 1, is_current: false, created_at: new Date('2024-01-01T00:00:00Z') },
  { id: 'ef-0002', country: 'IN', source: 'CEA', factor_kgco2e_per_kwh: 0.79, effective_date: '2025-04-01', version: 2, is_current: true, created_at: new Date('2025-04-01T00:00:00Z') },
  { id: 'ef-0003', country: 'TH', source: 'EGAT', factor_kgco2e_per_kwh: 0.51, effective_date: '2024-01-01', version: 1, is_current: true, created_at: new Date('2024-01-01T00:00:00Z') },
  { id: 'ef-0004', country: 'VN', source: 'EVN', factor_kgco2e_per_kwh: 0.68, effective_date: '2024-01-01', version: 1, is_current: true, created_at: new Date('2024-01-01T00:00:00Z') },
];

interface MethodologyDocFile {
  id: string; // SPA methodology id (file name sans .json)
  doc: {
    schema_version: number;
    code: string;
    name: string;
    standard: string;
    version: string;
    status: 'active' | 'deprecated';
    [key: string]: unknown;
  };
}

function loadMethodologyDocs(): MethodologyDocFile[] {
  const dir = join(SEED_DATA_DIR, 'methodologies');
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => ({
      id: basename(f, '.json'),
      doc: JSON.parse(readFileSync(join(dir, f), 'utf8')),
    }));
}

export interface SeedOptions {
  /** When set, the 4 demo users are created with this password (argon2id). */
  demoSeedPassword?: string;
}

export async function seed(prisma: PrismaClient, opts: SeedOptions = {}): Promise<void> {
  // Organization
  await prisma.organization.upsert({
    where: { id: SEED_ORG.id },
    update: { name: SEED_ORG.name, country: SEED_ORG.country },
    create: SEED_ORG,
  });

  // Demo users — skipped entirely without a demo password.
  if (opts.demoSeedPassword) {
    const password_hash = await argon2.hash(opts.demoSeedPassword, { type: argon2.argon2id });
    for (const u of DEMO_USERS) {
      await prisma.user.upsert({
        where: { id: u.id },
        update: { email: u.email, name: u.name, role: u.role, password_hash },
        create: {
          ...u,
          organization_id: SEED_ORG.id,
          password_hash,
          created_at: DEMO_USER_CREATED_AT,
        },
      });
    }
  }

  // Emission factors
  for (const f of SEED_FACTORS) {
    const { id, ...rest } = f;
    await prisma.emissionFactor.upsert({ where: { id }, update: rest, create: f });
  }

  // Methodologies — full schema-v2 documents, ids preserved from the SPA.
  for (const { id, doc } of loadMethodologyDocs()) {
    const fields = {
      code: doc.code,
      name: doc.name,
      standard: doc.standard,
      version: doc.version,
      status: doc.status,
      document: doc as Prisma.InputJsonValue,
    };
    await prisma.methodology.upsert({
      where: { id },
      update: fields,
      create: { id, ...fields },
    });
  }
}

async function main() {
  const prisma = new PrismaClient();
  try {
    await seed(prisma, { demoSeedPassword: process.env.DEMO_SEED_PASSWORD });
    const summary = {
      organizations: await prisma.organization.count(),
      users: await prisma.user.count(),
      emission_factors: await prisma.emissionFactor.count(),
      methodologies: await prisma.methodology.count(),
    };
    console.log('Seed complete:', summary);
    if (!process.env.DEMO_SEED_PASSWORD) {
      console.log('DEMO_SEED_PASSWORD not set — demo users skipped.');
    }
  } finally {
    await prisma.$disconnect();
  }
}

// Run only when executed directly (`prisma db seed` → tsx prisma/seed.ts),
// not when imported by tests.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
