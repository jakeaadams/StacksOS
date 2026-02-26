export type MetricSurfaceTone = "blue" | "indigo" | "emerald" | "amber" | "slate";

type SurfaceClasses = {
  card: string;
  description: string;
  title: string;
  body: string;
};

const METRIC_SURFACE_CLASSES: Record<MetricSurfaceTone, SurfaceClasses> = {
  blue: {
    card: "rounded-2xl border-blue-200/70 bg-blue-50/60",
    description: "text-blue-800",
    title: "text-blue-900",
    body: "text-blue-800",
  },
  indigo: {
    card: "rounded-2xl border-indigo-200/70 bg-indigo-50/60",
    description: "text-indigo-800",
    title: "text-indigo-900",
    body: "text-indigo-800",
  },
  emerald: {
    card: "rounded-2xl border-emerald-200/70 bg-emerald-50/60",
    description: "text-emerald-800",
    title: "text-emerald-900",
    body: "text-emerald-800",
  },
  amber: {
    card: "rounded-2xl border-amber-200/70 bg-amber-50/60",
    description: "text-amber-800",
    title: "text-amber-900",
    body: "text-amber-800",
  },
  slate: {
    card: "rounded-2xl border-slate-200/80 bg-slate-50/70",
    description: "text-slate-700",
    title: "text-slate-900",
    body: "text-slate-700",
  },
};

export function metricSurfaceClasses(tone: MetricSurfaceTone): SurfaceClasses {
  return METRIC_SURFACE_CLASSES[tone];
}
