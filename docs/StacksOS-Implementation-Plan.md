# StacksOS Implementation Plan (World-class) — 2026-02-01

This doc turns the PRD + backlog into an executable, sequenced plan. It also spells out how we’ll implement “AI stuff” without sacrificing trust.

**Source of truth for work items:** `docs/StacksOS-Execution-Backlog.md`

## Where we are (baseline)

Recently shipped (2026-02-01):
- Polaris-style **environment banner** (`/api/env`, `STACKSOS_ENV_LABEL`, `STACKSOS_ENV_TONE`)
- Polaris-style **always-visible autosuggest search** in the top header
- Polaris-style **Workform Tracker** in the sidebar (recent + pinned “open records”)
- Polaris-style **split-screen MARC compare** (`/staff/cataloging/marc-editor?id=…&compare=…`)
- Fixed a root Evergreen/OpenSRF integration bug where spaces became literal `+` inside request params (broke pcrud `order_by`, causing “0 results” / empty lists)

Key credibility rule (non-negotiable):
- No demo/fake data in staff workflows. If a screen is empty, it must be empty because Evergreen is empty or misconfigured — and we should show that clearly.

## Hosting + SaaS architecture (what to do first)

StacksOS is a stateless app tier. Evergreen is a stateful ILS tier (Postgres + OpenSRF + XMPP + Apache). For SaaS, you want:
- Evergreen kept **private** (east/west only), with StacksOS as the only public ingress.
- StacksOS and Evergreen **co-located** (same region, ideally same VPC) to keep scan-first staff workflows fast/reliable.

### Vercel (StacksOS) + DigitalOcean (Evergreen)
This can work, but it’s not the default for staff-heavy deployments.

Pros:
- Great Next.js deploy ergonomics (previews/rollbacks) and edge/CDN for public pages.
- Easy horizontal scaling of the app tier.

Cons (important):
- Adds internet RTT on every staff action: browser → Vercel → Evergreen → Vercel → browser.
- Private Evergreen becomes harder: you either (a) expose Evergreen publicly (bad), or (b) build VPN/tunnel/allowlist plumbing (ops-heavy).
- Distributed debugging/observability across providers.

### DigitalOcean (StacksOS) + DigitalOcean (Evergreen) in same region/VPC
Recommended for “real circulation desk” performance and for SaaS security posture.

Pros:
- Lowest latency and simplest private networking.
- Smaller public attack surface (only StacksOS behind WAF/LB).
- Easier incident response (one provider, one VPC).

Cons:
- You own more ops (deploys, scaling, monitoring) unless you use DO App Platform/K8s.

### Practical phased recommendation
1) Early SaaS (first pilots): single-tenant per library, StacksOS + Evergreen in same DO region/VPC (even same droplet is acceptable initially).
2) Growth: separate droplets (or k8s namespaces) per tenant; centralize logging/metrics; move uploads to object storage.
3) Maturity: automated tenant provisioning, blue/green upgrades, per-tenant secrets/keys, and stronger isolation.

## Execution order (what to do next)

### Phase 0 — Stabilize + remove “fake” (P0 credibility)
Goal: every staff screen is either (a) real Evergreen-backed, or (b) explicitly hidden behind feature flags.

Deliverables:
- Make “empty” screens actionable: show exact missing Evergreen configuration / required permissions / missing methods.
- Remove remaining hardcoded demo fixtures from Staff UI (especially anything that looks like fake circulation history, fake activity, fake “AI answers”).
- Keep `npm run test:run`, `npm run build`, `npm run test:e2e` green.
- Add/expand audit scanners (`npm run audit:demo`) into the go/no-go checklist.

### Phase 1 — Polaris parity “feel” (speed + keyboard + reduced clicks)
Goal: staff can do common tasks with fewer clicks than Polaris LEAP while keeping Evergreen as the system-of-record.

Deliverables:
- “Workform tracker” becomes a real work surface:
  - opens patron/bib/item/circ desk as “workforms”
  - shows presence of unsaved changes / draft notes
  - supports pin/close + quick switch shortcuts
