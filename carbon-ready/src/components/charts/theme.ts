// Shared CSS tokens work in both SVG paints and Recharts tooltip styles.
export const chartTheme = {
  generation: 'var(--petrol-600)', reduction: 'var(--petrol-700)', anchored: 'var(--lime-400)',
  rule: 'var(--rule)', axis: 'var(--ink-3)', surface: 'var(--surface)', ink: 'var(--ink)',
  tooltip: { borderRadius: 6, border: '1px solid var(--rule)', background: 'var(--surface)', color: 'var(--ink)', fontSize: 12 },
} as const;
