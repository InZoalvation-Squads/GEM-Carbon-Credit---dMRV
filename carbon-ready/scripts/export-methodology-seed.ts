// Regenerates server/prisma/seed-data/methodologies/*.json from the SPA
// methodology sources — methodologyToJson is the single serializer, so the
// server seed documents can never drift from what the SPA bundles.
// Run: npx tsx scripts/export-methodology-seed.ts
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { methodologyToJson } from '../src/lib/methodology-schema';
import { seedMethodologies } from '../src/data/seed';

const outDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../server/prisma/seed-data/methodologies');
for (const m of seedMethodologies) {
  writeFileSync(resolve(outDir, `${m.id}.json`), methodologyToJson(m) + '\n');
  console.log(`wrote ${m.id}.json`);
}
