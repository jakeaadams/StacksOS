# StacksOS Feature -> API Matrix

Generated: 2026-01-27T01:44:40.190441Z

## API Routes (adapter modules)

- acquisitions
- auth
- authority
- booking
- buckets
- catalog
- circulation
- claims
- holds
- items
- lost
- marc
- offline
- org-tree
- orgs
- patrons
- ping
- reports
- serials
- settings
- user-settings
- workstations
- z3950

## Staff Pages

| Route | Page | API usage |
| --- | --- | --- |
| `/staff/acquisitions/invoices` | `src/app/staff/acquisitions/invoices/page.tsx` | acquisitions |
| `/staff/acquisitions/orders` | `src/app/staff/acquisitions/orders/page.tsx` | acquisitions |
| `/staff/acquisitions` | `src/app/staff/acquisitions/page.tsx` | acquisitions |
| `/staff/acquisitions/receiving` | `src/app/staff/acquisitions/receiving/page.tsx` | acquisitions |
| `/staff/acquisitions/selection` | `src/app/staff/acquisitions/selection/page.tsx` | acquisitions |
| `/staff/acquisitions/vendors` | `src/app/staff/acquisitions/vendors/page.tsx` | acquisitions |
| `/staff/admin` | `src/app/staff/admin/page.tsx` | ping, workstations |
| `/staff/admin/policy-inspector` | `src/app/staff/admin/policy-inspector/page.tsx` | settings |
| `/staff/admin/server` | `src/app/staff/admin/server/page.tsx` | ping |
| `/staff/admin/users` | `src/app/staff/admin/users/page.tsx` | patrons |
| `/staff/admin/workstations` | `src/app/staff/admin/workstations/page.tsx` | workstations |
| `/staff/booking` | `src/app/staff/booking/page.tsx` | booking |
| `/staff/catalog/batch` | `src/app/staff/catalog/batch/page.tsx` | catalog |
| `/staff/catalog/buckets` | `src/app/staff/catalog/buckets/page.tsx` | buckets |
| `/staff/catalog/create` | `src/app/staff/catalog/create/page.tsx` | catalog |
| `/staff/catalog/item-status` | `src/app/staff/catalog/item-status/page.tsx` | items |
| `/staff/catalog` | `src/app/staff/catalog/page.tsx` | catalog |
| `/staff/catalog/record/[id]` | `src/app/staff/catalog/record/[id]/page.tsx` | catalog |
| `/staff/cataloging/authority` | `src/app/staff/cataloging/authority/page.tsx` | authority |
| `/staff/cataloging/holdings` | `src/app/staff/cataloging/holdings/page.tsx` | catalog |
| `/staff/cataloging/import` | `src/app/staff/cataloging/import/page.tsx` | catalog, marc, ping |
| `/staff/cataloging/marc-editor` | `src/app/staff/cataloging/marc-editor/page.tsx` | catalog, marc |
| `/staff/cataloging` | `src/app/staff/cataloging/page.tsx` | catalog |
| `/staff/cataloging/z3950` | `src/app/staff/cataloging/z3950/page.tsx` | marc, ping, z3950 |
| `/staff/circulation/bills` | `src/app/staff/circulation/bills/page.tsx` | circulation, patrons |
| `/staff/circulation/checkin` | `src/app/staff/circulation/checkin/page.tsx` | circulation |
| `/staff/circulation/checkout` | `src/app/staff/circulation/checkout/page.tsx` | circulation |
| `/staff/circulation/claims` | `src/app/staff/circulation/claims/page.tsx` | circulation, claims, patrons |
| `/staff/circulation/holds-management` | `src/app/staff/circulation/holds-management/page.tsx` | holds, patrons |
| `/staff/circulation/in-house` | `src/app/staff/circulation/in-house/page.tsx` | circulation |
| `/staff/circulation/lost` | `src/app/staff/circulation/lost/page.tsx` | lost, patrons |
| `/staff/circulation/offline` | `src/app/staff/circulation/offline/page.tsx` | - |
| `/staff/circulation` | `src/app/staff/circulation/page.tsx` | - |
| `/staff/circulation/renew` | `src/app/staff/circulation/renew/page.tsx` | circulation |
| `/staff/help` | `src/app/staff/help/page.tsx` | - |
| `/staff/ill` | `src/app/staff/ill/page.tsx` | ping |
| `/staff` | `src/app/staff/page.tsx` | reports |
| `/staff/patrons/[id]` | `src/app/staff/patrons/[id]/page.tsx` | circulation, patrons |
| `/staff/patrons/alerts` | `src/app/staff/patrons/alerts/page.tsx` | patrons |
| `/staff/patrons/groups` | `src/app/staff/patrons/groups/page.tsx` | patrons |
| `/staff/patrons` | `src/app/staff/patrons/page.tsx` | patrons |
| `/staff/patrons/register` | `src/app/staff/patrons/register/page.tsx` | patrons |
| `/staff/reports/builder` | `src/app/staff/reports/builder/page.tsx` | reports |
| `/staff/reports/my-reports` | `src/app/staff/reports/my-reports/page.tsx` | reports |
| `/staff/reports` | `src/app/staff/reports/page.tsx` | reports |
| `/staff/reports/scheduled` | `src/app/staff/reports/scheduled/page.tsx` | reports |
| `/staff/reports/templates` | `src/app/staff/reports/templates/page.tsx` | reports |
| `/staff/serials` | `src/app/staff/serials/page.tsx` | serials |
| `/staff/serials/routing` | `src/app/staff/serials/routing/page.tsx` | serials |
| `/staff/serials/subscriptions` | `src/app/staff/serials/subscriptions/page.tsx` | serials |

## Unconnected Pages

- `/staff/circulation/offline` (`src/app/staff/circulation/offline/page.tsx`)
- `/staff/circulation` (`src/app/staff/circulation/page.tsx`)
- `/staff/help` (`src/app/staff/help/page.tsx`)

## Unused Adapter Modules

- `auth`
- `offline`
- `org-tree`
- `orgs`
- `user-settings`
