# Evergreen legacy UI → StacksOS migration (pilot playbook)

This playbook applies when Evergreen stays the ILS engine and StacksOS replaces the legacy staff client.

## 1) Environment prep
- Confirm OpenSRF gateway URL (`EVERGREEN_BASE_URL`) is stable.
- Confirm staff group permissions in Evergreen are realistic (Admins vs Clerks).
- Confirm workstation registration policy (auto-register vs fixed workstations).

## 2) Workflow validation in StacksOS
- Checkout/checkin/holds/bills.
- Patron edit/blocks/notes.
- Cataloging (MARC editor + Z39.50 import + item status).
- Acq/serials modules show real data or “setup required”.

## 3) Operational readiness
- Run `./audit/run_all.sh` in mutate mode.
- Configure backups + retention.
- Define support escalation path and status page usage.

