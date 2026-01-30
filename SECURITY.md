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

Last Updated: January 29, 2026
