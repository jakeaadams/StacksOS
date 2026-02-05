# StacksOS Observability + SLOs (Pilot Baseline)

Last updated: 2026-02-03

StacksOS ships with:
- Correlation IDs (`x-request-id`) for every request (middleware).
- Structured server logs (see `src/lib/logger.ts`).
- An append-only audit log for sensitive actions (`/home/jake/projects/stacksos/.logs/audit.log`).
- Health/status endpoints (`/api/health`, `/api/status`).
- Prometheus-style metrics (`/api/metrics`) when configured.

---

## SLOs (starting point)

These targets are tuned for LAN pilots and match the product PRD’s intent. Adjust per environment.

Latency (p95, perceived end-to-end):
- Checkout: <= 400ms
- Checkin: <= 400ms
- Patron search: <= 1s
- Catalog search: <= 2s

Availability:
- Staff UI + API availability: 99.9% monthly (error budget ~43 min / month)
- Evergreen dependency: treat as a separate SLO; StacksOS should degrade gracefully when Evergreen is offline.

How to measure (pre-prod gate):
- `BASE_URL=http://127.0.0.1:3000 ./audit/run_perf.sh`
- `BASE_URL=http://127.0.0.1:3000 ./audit/run_all.sh`

---

## Metrics (`/api/metrics`)

### Enable

Set a shared secret so the endpoint is not public:

- `STACKSOS_METRICS_SECRET=<long-random-value>`

In production, if `STACKSOS_METRICS_SECRET` is missing, `/api/metrics` returns HTTP 501 (not configured).

### Scrape example

```bash
curl -H "x-stacksos-metrics-secret: $STACKSOS_METRICS_SECRET" http://127.0.0.1:3000/api/metrics
```

Prometheus-friendly (bearer token):

```bash
curl -H "Authorization: Bearer $STACKSOS_METRICS_SECRET" http://127.0.0.1:3000/api/metrics
```

### Key metrics

- `stacksos_opensrf_requests_total{service,method,outcome}`
- `stacksos_opensrf_request_duration_seconds_bucket{service,method,outcome}`
- `stacksos_api_error_responses_total{context,status}`
- `stacksos_scheduled_report_runs_total{report_key,outcome}`
- `stacksos_scheduled_report_run_duration_seconds_bucket{report_key,outcome}`

---

## Alerting (actionable, workflow-tied)

Start with alerts that map to staff-visible failures:

Evergreen gateway health:
- Alert when `/api/health` reports `evergreen.status=down` for >2m.

OpenSRF timeouts/errors:
- Alert on sustained timeout rate (example query):
  - `rate(stacksos_opensrf_requests_total{outcome="timeout"}[5m]) > 0`

Latency regression:
- Alert when p95 OpenSRF latency is above a pilot budget for >5m.
  - Example (aggregate):
    - `histogram_quantile(0.95, sum(rate(stacksos_opensrf_request_duration_seconds_bucket[5m])) by (le)) > 0.5`

Scheduled reports:
- Alert when failures occur:
  - `increase(stacksos_scheduled_report_runs_total{outcome="failure"}[1h]) > 0`

---

## Log correlation (request IDs)

Every response includes `x-request-id`. Use it to connect:
- UI error toast / error screen → server logs (systemd journal) → audit log entries.

Example:

```bash
sudo journalctl -u stacksos.service --no-pager | rg "<request-id>"
rg "<request-id>" /home/jake/projects/stacksos/.logs/audit.log
```
