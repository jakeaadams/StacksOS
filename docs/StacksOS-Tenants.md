# Tenants and Profiles

StacksOS supports tenant configuration files and profile presets.

- tenants/<tenantId>.json
- Schema: src/lib/tenant/schema.ts
- Profile defaults: src/lib/tenant/profiles.ts

## Profiles

Supported profile types:

- public - discovery/events/digital defaults for public libraries
- school - K-12 friendly defaults (class workflows + reserves)
- church - lightweight branch/event workflows
- academic - broader discovery scope + reserves/research defaults
- custom - no profile defaults beyond platform baseline

Profile defaults are merged with tenant overrides at runtime.
Tenant-provided values always win.

## Tenant file example

{
"tenantId": "default",
"displayName": "My Library",
"profile": { "type": "public" },
"region": "us-east",
"evergreenBaseUrl": "https://evergreen.example.org",
"branding": { "primaryColor": "#0f172a" },
"featureFlags": {
"opacEvents": true,
"k12ClassCirculation": false
},
"security": {
"ipAllowlist": ["192.168.1.0/24"],
"idleTimeoutMinutes": 30,
"mfa": { "required": false, "issuer": "StacksOS" }
},
"ai": {
"enabled": false,
"maxTokens": 1024,
"temperature": 0.2,
"safetyMode": "balanced",
"budgets": { "maxCallsPerHour": 2000, "maxUsdPerDay": 0 }
},
"discovery": {
"defaultSearchScope": "local",
"defaultCopyDepth": 1,
"allowPatronScopeOverride": true
},
"integrations": {}
}

## Provisioning

CLI provisioning:

cd /home/jake/projects/stacksos
npm run tenant:provision -- \
 --tenant-id north-district \
 --display-name "North District Library" \
 --profile public \
 --evergreen-base-url https://evergreen.north.example.org \
 --default-search-scope local \
 --default-copy-depth 1 \
 --dry-run

For self-signed Evergreen TLS during probes:

npm run tenant:provision -- \
 --tenant-id north-district \
 --display-name "North District Library" \
 --profile public \
 --evergreen-base-url https://192.168.1.232 \
 --ca-file /usr/local/share/ca-certificates/evergreen-192.168.1.232.crt

Admin UI:

- Staff URL: /staff/admin/tenants
- Features:
  - create/update tenant configs
  - profile selection
  - Evergreen connectivity validation
  - onboarding readiness checks

## Active tenant selection

Current runtime selection is environment-driven:

- STACKSOS_TENANT_ID=<tenantId>

After changing active tenant, restart the app service:

sudo systemctl restart stacksos.service

## Secrets

Do not put secrets in tenants/\*.json.

Secrets stay in env vars (examples):

- EVERGREEN_DB_PASSWORD
- OPENAI_API_KEY
- ANTHROPIC_API_KEY
- MOONSHOT_API_KEY
- STACKSOS_MFA_MASTER_KEY

Recommended AI defaults for Kimi operations assistant:

- STACKSOS_AI_PROVIDER=moonshot
- STACKSOS_AI_MODEL=moonshotai/kimi-k2.5

## Evergreen deployment model choices (important)

Use this rule first:

- If a new library will share one Evergreen database and OU tree with existing members, add a new Evergreen Organizational Unit (OU) and onboard a new StacksOS tenant pointing at the same Evergreen base URL.
- If a new library needs legal/data isolation, independent release timing, or independent policy governance, deploy a separate Evergreen instance (separate DB/OpenSRF stack) and point a dedicated StacksOS tenant to that new base URL.

Why this matters:

- Evergreen docs explicitly support multi-library/consortial hierarchies in one installation via OUs.
- Evergreen docs also require post-OU-change regeneration (`autogen.sh`) to avoid inconsistent behavior.

## Scenario A: Add another library under the same umbrella (same Evergreen)

1. In Evergreen staff admin, create/edit OU types and OUs under the existing hierarchy.
2. Complete OU Main Settings, Hours, and Addresses tabs.
3. Run `autogen.sh` on Evergreen host as `opensrf` user after OU changes.
4. Ensure staff permissions/workstation behavior are correct for the new branch context.
5. In StacksOS, create a tenant JSON for that library (usually same `evergreenBaseUrl`, different `tenantId`, profile, branding).
6. Validate tenant connectivity:

   `npm run tenant:provision -- --tenant-id <id> --display-name "<name>" --profile <public|school|church|academic|custom> --evergreen-base-url <url> --dry-run`

7. Switch runtime tenant (`STACKSOS_TENANT_ID=<id>`) and restart StacksOS service.
8. Run onboarding check and smoke tests from `/staff/admin/tenants` and `npm run test:e2e:smoke`.

## Scenario B: Add a fully separate library (new Evergreen install)

1. Build a new Evergreen stack using current install docs (supported OS/OpenSRF/Postgres baselines).
2. Complete Evergreen initial setup (org, people, policies, settings, workstation/admin setup).
3. Validate new Evergreen endpoints:
   - `https://<new-evergreen>/eg2/`
   - `https://<new-evergreen>/osrf-gateway-v1`

4. Handle TLS trust on StacksOS host:
   - Sync/install cert via `scripts/sync-evergreen-cert.sh` (or your CA distribution pipeline).

5. Create a dedicated StacksOS tenant JSON for that installation using the new Evergreen URL.
6. Run tenant validate/onboarding checks and smoke E2E before go-live.
7. Keep tenant secrets in env vars, not in tenant JSON files.

## Profile strategy (public vs school vs church)

Current StacksOS supports profile defaults in one codebase (`public`, `school`, `church`, `academic`, `custom`).
That is the correct architecture for now.

Use one codebase + profile defaults when:

- backend workflows are largely shared;
- variation is mostly UX, feature flags, and policy defaults.

Split into separate products/repos only when:

- domain workflows diverge so far that shared abstractions become unstable;
- release cadences/compliance constraints materially differ.

Short recommendation:

- Keep one StacksOS platform with profile bundles as default strategy.
- Add profile-specific modules (for example, deeper K-12 class circulation) without forking the entire product.

## Optional: Cert Sync Automation

For production tenants using Evergreen over TLS, install the cert-sync timer on the StacksOS host:

```bash
cd /home/jake/projects/stacksos
bash scripts/install-cert-sync-timer.sh --host <evergreen-host> --port 443 --interval 6h
```

This reduces login outages caused by Evergreen certificate rotation.
