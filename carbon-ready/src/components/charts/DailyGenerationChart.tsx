import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { chartTheme } from './theme';
import { format, parseISO } from 'date-fns';

interface Props { data: Array<{ date: string; kwh: number }>; height?: number; }
export function DailyGenerationChart({ data, height = 280 }: Props) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 32, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={chartTheme.rule} vertical={false} />
        <XAxis dataKey="date" tickFormatter={(d) => format(parseISO(d), 'd MMM')} stroke={chartTheme.rule} tick={{ fontSize: 12, fill: chartTheme.axis }} minTickGap={28} interval="preserveStartEnd" padding={{ left: 8, right: 16 }} />
        <YAxis stroke={chartTheme.rule} tick={{ fontSize: 12, fill: chartTheme.axis }} tickFormatter={(v) => `${(v / 1000).toFixed(1)}k`} />
        <Tooltip
          contentStyle={chartTheme.tooltip}
          labelFormatter={(d) => format(parseISO(String(d)), 'd MMM yyyy')}
          formatter={(v: number) => [`${v.toLocaleString()} kWh`, 'Generation']}
        />
        <Area type="monotone" dataKey="kwh" stroke={chartTheme.generation} strokeWidth={2} fill={chartTheme.generation} fillOpacity={0.1} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
