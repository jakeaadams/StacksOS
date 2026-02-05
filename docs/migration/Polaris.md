# Polaris → Evergreen/StacksOS migration (pilot playbook)

## 1) Scope and freeze plan
- Define migration scope: patrons, items, bibs, holds, fines, staff accounts, org structure, policies.
- Establish a cutover window and “data freeze” checkpoint.
- Capture RPO/RTO targets for the pilot.

## 2) Data export
- Export bibliographic records (MARC) + item records + patron records.
- Export authority data if you rely on it for cataloging.
- Export transaction history only if required by policy (keep minimal for pilots).

## 3) Evergreen import
- Import org unit structure and locations first.
- Import MARC bibs with overlay/dedupe rules defined (use StacksOS MARC import preview).
- Import items/copies; validate barcodes and statuses.
- Import patrons; verify barcode strategy in `STACKSOS_PATRON_BARCODE_MODE`.

## 4) Policy validation (pre-pilot)
- Validate circ rules match expected outcomes using:
  - StacksOS “Policy Inspector”
  - real checkout/checkin in the sandbox
- Validate holds shelf logic and notice behavior.

## 5) Pilot rehearsal checklist
- Run `./audit/run_all.sh` in mutate mode on the pilot tenant.
- Validate staff roles and workstations.
- Run a restore drill (Evergreen + StacksOS backups).

