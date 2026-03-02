"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { useTranslations } from "next-intl";

export interface CollectionDonutProps {
  data: Array<{ name: string; value: number }>;
}

const COLORS = [
  "hsl(142 71% 45%)", // green — Available
  "hsl(217 91% 60%)", // blue — Checked out
  "hsl(38 92% 50%)", // amber — In process
  "hsl(0 84% 60%)", // red — Lost
  "hsl(262 83% 58%)", // purple — On order
  "hsl(180 50% 45%)", // teal — In transit
  "hsl(340 82% 52%)", // pink — Discard/Weed
  "hsl(25 95% 53%)", // orange — Missing
];

export function CollectionDonut({ data }: CollectionDonutProps) {
  const t = useTranslations("charts");

  if (!data || data.length === 0 || data.every((d) => d.value === 0)) {
    return (
      <div className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">
        {t("noCollectionData")}
      </div>
    );
  }

  const total = data.reduce((sum, d) => sum + d.value, 0);

  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="45%"
          innerRadius={55}
          outerRadius={90}
          paddingAngle={2}
          dataKey="value"
          strokeWidth={0}
        >
          {data.map((_, index) => (
            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{
            borderRadius: "8px",
            fontSize: "13px",
            border: "1px solid hsl(var(--border))",
            backgroundColor: "hsl(var(--card))",
            color: "hsl(var(--foreground))",
          }}
          formatter={
            ((value: number | undefined, name: string | undefined) => [
              `${value ?? 0} (${(((value ?? 0) / total) * 100).toFixed(1)}%)`,
              name ?? "",
            ]) as never
          }
        />
        <Legend
          verticalAlign="bottom"
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: "11px" }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
