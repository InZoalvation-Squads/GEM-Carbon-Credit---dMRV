import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell } from 'recharts';
import { chartTheme } from './theme';
import { format, parseISO } from 'date-fns';

interface Props { data: Array<{ period: string; tco2e: number; anchored?: boolean }>; height?: number; }
export function MonthlyReductionChart({ data, height = 280 }: Props) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 32, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={chartTheme.rule} vertical={false} />
        <XAxis dataKey="period" tickFormatter={(p) => format(parseISO(p + '-01'), 'MMM yy')} stroke={chartTheme.rule} tick={{ fontSize: 12, fill: chartTheme.axis }} />
        <YAxis stroke={chartTheme.rule} tick={{ fontSize: 12, fill: chartTheme.axis }} />
        <Tooltip
          contentStyle={chartTheme.tooltip}
          labelFormatter={(p) => format(parseISO(String(p) + '-01'), 'MMM yyyy')}
          formatter={(v: number) => [`${v.toFixed(2)} tCO₂e`, 'Reduction']}
        />
        <Bar dataKey="tco2e" fill={chartTheme.reduction} isAnimationActive={false}>
          {data.map((row) => <Cell key={row.period} fill={row.anchored ? chartTheme.anchored : chartTheme.reduction} stroke={row.anchored ? chartTheme.reduction : undefined} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
