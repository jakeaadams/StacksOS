# StacksOS Repo Inventory (Static)

Generated: 2026-01-27T01:44:40.164143Z

## Sidebar Route Coverage

- Sidebar routes found: 43
- Staff pages found: 50

- Sidebar links: OK (every sidebar href has a page.tsx)

## Staff Pages Not Linked In Sidebar

Note: some unlinked pages are expected (detail pages), but they should be intentional.

- `/staff/acquisitions`
- `/staff/catalog/record/[id]`
- `/staff/cataloging`
- `/staff/circulation`
- `/staff/help`
- `/staff/patrons/[id]`
- `/staff/reports/builder`

## Pages With No Adapter API Usage

These pages do not reference `/api/evergreen/*` at all. They are likely static or incomplete.

- `/staff/circulation/offline` (`src/app/staff/circulation/offline/page.tsx`)
- `/staff/circulation` (`src/app/staff/circulation/page.tsx`)
- `/staff/help` (`src/app/staff/help/page.tsx`)

## Adapter Module Usage

- Adapter modules found: 23
- Adapter modules referenced by staff pages: 18

### Adapter modules with zero staff page references

These may still be used indirectly, but should be reviewed.

- `auth`
- `offline`
- `org-tree`
- `orgs`
- `user-settings`

## TODO/FIXME Markers

- None