- “Record cockpit” for bib + patron (fast actions, holdings, holds, checkin/out, notes) without losing context.
- Split-screen MARC compare goes from “diff viewer” → “compare + selective apply” (explicit, audited).

### Phase 2 — StacksOS-first Administration (not “go configure Evergreen”)
Goal: StacksOS owns the admin experience even if Evergreen remains the backend.

Deliverables:
- Admin hub that maps real-world questions → underlying Evergreen settings:
  - “Why is this item reshelving?” → item statuses + copy locations
  - “Who can do X?” → permission groups + staff roles
  - “Why does checkout block?” → policies + exceptions + override permissions
- Staff user management UX that works even on Evergreen installs with limited APIs (fallbacks + clear messaging).
- Tenant-ready config surfaces (even in a single-server sandbox): env banners, feature flags, AI toggles.

### Phase 3 — AI (P2 differentiators) done the right way
Goal: AI increases speed and clarity while preserving trust, auditability, and reversibility.

We ship AI in *trust-safe layers*:

**Layer A (ship-first, low risk): “Explain”**
- AI only explains *existing* facts (Evergreen events/policies) and suggests next steps (non-mutating).
- No auto-actions. Staff explicitly chooses what to do.

**Layer B (draft-only, medium risk): “Draft”**
- AI produces drafts (notes, notices, explanations, suggested MARC edits), always reviewable and editable.
- Diffs show exactly what would change.

**Layer C (requires eval + governance): “Recommend + rank”**
- Semantic discovery and analytics narratives require stronger evaluation and privacy controls.

## AI technical implementation plan (concrete)

### 1) Add an AI service layer (server-side)
Create an internal API surface like:
- `POST /api/ai/explain-policy`
- `POST /api/ai/cataloging-suggestions`
- `POST /api/ai/search-rewrite`
- `POST /api/ai/notice-draft`

Rules:
- Server-side only (no direct browser → AI provider calls).
- Redaction on by default (PII minimized).
- All AI requests include a `requestId`, actor id, org id, workstation id.
- All AI outputs stored as drafts with provenance (model/provider/version + input hashes).

### 2) Provider abstraction
Implement `src/lib/ai/` with:
- Provider interface: `generateText()`, `generateJson()` (schema-validated)
- Adapters: `openai`, `anthropic` (choose one as default)
- Circuit breakers + rate limits + timeouts
- Per-tenant configuration: model + temperature + max tokens

### 3) Governance + audit storage
Store AI events (draft created/accepted/rejected) in a durable store:
- Short-term: Evergreen DB table under `library.stacksos_ai_events` (or a dedicated StacksOS DB when SaaS lands)
- Must include: actor, org, endpoint, model, prompt hash, redaction mode, acceptance outcome
- Never store raw patron PII unless explicitly configured and required for the feature

### 4) Replace current “AI UI” stubs
Current UI components contain placeholder/demo answers (not acceptable for pilots):
- `src/components/ai/policy-explainer.tsx`
- `src/components/ai/cataloging-copilot.tsx`

Plan:
- Put them behind `featureFlags.ai` immediately.
- Replace hardcoded responses with calls to `/api/ai/*` endpoints.
- Enforce “draft-only” semantics and show provenance + “why” + safe fallback when provider disabled.

### 5) Evaluation harness (before we call it “perfect”)
Add:
- Golden test cases for policy explanations (no hallucinations; no invented numbers)
- Cataloging suggestion review metrics (accept/reject rate)
- Redaction correctness tests
- “AI off” mode must leave the product fully usable

## Definition of Done (quality gates)

Before claiming “world-class” for any feature:
- No dead UI, no fake saves, no “demo tables”
- Playwright smoke flows for the feature
- Audit log entries for sensitive actions
- Performance: scan-first workflows remain fast
- Feature flag exists for risky integrations (AI, external metadata sources)
