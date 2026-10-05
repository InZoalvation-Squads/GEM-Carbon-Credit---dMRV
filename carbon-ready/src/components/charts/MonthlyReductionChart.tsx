import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell } from 'recharts';
import { format, parseISO } from 'date-fns';

interface Props { data: Array<{ period: string; tco2e: number; anchored?: boolean }>; height?: number; }
export function MonthlyReductionChart({ data, height = 280 }: Props) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 32, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
        <XAxis dataKey="period" tickFormatter={(p) => format(parseISO(p + '-01'), 'MMM yy')} stroke="#94a3b8" tick={{ fontSize: 11, fill: '#64748b' }} interval="preserveStartEnd" padding={{ left: 8, right: 16 }} />
        <YAxis stroke="#94a3b8" tick={{ fontSize: 11, fill: '#64748b' }} />
        <Tooltip
          contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
          labelFormatter={(p) => format(parseISO(String(p) + '-01'), 'MMM yyyy')}
          formatter={(v: number) => [`${v.toFixed(2)} tCO₂e`, 'Reduction']}
        />
        <Bar dataKey="tco2e" fill="#14b8a6" radius={[6, 6, 0, 0]} isAnimationActive={false}>
          {data.map((row) => <Cell key={row.period} fill="#14b8a6" stroke={row.anchored ? '#14b8a6' : undefined} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
