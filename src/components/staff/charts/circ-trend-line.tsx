"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { useTranslations } from "next-intl";

export interface CircTrendLineProps {
  data: Array<{ date: string; checkouts: number; checkins: number }>;
}

export function CircTrendLine({ data }: CircTrendLineProps) {
  const t = useTranslations("charts");

  if (!data || data.length === 0) {
    return (
      <div className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">
        {t("noTrendData")}
      </div>
    );
  }

  const formatted = data.map((d) => ({
    ...d,
    label: new Date(d.date + "T00:00:00").toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    }),
  }));

  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={formatted} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="colorCheckouts" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="hsl(142 71% 45%)" stopOpacity={0.3} />
            <stop offset="95%" stopColor="hsl(142 71% 45%)" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="colorCheckins" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="hsl(217 91% 60%)" stopOpacity={0.3} />
            <stop offset="95%" stopColor="hsl(217 91% 60%)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
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
        <Legend
          verticalAlign="bottom"
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: "12px" }}
        />
        <Area
          type="monotone"
          dataKey="checkouts"
          stroke="hsl(142 71% 45%)"
          strokeWidth={2}
          fillOpacity={1}
          fill="url(#colorCheckouts)"
          name="Checkouts"
        />
        <Area
          type="monotone"
          dataKey="checkins"
          stroke="hsl(217 91% 60%)"
          strokeWidth={2}
          fillOpacity={1}
          fill="url(#colorCheckins)"
          name="Checkins"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
