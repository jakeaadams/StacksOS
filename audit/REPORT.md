# StacksOS Audit Report

Generated: 2026-01-27T01:44:40.193885Z

## API Status

- Total endpoints checked: 45
- OK (HTTP 200): 45
- Non-200: 0
- ok=false responses: 0

## Configuration/Empty-Data Signals

- workstations_list: workstations is empty
- catalog_holdings: summary is empty
- circ_patron_holds: holds is empty
- circ_patron_bills: bills is empty
- holds_patron: holds is empty
- holds_shelf: holds is empty
- holds_expired: holds is empty
- holds_pull_list: pullList is empty
- holds_title: holds is empty
- lost_patron: lostItems is empty
- lost_patron: lostBills is empty
- offline_policies: maxFines is empty
- offline_blocks: blocks is empty
- acq_orders: orders is empty
- acq_invoices: invoices is empty
- serials_subscriptions: Serials subscriptions listing is not configured yet. Create subscriptions in Evergreen.
- serials_subscriptions: subscriptions is empty
- serials_routing: routing is empty
- booking_resources: No bookable resources found
- booking_resources: resources is empty
- booking_types: No resource types configured
- booking_types: types is empty
- booking_reservations: reservations is empty
- authority_search: Authority search is not configured yet
- authority_search: authorities is empty

## Audit Coverage

### Adapter modules not exercised by API audit

- `buckets`
- `marc`
- `org-tree`
- `settings`
- `user-settings`
- `z3950`

- Sidebar link -> page.tsx coverage: OK

## OpenSRF Services in Use

- open-ils.acq
- open-ils.actor
- open-ils.auth
- open-ils.booking
- open-ils.cat
- open-ils.circ
- open-ils.cstore
- open-ils.pcrud
- open-ils.search
- open-ils.serial
- open-ils.supercat

## Artifacts

- Summary TSV: `/home/jake/projects/stacksos/audit/api/summary.tsv`
- Raw responses: `/home/jake/projects/stacksos/audit/api`
- Feature Matrix: `/home/jake/projects/stacksos/audit/FEATURE_MATRIX.md`
- Repo Inventory: `/home/jake/projects/stacksos/audit/REPO_INVENTORY.md`
