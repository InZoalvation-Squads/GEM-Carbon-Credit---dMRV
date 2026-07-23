// Same id scheme as the SPA store (carbon-ready/src/store/index.ts uid()):
// `${prefix}-${Date.now().toString(36)}-${random36}` — app-generated string
// PKs so identifiers survive the Phase 1b cutover.
export function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}
