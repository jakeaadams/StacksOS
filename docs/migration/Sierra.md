# Sierra → Evergreen/StacksOS migration (pilot playbook)

## 1) Inventory critical mappings
- Item types → circ modifiers
- Locations → org units / shelving locations
- Patron types → permission groups / profiles

## 2) Data extraction
- Export MARC bibs and holdings.
- Export patrons with barcodes and contact fields.
- Export open transactions (checkouts/holds) if in scope.

## 3) Evergreen import and validation
- Import bibs first; validate search and holdings display in StacksOS.
- Import copies; validate barcode uniqueness and status.
- Import patrons; validate login and circulation eligibility.

## 4) Operational checks
- Workstation registration for each branch/device.
- Receipts and notices (email/SMS dry-run first).
- Backup + restore drill.

