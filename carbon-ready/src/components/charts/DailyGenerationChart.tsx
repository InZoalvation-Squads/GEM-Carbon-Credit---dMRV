import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { format, parseISO } from 'date-fns';

interface Props { data: Array<{ date: string; kwh: number }>; height?: number; }
export function DailyGenerationChart({ data, height = 280 }: Props) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="genGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
        <XAxis dataKey="date" tickFormatter={(d) => format(parseISO(d), 'd MMM')} stroke="#94a3b8" tick={{ fontSize: 11 }} minTickGap={28} />
        <YAxis stroke="#94a3b8" tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(1)}k`} />
        <Tooltip
          contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
          labelFormatter={(d) => format(parseISO(String(d)), 'd MMM yyyy')}
          formatter={(v: number) => [`${v.toLocaleString()} kWh`, 'Generation']}
        />
        <Area type="monotone" dataKey="kwh" stroke="#10b981" strokeWidth={2} fill="url(#genGrad)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}
