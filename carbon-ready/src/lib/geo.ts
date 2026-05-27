export function locationToCountryCode(s: string): string {
  const map: Record<string, string> = { India: 'IN', Thailand: 'TH', Vietnam: 'VN' };
  return map[s] ?? s;
}
