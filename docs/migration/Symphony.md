# Symphony → Evergreen/StacksOS migration (pilot playbook)

## 1) Define what “parity” means for the pilot
- Decide what does *not* need to migrate (old circ history, legacy lists).
- Confirm required reports and exports.

## 2) Export
- MARC bibs + holdings.
- Patrons and item barcodes.
- Fines/bills if required.

## 3) Import into Evergreen
- MARC import with preview and overlay rules.
- Copy import; verify circ modifiers and statuses.
- Patron import; verify barcode strategy and permissions.

## 4) Validate top workflows
- Checkout/checkin/holds/bills in StacksOS.
- Claims/lost workflows.

