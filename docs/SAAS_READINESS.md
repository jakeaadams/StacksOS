# StacksOS SaaS Readiness (Draft)

Date: 2026-02-01

This document is a **product + platform** implementation plan for turning the current StacksOS + Evergreen setup into a production-grade **multi-tenant ILS SaaS** (Polaris-style).

---

## 0) What you have today (from code + audits)

- **StacksOS** is a Next.js app (server-rendered + API routes) that talks to Evergreen via OpenSRF gateway.
- **Evergreen** is the system of record (Postgres + OpenSRF services) and StacksOS is the modern staff/UI frontend.
- StacksOS currently assumes **one Evergreen “backend” per deployment** (configured via `EVERGREEN_BASE_URL` + DB connection for custom tables).

Implication: this is already a workable architecture, but SaaS needs tenant isolation, operational controls, and clear boundaries between StacksOS-owned data vs Evergreen-owned data.

---

## 1) Hosting architecture: Vercel + Evergreen on DO vs “everything on DO”

### Option A — StacksOS on Vercel, Evergreen on DigitalOcean (recommended for SaaS)

Pros
- StacksOS becomes **stateless** and scales horizontally automatically.
- Fast global edge caching for public OPAC pages (where safe).
- Strong DX for deploy previews, CI/CD, rollbacks.
- Clear separation of concerns: Evergreen stays in private network; StacksOS is public edge.

Cons / constraints
- You must keep Evergreen reachable from Vercel securely:
  - VPN/WireGuard, private gateway, or a hardened API proxy.
  - Avoid exposing OpenSRF internals directly to the Internet.
- Long-lived connections and “LAN assumptions” need refactoring (but StacksOS is already HTTP-based to the gateway).
- Any filesystem writes in StacksOS (uploads) must move to **object storage** (S3-compatible).

### Option B — Both StacksOS + Evergreen on DO (single box or same VPC)

Pros
- Simplest networking: everything is local/private by default.
- Easy to run “all-in-one” for a single tenant.
- Cheapest initial setup for prototyping.

Cons
- Harder to scale StacksOS independently (CPU/memory contention with Evergreen).
- Operational blast radius: one outage impacts both tiers.
- Harder multi-tenant story (you’ll outgrow “one droplet per tenant” quickly).

### Practical recommendation
- **SaaS**: Option A (StacksOS on Vercel or k8s, Evergreen per tenant in DO VPC).
- **Single library / pilot**: Option B can work, but plan migration early.

---

## 2) Multi-tenancy model (make this decision early)

### Model 1 — “One Evergreen per tenant” (recommended)
- Each customer gets an isolated Evergreen stack:
  - Dedicated Postgres DB
  - Dedicated OpenSRF services
  - Dedicated ejabberd messaging
- StacksOS routes tenant requests to the right Evergreen by tenant config.

Pros: strongest isolation, simplest compliance story, predictable upgrades.
Cons: more infra per customer, but automation solves it.

### Model 2 — “Shared Evergreen consortium style” (not recommended for SaaS)
- One DB for many libraries, separated by org units.

Pros: efficient for true consortiums.
Cons: poor tenant isolation for SaaS customers; policy/data bleed risk; upgrades become political.

---

## 3) Data ownership boundaries (avoid “mystery tables”)

### Evergreen-owned data
- Bibliographic records (MARC)
- Items/copies, holds, checkouts, fines, patrons, policies

### StacksOS-owned data (should be explicitly designed)
- UI preferences: density, workforms, pinned views
- Activity stream + audit UX
- Uploads that Evergreen doesn’t store well:
  - Staff avatars (optional)
  - Patron photos (optional)
  - Cover art overrides (optional)

Recommendation: keep StacksOS-owned data in **its own DB** (Neon/Postgres) instead of writing into Evergreen’s DB schema long-term. It makes SaaS upgrades safer and keeps tenant boundaries cleaner.

---

## 4) Operational requirements for SaaS readiness

### Security baseline
- No public OpenSRF/Erlang/XMPP ports to the internet.
- Explicit firewall rules + security groups.
- Credential rotation procedure + secrets manager (DO / AWS / 1Password / Vault).
- SSO roadmap (SAML/OIDC) for staff logins.
- Tenant-level audit trails (who changed what, when).

### Reliability
- Automated nightly backups (DB + config) for Evergreen (already scripted).
- Backups for StacksOS-owned DB + object storage.
- Runbooks: restore, disaster recovery (RPO/RTO targets).
- Monitoring: health checks, alerting, log aggregation.

### Performance
- End-to-end latency budgets: search, checkout, checkin, patron load.
- Caching strategy:
  - OPAC cache (safe)
  - Staff cache (careful: permissions + freshness)
- Load testing harness and regression gates.

---

## 5) UX “Polaris/LEAP parity” roadmap (high-level)

### Near-term “make it feel real”
- Remove all placeholder/demo UI and only render real data (or explicitly say “Not configured yet”).
- Normalize patterns across the app:
  - “Results” counts appear only after a search runs.
  - Side panels (cockpits) always show an avatar/photo + key actions.
  - Consistent empty states and loading states.

### Polaris-inspired workflows to add
- **Environment color coding** (already supported via env banner).
- **Workform tracker** (already present; refine pinning + multi-record handling).
- **Split-screen MARC compare** (high value for cataloging).
- **Auto-suggest search** (patrons/items/records; show quick results as you type).

---

## 6) AI roadmap (practical, library-safe)

### P0 (safe, immediate value)
- **Metadata enrichment suggestions**: propose ISBN/author normalization, missing fields, series, audience.
- **Cover art candidates**: show multiple options + source attribution + “choose best”.
- **Deduplication hints**: flag probable duplicate bibs during import (ISBN + title/author similarity).

### P1 (operational intelligence)
- **Anomaly detection**:
  - sudden spike in checkins, holds, fines
  - suspicious staff activity patterns
- **Forecasting**:
  - holds fulfillment time estimates
  - staffing load forecasts

### P2 (assistive workflows)
- “Explain this screen / policy” contextual assistant for staff.
- Natural language report builder with guardrails.
- MARC “lint + fix” assistant (always reviewable, never auto-apply).

Safety constraints
- No patron PII sent to external LLMs without explicit opt-in, redaction, and contracts.
- Prefer on-prem / VPC-hosted model for sensitive tenants.

---

## 7) Next concrete steps (recommended)

1. Decide tenancy model (recommended: one Evergreen per tenant).
2. Add a tenant router layer in StacksOS (tenant → Evergreen base URL + creds).
3. Move StacksOS “custom tables” out of Evergreen DB into a StacksOS DB.
4. Adopt object storage for uploads (covers/photos).
5. Add admin UX in StacksOS for:
   - staff profiles + permissions mapping
   - org/location configuration views (read-only first)
6. Expand Playwright UX regressions to cover:
   - patron search behaviors
   - record/item detail behaviors
   - staff admin behaviors
   - “no placeholder UI” checks.

