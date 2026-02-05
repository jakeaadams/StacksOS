# Tenants (local-first pilots)

StacksOS is designed to support multi-tenancy (one Evergreen per tenant), but pilots can run **single-tenant** with env vars.

## Tenant config file

For local-first pilots, a tenant is represented by a single validated JSON file:

- `tenants/<tenantId>.json`

Schema (enforced by Zod at runtime):
- `src/lib/tenant/schema.ts`

Minimal example:

```json
{
  "tenantId": "default",
  "displayName": "My Library",
  "region": "us-east",
  "evergreenBaseUrl": "https://evergreen.example.org",
  "branding": { "primaryColor": "#0f172a" },
  "security": { "ipAllowlist": ["192.168.1.0/24"], "idleTimeoutMinutes": 30 },
  "ai": { "enabled": false }
}
```

## Secrets

Do not put secrets in `tenants/*.json`.

Secrets stay in env vars (examples):
- `EVERGREEN_DB_PASSWORD`
- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `STACKSOS_MFA_MASTER_KEY`

