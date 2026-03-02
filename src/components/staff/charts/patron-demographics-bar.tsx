"use client";

import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useTranslations } from "next-intl";

export interface PatronDemographicsBarProps {
  data: Array<{ name: string; value: number }>;
}

const COLORS = [
  "hsl(217 91% 60%)", // blue
  "hsl(142 71% 45%)", // green
  "hsl(38 92% 50%)", // amber
  "hsl(262 83% 58%)", // purple
  "hsl(0 84% 60%)", // red
  "hsl(180 50% 45%)", // teal
  "hsl(340 82% 52%)", // pink
  "hsl(25 95% 53%)", // orange
];

export function PatronDemographicsBar({ data }: PatronDemographicsBarProps) {
  const t = useTranslations("charts");

  if (!data || data.length === 0 || data.every((d) => d.value === 0)) {
    return (
      <div className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">
        {t("noPatronData")}
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} barSize={32} layout="vertical" margin={{ left: 10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
        <XAxis
          type="number"
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
        />
        <YAxis
          type="category"
          dataKey="name"
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          axisLine={false}
          tickLine={false}
          width={100}
        />
        <Tooltip
          contentStyle={{
            borderRadius: "8px",
            fontSize: "13px",
            border: "1px solid hsl(var(--border))",
            backgroundColor: "hsl(var(--card))",
            color: "hsl(var(--foreground))",
          }}
        />
        <Bar dataKey="value" radius={[0, 6, 6, 0]}>
          {data.map((_, index) => (
            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
