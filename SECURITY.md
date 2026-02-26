# Security Configuration Guide

## CRITICAL: Do Not Disable TLS Verification

**Risk Level:** CRITICAL

Disabling TLS verification (e.g. `NODE_TLS_REJECT_UNAUTHORIZED=0`) enables man-in-the-middle (MITM) attacks.

### Recommended Fixes

**Option 1 (Best): Install a valid TLS certificate on Evergreen**

- Use a publicly trusted cert (if Evergreen has a real DNS name), or an internal CA.
- Then ensure `EVERGREEN_BASE_URL=https://...` and remove any TLS bypasses.

**Option 2 (Acceptable for internal CA / self-signed): Trust the cert properly**

- Export Evergreen’s CA/cert to a PEM/CRT file.
- Set `NODE_EXTRA_CA_CERTS=/path/to/evergreen-ca.crt` in the StacksOS runtime environment.
- Remove `NODE_TLS_REJECT_UNAUTHORIZED=0`.

### Security Improvements Completed

- Password Hashing: Upgraded from MD5 to bcrypt+MD5
- CSRF Protection: Implemented cryptographic token validation
- File Upload Security: Authentication and validation enforced
- Audit Logging: Comprehensive security event logging
- Session security: Device/session list + revocation, idle timeout (`STACKSOS_IDLE_TIMEOUT_MINUTES`)
- Network hardening: Optional IP allowlist (`STACKSOS_IP_ALLOWLIST`)

## MFA (strategy)

StacksOS uses Evergreen credentials for staff auth, but MFA can be layered at the StacksOS boundary:

- **TOTP (recommended):** per-staff secret stored encrypted at rest in a StacksOS-owned store (pilot: `library.*` schema). Enforce MFA at the StacksOS session layer, not by modifying Evergreen auth.
- **SSO (future):** OIDC/SAML front-door for staff, with Evergreen session issued server-side.

Operational guidance:

- Start with MFA optional per tenant, then make it mandatory for admins.
- Never log OTP codes or MFA secrets.
- Ensure break-glass procedure exists (two admin users, offline doc, audited disable flow).

Last Updated: February 5, 2026

---

## Database least privilege (recommended)

StacksOS stores product data in PostgreSQL schema `library.*` and reads limited fields from Evergreen core tables
(example: `actor.usr.usrname`, `actor.usr.photo_url`).

Do **not** run StacksOS with the Evergreen database owner role. Create a dedicated role (example: `stacksos_app`) with
only the minimum privileges required.

Example (run on the Evergreen host as `postgres`):

```sql
-- Create (or rotate) a dedicated StacksOS DB user.
CREATE ROLE stacksos_app LOGIN PASSWORD 'REDACTED_LONG_RANDOM_PASSWORD';

-- Allow connecting to the Evergreen DB.
GRANT CONNECT ON DATABASE evergreen TO stacksos_app;

-- Allow StacksOS to create/read/write its own tables in library.*.
GRANT USAGE, CREATE ON SCHEMA library TO stacksos_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA library TO stacksos_app;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA library TO stacksos_app;

-- Ensure future library.* tables created by the Evergreen DB owner remain accessible.
ALTER DEFAULT PRIVILEGES FOR ROLE evergreen IN SCHEMA library
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO stacksos_app;
ALTER DEFAULT PRIVILEGES FOR ROLE evergreen IN SCHEMA library
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO stacksos_app;

-- Minimal read access needed for select features (avoid granting blanket table privileges).
GRANT SELECT (id, usrname, photo_url) ON actor.usr TO stacksos_app;

-- Optional only if STACKSOS_SYNC_PATRON_PHOTO_TO_EVERGREEN=1.
-- Keep this disabled by default to minimize Evergreen core-table writes.
-- GRANT UPDATE (photo_url) ON actor.usr TO stacksos_app;
```

Then set:

- `EVERGREEN_DB_USER=stacksos_app`
- `EVERGREEN_DB_PASSWORD=...`

Optional (recommended): restrict `pg_hba.conf` so TCP connections from `127.0.0.1` are limited to the specific
database/user pairs StacksOS and Evergreen need.

---

## SSH tunnel hardening (if used)

If you run a persistent SSH tunnel from StacksOS → Evergreen (example: local port `127.0.0.1:5433` forwarding to
Evergreen PostgreSQL), restrict the tunnel key on the Evergreen side.

Recommended `authorized_keys` options for the tunnel key:

- `permitopen="127.0.0.1:5432"` (only allow forwarding to PostgreSQL on localhost)
- `no-pty`, `no-agent-forwarding`, `no-X11-forwarding`
- optional: a forced command that does not grant shell access (for port-forward-only keys)
