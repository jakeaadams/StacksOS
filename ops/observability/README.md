# Observability (Prometheus / Pilot Baseline)

StacksOS exposes Prometheus-format metrics at `/api/metrics`.

## Enable metrics

- Set `STACKSOS_METRICS_SECRET` to a long random value.
- Scrape with either header:
  - `Authorization: Bearer <secret>` (Prometheus-friendly)
  - `x-stacksos-metrics-secret: <secret>`

If `STACKSOS_METRICS_SECRET` is missing in production, `/api/metrics` returns `501`.

## Prometheus alert rules

Import `ops/observability/prometheus-alerts.yml` into your Prometheus (or Alertmanager stack).

These alerts are workflow-tied:
- OpenSRF timeouts and p95 latency regressions (directly impacts staff flows like checkout/checkin/search).
- API 500s (staff-visible failures).
- Scheduled report failures (ops visibility for automated deliveries).

Tune thresholds to your environment and expected pilot load.

