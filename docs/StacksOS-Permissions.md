# StacksOS Permissions (Evergreen RBAC Map)

Last updated: 2026-01-25

StacksOS enforces defense-in-depth RBAC:
- Evergreen remains the source of truth for staff permissions.
- StacksOS additionally checks required Evergreen work permissions for write/mutation endpoints via `requirePermissions([...])`.
- Pilot mode should run with `STACKSOS_RBAC_MODE=strict`.

This document maps StacksOS workflows to the Evergreen permission codes StacksOS expects.

Notes
- Read-only endpoints often require only a valid Evergreen session (auth token).
- Mutation endpoints are always permission-gated.
- Some "override" operations are ultimately enforced by Evergreen. StacksOS will attempt the override call and surface Evergreen denial if the staff user lacks override privileges.

---

## Quick Reference (Workflow -> Permissions)

| Area | Workflow | Endpoint | Method | Required Evergreen work permissions |
| --- | --- | --- | --- | --- |
| Auth | Login | `/api/evergreen/auth` | POST | (none; Evergreen auth) |
| Auth | Logout | `/api/evergreen/auth` | DELETE | (requires session cookie) |
| Workstations | Register workstation | `/api/evergreen/workstations` | POST | `REGISTER_WORKSTATION` (at org) |
| Circulation | Checkout | `/api/evergreen/circulation` (action=`checkout`) | POST | `COPY_CHECKOUT` |
| Circulation | Checkout override | `/api/evergreen/circulation` (action=`checkout`, override=true) | POST | `COPY_CHECKOUT` (Evergreen may require additional override privileges) |
| Circulation | Checkin | `/api/evergreen/circulation` (action=`checkin`) | POST | `COPY_CHECKIN` |
| Circulation | Renew | `/api/evergreen/circulation` (action=`renew`) | POST | `RENEW_CIRC` |
| Circulation | In-house use | `/api/evergreen/circulation` (action=`in_house_use`) | POST | `CREATE_IN_HOUSE_USE` |
| Holds | Place title hold | `/api/evergreen/holds` (action=`place_hold`) | POST | `TITLE_HOLDS` |
| Holds | Place copy hold | `/api/evergreen/holds` (action=`place_hold`, holdType=C) | POST | `COPY_HOLDS` |
| Holds | Cancel hold | `/api/evergreen/holds` (action=`cancel_hold`) | POST | `CANCEL_HOLDS` |
| Holds | Freeze/thaw/change pickup/reset/clear shelf/etc. | `/api/evergreen/holds` | POST | `UPDATE_HOLD` |
| Money | Pay bills | `/api/evergreen/circulation` (action=`pay_bills`) | POST | `CREATE_PAYMENT` |
| Money | Refund | `/api/evergreen/circulation` (action=`process_refund`) | POST | `PROCESS_REFUND` |
| Lost/Missing/Damaged | Mark lost | `/api/evergreen/lost` (action=`mark_lost`) | POST | `MARK_ITEM_LOST` |
| Lost/Missing/Damaged | Mark missing | `/api/evergreen/lost` (action=`mark_missing`) | POST | `MARK_ITEM_MISSING` |
| Lost/Missing/Damaged | Mark damaged | `/api/evergreen/lost` (action=`mark_damaged`) | POST | `MARK_ITEM_DAMAGED` |
| Lost/Missing/Damaged | Check in lost | `/api/evergreen/lost` (action=`checkin_lost`) | POST | `COPY_CHECKIN` |
| Lost/Missing/Damaged | Void billing | `/api/evergreen/lost` (action=`void_bill`) | POST | `VOID_BILLING` |
| Lost/Missing/Damaged | Adjust billing | `/api/evergreen/lost` (action=`adjust_bill`) | POST | `ADJUST_BILLING` |
| Claims | Claims returned | `/api/evergreen/claims` (action=`claims_returned`) | POST | `MARK_ITEM_CLAIMS_RETURNED` |
| Claims | Claims never checked out | `/api/evergreen/claims` (action=`claims_never_checked_out`) | POST | `MARK_ITEM_CLAIMS_NEVER` |
| Claims | Resolve claim | `/api/evergreen/claims` (action=`resolve_claim`) | POST | `COPY_CHECKIN` |
| Patrons | Search/view | `/api/evergreen/patrons` | GET | `VIEW_USER` |
| Patrons | Create patron | `/api/evergreen/patrons` | POST | `UPDATE_USER` |
| MARC | Create MARC record | `/api/evergreen/marc` | POST | `CREATE_MARC` |
| MARC | Update MARC record | `/api/evergreen/marc` | PATCH | `UPDATE_MARC` |
| Acquisitions | Create purchase order | `/api/evergreen/acquisitions` | POST | `CREATE_PURCHASE_ORDER` |
| Booking | Admin booking reservations | `/api/evergreen/booking` | POST | `ADMIN_BOOKING_RESERVATION` |
| Serials | Receive serial | `/api/evergreen/serials` | POST | `RECEIVE_SERIAL` |
| Offline | Upload offline checkout/checkin/renewal/in-house | `/api/evergreen/offline` | POST | Same perms as online actions |

---

## Recommended Pilot Roles (Starting Point)

These are suggested *starting* permission bundles for a pilot; adjust to your org policies.

### Circulation Staff
Minimum:
- `STAFF_LOGIN`
- `COPY_CHECKOUT`
- `COPY_CHECKIN`
- `RENEW_CIRC`
- `TITLE_HOLDS`
- `CANCEL_HOLDS`
- `UPDATE_HOLD`
- `CREATE_PAYMENT`
- `PROCESS_REFUND`

Optional (if you want staff to handle exceptions):
- `MARK_ITEM_LOST`
- `MARK_ITEM_MISSING`
- `MARK_ITEM_DAMAGED`
- `MARK_ITEM_CLAIMS_RETURNED`
- `MARK_ITEM_CLAIMS_NEVER`
- `VOID_BILLING`
- `ADJUST_BILLING`

### Cataloging Staff
Minimum:
- `STAFF_LOGIN`
- `CREATE_MARC`
- `UPDATE_MARC`

Optional:
- patron viewing/editing if needed: `VIEW_USER`, `UPDATE_USER`

### Local Admin / Pilot Admin
Includes above plus:
- `REGISTER_WORKSTATION`
- Evergreen admin permissions as needed for configuration (org units, settings, policies)

---

## Where to grant permissions

Use the Evergreen staff client admin tools to grant work permissions to staff users.
Exact navigation can vary by Evergreen version, but typically:
- Administration -> Local Administration -> Staff Administration / Permissions

If StacksOS returns a 403 "Permission denied", the UI/API response should include:
- `missing`: the Evergreen permissions the user lacks
- `requestId`: for correlating in audit logs
