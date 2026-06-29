import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

interface PieChartWrapperProps {
  data: Array<{ name: string; value: number }>;
  colors: string[];
}

export default function PortfolioPieChart({ data, colors }: PieChartWrapperProps) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" outerRadius={80} innerRadius={50}>
          {data.map((_, i) => <Cell key={i} fill={colors[i % colors.length]} />)}
        </Pie>
        <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
