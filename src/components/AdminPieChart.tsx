import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";

interface Props {
  data: Array<{ key: string; total: number }>;
  colors: string[];
}

export default function AdminPieChart({ data, colors }: Props) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={data}
          dataKey="total"
          nameKey="key"
          cx="50%"
          cy="50%"
          outerRadius={80}
          label={({ key, percent }: { key: string; percent: number }) => `${key} ${(percent * 100).toFixed(0)}%`}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={colors[i % colors.length]} />
          ))}
        </Pie>
        <Tooltip formatter={(v: number) => `$${v.toFixed(2)}`} />
      </PieChart>
    </ResponsiveContainer>
  );
}
