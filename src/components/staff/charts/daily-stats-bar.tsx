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

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

export interface DailyStatsBarProps {
  checkouts: number;
  checkins: number;
  activeHolds: number;
  overdue: number;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function DailyStatsBar({ checkouts, checkins, activeHolds, overdue }: DailyStatsBarProps) {
  const t = useTranslations("charts");
  const data = [
    { name: "Checkouts", value: checkouts, fill: "hsl(142 71% 45%)" },
    { name: "Checkins", value: checkins, fill: "hsl(217 91% 60%)" },
    { name: "Holds", value: activeHolds, fill: "hsl(38 92% 50%)" },
    { name: "Overdue", value: overdue, fill: "hsl(0 84% 60%)" },
  ];

  const allZero = data.every((d) => d.value === 0);

  if (allZero) {
    return (
      <div className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">
        {t("noCirculationData")}
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} barSize={36}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
        <XAxis
          dataKey="name"
          tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
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
        <Bar dataKey="value" radius={[6, 6, 0, 0]}>
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.fill} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
