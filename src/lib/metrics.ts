import { Counter, Histogram, Registry, collectDefaultMetrics } from "prom-client";

const registry = new Registry();

collectDefaultMetrics({
  register: registry,
  prefix: "stacksos_",
});

export const opensrfRequestsTotal = new Counter({
  name: "stacksos_opensrf_requests_total",
  help: "Total OpenSRF gateway requests made by StacksOS.",
  registers: [registry],
  labelNames: ["service", "method", "outcome"] as const,
});

export const opensrfRequestDurationSeconds = new Histogram({
  name: "stacksos_opensrf_request_duration_seconds",
  help: "OpenSRF gateway request duration in seconds.",
  registers: [registry],
  labelNames: ["service", "method", "outcome"] as const,
  buckets: [0.01, 0.02, 0.05, 0.1, 0.2, 0.35, 0.5, 0.75, 1, 2, 5, 10, 15],
});

export const apiErrorResponsesTotal = new Counter({
  name: "stacksos_api_error_responses_total",
  help: "Count of API error responses emitted via serverErrorResponse().",
  registers: [registry],
  labelNames: ["context", "status"] as const,
});

export const scheduledReportRunsTotal = new Counter({
  name: "stacksos_scheduled_report_runs_total",
  help: "Count of scheduled report runs executed.",
  registers: [registry],
  labelNames: ["report_key", "outcome"] as const,
});

export const scheduledReportRunDurationSeconds = new Histogram({
  name: "stacksos_scheduled_report_run_duration_seconds",
  help: "Scheduled report run duration in seconds.",
  registers: [registry],
  labelNames: ["report_key", "outcome"] as const,
  buckets: [0.25, 0.5, 1, 2, 5, 10, 20, 30, 60, 120, 300],
});

export function getMetricsRegistry(): Registry {
  return registry;
}

