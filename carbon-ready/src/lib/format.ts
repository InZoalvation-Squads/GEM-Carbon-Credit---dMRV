export function formatNumber(n: number, digits = 0): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits });
}
export function formatKwh(n: number): string {
  if (n >= 1_000_000) return formatNumber(n / 1_000_000, 2) + ' GWh';
  if (n >= 1_000)     return formatNumber(n / 1_000, 1) + ' MWh';
  return formatNumber(n, 1) + ' kWh';
}
export function formatTco2e(kg: number): string {
  return formatNumber(kg / 1000, 2) + ' tCO₂e';
}
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${formatNumber(bytes / 1024, 0)} KB`;
  return `${formatNumber(bytes / (1024 * 1024), 1)} MB`;
}
