"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { useTranslations } from "next-intl";

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

export interface HoldsDonutProps {
  available: number;
  pending: number;
  inTransit: number;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const COLORS = [
  "hsl(142 71% 45%)", // green — available
  "hsl(38 92% 50%)", // amber — pending
  "hsl(217 91% 60%)", // blue  — in transit
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function HoldsDonut({ available, pending, inTransit }: HoldsDonutProps) {
  const t = useTranslations("charts");
  const data = [
    { name: "Available", value: available },
    { name: "Pending", value: pending },
    { name: "In Transit", value: inTransit },
  ];

  const total = available + pending + inTransit;

  if (total === 0) {
    return (
      <div className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">
        {t("noHoldsData")}
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={55}
          outerRadius={85}
          paddingAngle={3}
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
          wrapperStyle={{ fontSize: "12px" }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
