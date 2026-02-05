export type ScheduledReportKey = "dashboard_kpis" | "holds_summary" | "overdue_items";

export interface ReportDefinition {
  key: ScheduledReportKey;
  label: string;
  description: string;
}

export const SCHEDULED_REPORT_DEFINITIONS: ReportDefinition[] = [
  {
    key: "dashboard_kpis",
    label: "Daily KPIs",
    description: "Daily circulation KPIs (checkouts, checkins, holds, fines, new patrons).",
  },
  {
    key: "holds_summary",
    label: "Holds Summary",
    description: "Active/ready/in-transit holds for the selected pickup library.",
  },
  {
    key: "overdue_items",
    label: "Overdue Items",
    description: "Overdue circulation list (top N) for the selected circulation library.",
  },
];

