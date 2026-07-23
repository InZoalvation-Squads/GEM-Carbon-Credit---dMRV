import { randomBytes } from 'node:crypto';

// Same id scheme as the SPA store (carbon-ready/src/store/index.ts uid()):
// `${prefix}-${ts36}-${rand36}` — app-generated string PKs so identifiers
// survive the Phase 1b cutover. Server-side the random portion comes from
// node:crypto (48 bits) instead of Math.random.
export function uid(prefix: string): string {
  const rand = randomBytes(6).readUIntBE(0, 6).toString(36);
  return `${prefix}-${Date.now().toString(36)}-${rand}`;
}
