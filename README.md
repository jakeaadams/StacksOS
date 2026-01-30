# StacksOS

StacksOS is a modern, AI-first library ILS staff platform built on Evergreen.
This repository hosts the staff UX and API gateway that translate staff actions
into Evergreen OpenSRF calls.

## Quick start

```bash
npm install
npm run dev
```

Open http://localhost:3000

## Environment

Create `.env.local`:

```
EVERGREEN_BASE_URL=https://<evergreen-host>
# If Evergreen uses a self-signed certificate, prefer adding the cert to the
# Node trust store instead of disabling verification globally:
# NODE_EXTRA_CA_CERTS=/path/to/evergreen-ca.crt
#
# Avoid in production:
# NODE_TLS_REJECT_UNAUTHORIZED=0
```

## Core paths

- Staff app: `src/app/staff`
- Evergreen API routes: `src/app/api/evergreen`
- Shared UI system: `src/components/shared`
- Shared hooks: `src/hooks`

## Notes

StacksOS is intended to run as a web UI + API gateway. Evergreen remains the
system of record (patrons/items/circulation/policies). StacksOS provides the
world-class staff experience, workflow automation, and analytics layer.
