# EDI / EDIFACT in StacksOS (design + operations)

StacksOS uses Evergreen’s acquisitions engine as the system of record. EDI is exposed through Evergreen’s EDI tables and the OpenSRF `open-ils.acq` services.

## Goals
- Staff can configure EDI accounts and inspect message flow in StacksOS.
- EDI failures are visible and actionable (retry where supported).
- No secrets are committed; credentials live in env/secrets stores.

## Current implementation (StacksOS)
- Staff UI: `/staff/acquisitions/edi`
- API: `/api/evergreen/acquisitions/edi`
  - list accounts + messages
  - create/update/delete account
  - send orders and process inbound
  - retry failed messages

## EDIFACT plan (doc-first)
1. **Connector layer** (provider-agnostic)
   - Transport: FTP/SFTP/HTTP (depending on vendor)
   - Auth: username/password (short-term), key-based (long-term)
2. **Message lifecycle**
   - outbound purchase order (ORDERS/850)
   - inbound acknowledgments (ORDRSP/855)
   - dispatch advice (DESADV/856)
   - invoices (INVOIC/810)
3. **Safety**
   - do not auto-apply invoice changes without human confirmation
   - log every outbound/inbound message id and processing status
4. **Testing**
   - contract tests for message types and status transitions
   - sandbox vendor accounts for pilot tenants

## Operational notes
- If using the webhook/SaaS deployment model, isolate vendor transport endpoints (VPN/VPC).
- Enable retries for transient failures; surface permanent failures to staff via the EDI message list.

