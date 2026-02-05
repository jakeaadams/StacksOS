# StacksOS Parity Matrix (Features x Vendors) — Research Only (Non-Canonical)

Date: 2026-02-05

Purpose:
- Track feature parity (and differentiation) against major ILS/LSP competitors.
- Be explicit about evidence quality so we do not bake incorrect assumptions into the roadmap.

Canonical source of truth:
- `docs/StacksOS-Execution-Backlog.md` is the canonical execution plan and may move faster than this matrix.
- If this matrix and the execution backlog conflict, treat the backlog as authoritative.
- For a repo-derived “what’s wired up”, see `audit/FEATURE_MATRIX.md` (generated via `./audit/run_all.sh`).

Status:
- This file is **not kept in lockstep** with implementation details and exists primarily for competitive research and
  roadmap framing.
- Treat the **StacksOS** column here as a best-effort snapshot, not a release checklist.

Vendors (columns):
- Alma (Ex Libris)
- Sierra (Innovative)
- Symphony (SirsiDynix)
- Polaris (Innovative)
- Koha
- Evergreen
- FOLIO
- Follett Destiny
- Surpass Cloud
- Alexandria

Legend:
- D = doc-verified (manual/help docs)
- M = marketing-verified
- I = inference (likely true, not yet verified by primary docs)
- - = not documented publicly / not applicable

Important: This matrix is intentionally conservative.
- If we do not have a primary doc source for a vendor/feature, we mark it I.
- We only mark D when we have a direct doc/manual reference.

StacksOS status:
- done = implemented end-to-end (real Evergreen state transitions)
- partial = implemented but missing edge cases / not fully hardened
- missing = not implemented (must be hidden or clearly marked)

Gap score (StacksOS):
- 0 = missing
- 1 = partial parity
- 2 = parity
- 3 = better-than-parity (differentiator)

---

## P0 Parity Matrix (pilot-ready scope)

### Auth / workstation / org context

| Feature ID | Feature | StacksOS | Gap | Alma | Sierra | Symphony | Polaris | Koha | Evergreen | FOLIO | Follett | Surpass | Alexandria |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| MOD-AUTH-001 | Staff login (username/password) | done | 2 | I | I | I | I | I | D | I | I | I | I |
| MOD-AUTH-002 | Workstation context / service location | done | 2 | I | I | D | D | I | D | I | I | I | I |
| MOD-AUTH-003 | Auto-register workstation per device+branch | done | 3 | - | - | - | - | - | I | - | - | - | - |
| SEC-RBAC-001 | RBAC enforced at API boundary (defense-in-depth) | done | 3 | I | I | I | D | I | I | I | I | I | I |
| OPS-AUDIT-001 | Append-only audit log for sensitive actions | done | 3 | I | I | I | I | I | I | I | I | I | I |

---

### Circulation

| Feature ID | Feature | StacksOS | Gap | Alma | Sierra | Symphony | Polaris | Koha | Evergreen | FOLIO | Follett | Surpass | Alexandria |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| MOD-CIRC-001 | Checkout (scan-first) | partial | 1 | D | I | I | D | D | D | D | D | D | D |
| MOD-CIRC-002 | Checkin (routing decisions) | partial | 1 | D | I | I | D | D | D | D | I | D | D |
| MOD-CIRC-003 | Renewals | partial | 1 | D | I | I | D | D | D | D | I | D | D |
| MOD-CIRC-004 | Holds management (patron + title) | partial | 1 | D | I | D | D | D | D | I | I | D | D |
| MOD-CIRC-005 | Holds shelf management | partial | 1 | D | I | I | D | I | D | I | I | I | D |
| MOD-CIRC-006 | Bills/fines view | done | 2 | D | I | I | I | I | D | I | I | D | D |
| MOD-CIRC-007 | Post payment | done | 2 | D | I | I | I | I | D | I | I | I | D |
| MOD-CIRC-007A | Refund payment | done | 2 | D | I | I | I | I | D | I | I | I | D |
| MOD-CIRC-007B | Printable receipts (payment/refund) | done | 3 | D | I | I | D | I | D | I | I | D | D |
| MOD-CIRC-008 | Claims returned / never had | partial | 1 | I | I | I | I | I | D | I | I | I | D |
| MOD-CIRC-009 | Lost/missing/damaged workflows | done | 1 | I | I | I | I | I | D | I | I | D | D |
| MOD-CIRC-010 | In-house use | partial | 1 | I | I | I | I | I | D | I | I | I | I |
| MOD-CIRC-011 | Offline circulation (store-and-forward) | partial | 1 | I | I | I | D | I | D | I | I | I | I |

---

### Patrons

| Feature ID | Feature | StacksOS | Gap | Alma | Sierra | Symphony | Polaris | Koha | Evergreen | FOLIO | Follett | Surpass | Alexandria |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| MOD-PAT-001 | Patron search (name/barcode/email/phone) | partial | 1 | D | I | I | I | D | D | I | I | D | I |
| MOD-PAT-002 | Patron record view | partial | 1 | D | I | I | I | D | D | I | I | D | I |
| MOD-PAT-003 | Patron registration | partial | 1 | D | I | I | I | D | D | I | I | I | I |
| MOD-PAT-004 | Patron groups/types | partial | 1 | I | I | I | I | I | D | I | I | I | I |
| MOD-PAT-005 | Notes/alerts | partial | 1 | I | I | I | I | I | D | I | I | I | I |
| MOD-PAT-006 | Blocks/penalties enforcement UX | partial | 1 | D | I | I | I | I | D | I | I | D | I |

---

### Cataloging / metadata

| Feature ID | Feature | StacksOS | Gap | Alma | Sierra | Symphony | Polaris | Koha | Evergreen | FOLIO | Follett | Surpass | Alexandria |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| MOD-CAT-001 | Catalog search | partial | 1 | I | I | I | I | I | D | I | I | I | I |
| MOD-CAT-002 | Item status by barcode | partial | 1 | I | I | I | I | I | D | I | I | I | I |
| MOD-CAT-003 | Holdings view | partial | 1 | I | I | I | I | I | D | I | I | I | I |
| MOD-CAT-004 | MARC editor (load/save) | done | 2 | I | I | I | I | I | D | I | I | I | I |
| MOD-CAT-005 | Z39.50 search/import | partial | 1 | I | I | I | I | I | I | I | I | I | I |
| MOD-CAT-006 | MARC import (single record) | partial | 1 | I | I | I | I | I | I | I | I | I | I |
| MOD-CAT-007 | Authority search | partial | 1 | I | I | I | I | I | I | I | I | I | I |

---

### Acquisitions

| Feature ID | Feature | StacksOS | Gap | Alma | Sierra | Symphony | Polaris | Koha | Evergreen | FOLIO | Follett | Surpass | Alexandria |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| MOD-ACQ-001 | Vendors | partial | 1 | D | D | D | D | D | D | D | - | - | - |
| MOD-ACQ-002 | Funds/ledgers | partial | 1 | D | D | D | D | D | D | D | - | - | - |
| MOD-ACQ-003 | Purchase orders | partial | 1 | D | D | D | D | D | D | D | - | - | - |
| MOD-ACQ-004 | Receiving | partial | 1 | D | D | D | D | D | D | D | - | - | - |
| MOD-ACQ-005 | Invoices | partial | 1 | D | D | D | D | D | D | D | - | - | - |

---

### Serials

| Feature ID | Feature | StacksOS | Gap | Alma | Sierra | Symphony | Polaris | Koha | Evergreen | FOLIO | Follett | Surpass | Alexandria |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| MOD-SER-001 | Subscriptions | partial | 1 | D | D | D | D | D | D | I | - | - | - |
| MOD-SER-002 | Routing lists | partial | 1 | D | D | D | D | D | D | I | - | - | - |
| MOD-SER-003 | Claims workflow | partial | 1 | D | D | D | D | D | D | I | - | - | - |

---

### Reporting

| Feature ID | Feature | StacksOS | Gap | Alma | Sierra | Symphony | Polaris | Koha | Evergreen | FOLIO | Follett | Surpass | Alexandria |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| MOD-RPT-001 | Role dashboards | partial | 1 | I | I | I | D | I | I | I | I | I | I |
| MOD-RPT-002 | CSV export | partial | 1 | I | I | I | D | I | I | I | I | I | I |
| MOD-RPT-003 | Scheduled reports | done | 2 | I | I | I | I | I | I | I | I | I | I |

---



---

## P1 Parity Matrix (competitive parity + SaaS experience)

P1 expands StacksOS from a pilot-ready staff client into a true SaaS experience:
- identity (SSO/MFA)
- notifications
- device/integration ecosystem
- admin/policy center
- OPAC/patron experience
- multi-tenant operations (control plane)

### Identity, access, and security

| Feature ID | Feature | StacksOS | Gap | Alma | Sierra | Symphony | Polaris | Koha | Evergreen | FOLIO | Follett | Surpass | Alexandria |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| SEC-SSO-001 | Staff SSO (SAML/OIDC) | missing | 0 | I | I | I | I | I | I | I | I | I | I |
| SEC-MFA-001 | Staff MFA | missing | 0 | I | I | I | I | I | D | I | I | I | I |
| SEC-SESSION-001 | Session controls (idle timeout, device revocation) | partial | 1 | I | I | I | I | I | I | I | I | I | I |
| SEC-IP-001 | IP allowlists + geo controls | partial | 1 | I | I | I | I | I | I | I | I | I | I |
| SEC-AUDIT-010 | Tamper-evident audit export | missing | 0 | I | I | I | I | I | I | I | I | I | I |
| SEC-RBAC-010 | Break-glass workflow (time-bound elevation + reason) | missing | 0 | I | I | I | I | I | I | I | I | I | I |

### Communications + notifications

| Feature ID | Feature | StacksOS | Gap | Alma | Sierra | Symphony | Polaris | Koha | Evergreen | FOLIO | Follett | Surpass | Alexandria |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| MOD-NOTICE-001 | Email notices (templated) | missing | 0 | I | I | I | I | I | D | I | I | I | I |
| MOD-NOTICE-002 | SMS notices (templated) | missing | 0 | I | I | I | I | I | I | I | I | I | I |
| MOD-NOTICE-003 | Patron notification preferences center | missing | 0 | I | I | I | I | I | I | I | I | I | I |
| MOD-NOTICE-010 | Print notices batch queue | missing | 0 | I | I | I | I | I | I | I | I | I | I |

### Devices + interoperability (self-check, RFID, resource sharing)

| Feature ID | Feature | StacksOS | Gap | Alma | Sierra | Symphony | Polaris | Koha | Evergreen | FOLIO | Follett | Surpass | Alexandria |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| INT-SIP2-001 | SIP2 support (self-check/RFID ecosystem) | missing | 0 | I | I | I | I | D | D | D | I | I | I |
| INT-NCIP-001 | NCIP support (resource sharing interoperability) | missing | 0 | D | I | I | I | I | I | D | I | I | I |
| INT-RFID-001 | RFID encode/export support | missing | 0 | I | I | I | I | I | I | I | I | I | I |
| INT-PRINTER-001 | Receipt printing (drivers/templates) | partial | 1 | I | I | I | D | I | I | I | I | I | I |
| INT-LABEL-001 | Spine/label printing (ZPL/PDF templates) | missing | 0 | I | I | I | I | I | I | I | I | I | I |
| INT-PAY-001 | Online payments integration | missing | 0 | I | I | I | I | I | I | I | I | I | I |

### Admin + policy center (StacksOS-owned UX over Evergreen settings)

| Feature ID | Feature | StacksOS | Gap | Alma | Sierra | Symphony | Polaris | Koha | Evergreen | FOLIO | Follett | Surpass | Alexandria |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| MOD-ADMIN-001 | Calendar/closures UI | missing | 0 | I | I | I | I | I | I | I | I | I | I |
| MOD-ADMIN-002 | Circulation policy explain/edit surface | missing | 0 | I | I | I | I | I | I | I | I | I | I |
| MOD-ADMIN-003 | Hold targeting + pickup rules UI | missing | 0 | I | I | I | I | I | I | I | I | I | I |
| MOD-ADMIN-010 | Multi-branch permissions + org tree management | partial | 1 | I | I | I | I | I | D | I | I | I | I |

### OPAC / patron experience (P1 surface)

| Feature ID | Feature | StacksOS | Gap | Alma | Sierra | Symphony | Polaris | Koha | Evergreen | FOLIO | Follett | Surpass | Alexandria |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| MOD-OPAC-001 | Public catalog search UX | done | 2 | I | I | I | I | I | D | I | D | D | D |
| MOD-OPAC-002 | Patron account (holds/loans/fines) | done | 2 | I | I | I | I | I | D | I | D | D | D |
| MOD-OPAC-003 | Mobile-first experience | done | 3 | I | I | I | I | I | I | I | I | I | I |

### SaaS control plane + operations

| Feature ID | Feature | StacksOS | Gap | Alma | Sierra | Symphony | Polaris | Koha | Evergreen | FOLIO | Follett | Surpass | Alexandria |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| SAAS-TENANT-001 | Tenant provisioning (1-click) | missing | 0 | I | I | I | I | I | - | I | I | I | I |
| SAAS-CONFIG-001 | Versioned tenant config + feature flags | partial | 1 | I | I | I | I | I | - | I | I | I | I |
| SAAS-UPGRADE-001 | Automated upgrades + rollback | missing | 0 | I | I | I | I | I | - | I | I | I | I |
| SAAS-BACKUP-001 | Backups + restore drills | missing | 0 | I | I | I | I | I | - | I | I | I | I |
| OPS-OBS-001 | Per-tenant metrics/logs/traces | partial | 1 | I | I | I | I | I | - | I | I | I | I |

---

## P2 Parity Matrix (AI-first + collaboration differentiators)

P2 is where StacksOS becomes meaningfully better than every incumbent.
We still keep the same credibility rules: AI must be auditable, reversible, permissioned, and privacy-safe.

### AI copilots (staff + discovery)

| Feature ID | Feature | StacksOS | Gap | Alma | Sierra | Symphony | Polaris | Koha | Evergreen | FOLIO | Follett | Surpass | Alexandria |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| AI-EXPLAIN-001 | Policy explainability copilot (blocks -> human explanation) | partial | 1 | I | I | I | I | I | I | I | I | I | I |
| AI-CAT-010 | AI metadata assist (subjects/summaries with provenance) | missing | 0 | I | I | I | I | I | I | I | I | I | I |
| AI-SEARCH-010 | Hybrid search (keyword + semantic) | missing | 0 | I | I | I | I | I | I | I | I | I | I |
| AI-ANALYTICS-010 | AI analytics narratives with drill-down | missing | 0 | I | I | I | I | I | I | I | I | I | I |

### Collaboration UX

| Feature ID | Feature | StacksOS | Gap | Alma | Sierra | Symphony | Polaris | Koha | Evergreen | FOLIO | Follett | Surpass | Alexandria |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| COLLAB-001 | Presence (who is viewing/editing) | missing | 0 | I | I | I | I | I | I | I | I | I | I |
| COLLAB-002 | Soft locks + conflict resolution | missing | 0 | I | I | I | I | I | I | I | I | I | I |
| COLLAB-003 | Tasks + @mentions tied to records | missing | 0 | I | I | I | I | I | I | I | I | I | I |


## Evidence sources (starting set)

These sources are what allow specific cells above to be marked D.

Polaris:
- Checkout: https://documentation.iii.com/polaris/7.1/PolarisStaffHelp/Patron_Services/PPckout/Check_out_an_item.htm
- Bulk check-in: https://documentation.iii.com/polaris/7.4/PolarisStaffHelp/Patron_Services/PPckin/Using_bulk_check-in.htm
- Holds placement: https://documentation.iii.com/polaris/7.3/PolarisStaffHelp/Patron_Services/PPholds/Place_single_or_consecutive_hold_requests.htm
- Hold request manager (RTF): https://documentation.iii.com/polaris/7.2/PolarisStaffHelp/Patron_Services/PPholds/Fill_hold_requests_for_Requests-To-Fill.htm
- Workstation + staff permissions for circ: https://documentation.iii.com/polaris/7.4/PolarisStaffHelp/Patron_Services_Admin/PDPPermsRef/Circulation_and_Patron_Services_Workflow_Permissions.htm
- Receipts setup: https://documentation.iii.com/polaris/7.4/PolarisStaffHelp/Patron_Services_Admin/PDPreceipts/Setting_Up_Printed_Receipts.htm

Symphony WorkFlows:
- Hold policy/constraints: https://sirsi.sitehost.iu.edu/Helps/Symphony/Workflows/English/Content/Topics/07-Circulation/FAQs/FAQs___Understanding_Hol.htm
- Keyboard shortcuts (circ/holds/offline/etc): https://sirsi.sitehost.iu.edu/Helps/Symphony/Workflows/English/Content/Topics/WFInterface/Toolbar_Keyboard_Shortcu.htm

Surpass Cloud:
- Circulation module overview: https://docs.surpass.cloud/docs/circulation
- Patron select shortcuts: https://docs.surpass.cloud/docs/circulation-patron-select

Follett Destiny:
- Checkout to patron: https://destinyhelp191en.fsc.follett.com/content/t_check_out_library.htm

Alexandria:
- Circulation commands: https://support.goalexandria.com/circulation/circulation-commands/

Koha manual:
- https://koha-community.org/manual/

Evergreen documentation:
- https://docs.evergreen-ils.org/


Additional doc sources collected (barcode/workstation/migration):

Evergreen:
- Workstation registration: https://docs.evergreen-ils.org/docs/latest/admin/web_client-login.html
- Workstation admin: https://docs.evergreen-ils.org/docs/latest/admin/workstation_admin.html
- Barcode completion rules: https://docs.evergreen-ils.org/docs/latest/admin/barcode_completion.html

Polaris (Innovative):
- LEAP workstations: https://documentation.iii.com/polaris/7.6/leap/Default.htm#staff_client_admin/Workstations.htm
- Barcode formats: https://documentation.iii.com/polaris/7.6/PolarisStaffHelp/Default.htm#SysAdminGuide/Barcodes/Barcode_Formats.htm

Symphony (SirsiDynix):
- Station wizard: https://sirsi.sitehost.iu.edu/Helps/Symphony/Workflows/English/Content/Topics/WFWhere/station_wizard.htm

Sierra (Innovative):
- Verify patrons: https://help.iii.com/sierra/Content/sril/sril_patron_verify_patrons.htm
- Offline barcode validation: https://help.iii.com/sierra/Content/sril/sril_offline_maintain_barcode_validation.htm
- Patron record overlay by barcode: https://help.iii.com/sierra/Content/sril/sril_patron_record_overlay_barcode.htm

Alma (Ex Libris):
- Circulation desk tasks: https://knowledge.exlibrisgroup.com/Alma/Product_Documentation/010Alma_Online_Help_(English)/030Fulfillment/040Circulation_Desk_Operations/Managing_Patron_Services_at_a_Circulation_Desk_-_New_Layout
- Managing user identifiers: https://knowledge.exlibrisgroup.com/Alma/Product_Documentation/010Alma_Online_Help_(English)/050Administration/030User_Management/010Managing_Users

Koha:
- System preferences (autoMemberNum, CardnumberLength): https://koha-community.org/manual/latest/en/html/administrationpreferences.html

Follett Destiny:
- Import patrons: https://destinyhelp.fsc.follett.com/content/t_import_patrons.htm

Alexandria:
- Importing patrons: https://support.goalexandria.com/support/solutions/articles/70000599253-importing-patrons

Surpass:
- Barcodes (alternate ID as barcode): https://docs.surpass.cloud/docs/barcodes

FOLIO:
- Check out (access app): https://docs.folio.org/docs/access/check-out/checkout/
- Check in (access app): https://docs.folio.org/docs/access/check-in/checkin/
- Renewals (loan policies): https://docs.folio.org/docs/settings/circulation/loan-policies/#renewals
- Training (circulation overview):
  - https://docs.folio.org/docs/getting-started/training/circulation/checking-out-items/
  - https://docs.folio.org/docs/getting-started/training/circulation/checking-in-items/

Interoperability (SIP2/NCIP/MFA):

Evergreen:
- SIP2 server: https://docs.evergreen-ils.org/docs/latest/admin/sip_server.html
- MFA in the web staff client: https://docs.evergreen-ils.org/docs/latest/admin/mfa.html

Koha:
- SIP2 server: https://koha-community.org/manual/latest/en/html/administration.html#sip2-server

FOLIO:
- Edge SIP2 module (wiki): https://wiki.folio.org/display/FOLIOtips/Edge+APIs
- NCIP module (wiki): https://wiki.folio.org/display/FOLIOtips/NCIP

Alma:
- NCIP integration (resource sharing): https://knowledge.exlibrisgroup.com/Alma/Product_Documentation/010Alma_Online_Help_(English)/032Resource_Sharing/010Resource_Sharing_Overview/050NCIP_Integration

Acquisitions (additional doc sources):

Polaris:
- Vendor records: https://documentation.iii.com/polaris/7.3/PolarisStaffHelp/Acquisitions/PPACQ_Create_a_vendor_record.htm
- Fund records: https://documentation.iii.com/polaris/7.5/PolarisStaffHelp/Acquisitions/PPACQ_Create_a_fund_record.htm
- Purchase orders: https://documentation.iii.com/polaris/7.3/PolarisStaffHelp/Acquisitions/PPACQ_Create_a_purchase_order.htm
- Receiving: https://documentation.iii.com/polaris/7.5/PolarisStaffHelp/Acquisitions/PPACQ_Receiving.htm
- Invoices: https://documentation.iii.com/polaris/7.2/PolarisStaffHelp/Acquisitions/PPACQ_Create_and_pay_an_invoice.htm

Sierra:
- Vendor records: https://documentation.iii.com/sierrahelp/Content/sgacq/sgacq_view_vendor_recs.htm
- Fund records: https://documentation.iii.com/sierrahelp/Content/sgacq/sgacq_create_fund_record.htm
- Purchase orders: https://documentation.iii.com/sierrahelp/Content/sgacq/sgacq_create_po.htm
- Receiving: https://documentation.iii.com/sierrahelp/Content/sgacq/sgacq_receive_orders.htm
- Invoices (view): https://documentation.iii.com/sierrahelp/Content/sgacq/sgacq_view_invoices.htm
- Invoices (create): https://documentation.iii.com/sierrahelp/Content/sgacq/sgacq_create_invoice_records.htm

Symphony WorkFlows:
- Vendor records: https://sirsi.sitehost.iu.edu/Helps/Symphony/Workflows/English/Content/Topics/09-Acquisitions/vendor_create.htm
- Funds: https://sirsi.sitehost.iu.edu/Helps/Symphony/Workflows/English/Content/Topics/09-Acquisitions/fund_create.htm
- Purchase orders: https://sirsi.sitehost.iu.edu/Helps/Symphony/Workflows/English/Content/Topics/09-Acquisitions/purchase_order_wizard.htm
- Receiving: https://sirsi.sitehost.iu.edu/Helps/Symphony/Workflows/English/Content/Topics/09-Acquisitions/receive_order.htm
- Invoices: https://sirsi.sitehost.iu.edu/Helps/Symphony/Workflows/English/Content/Topics/09-Acquisitions/invoice_info_display.htm

Alma:
- Acquisitions overview: https://knowledge.exlibrisgroup.com/Alma/Product_Documentation/010Alma_Online_Help_(English)/020Acquisitions/010Introduction_to_Acquisitions
- Vendors: https://knowledge.exlibrisgroup.com/Alma/Product_Documentation/010Alma_Online_Help_(English)/020Acquisitions/030Acquisitions_Infrastructure/010Managing_Vendors
- Funds and ledgers: https://knowledge.exlibrisgroup.com/Alma/Product_Documentation/010Alma_Online_Help_(English)/020Acquisitions/030Acquisitions_Infrastructure/020Managing_Funds_and_Ledgers
- Invoices: https://knowledge.exlibrisgroup.com/Alma/Product_Documentation/010Alma_Online_Help_(English)/020Acquisitions/020Invoicing/010Invoicing_Workflow

FOLIO:
- Create purchase order: https://docs.folio.org/docs/getting-started/training/acquisitions/creating-a-purchase-order/
- Receive items: https://docs.folio.org/docs/getting-started/training/acquisitions/receiving-items/
- Create invoice: https://docs.folio.org/docs/getting-started/training/acquisitions/creating-an-invoice/
- Import EDIFACT invoices/voucher lines: https://docs.folio.org/docs/settings/data-import/importing-invoices-and-voucher-lines/

Serials (additional doc sources):

Polaris:
- Control serials: https://documentation.iii.com/polaris/7.2/PolarisStaffHelp/Serials/Control_serials.htm
- Receive serial issues: https://documentation.iii.com/polaris/7.3/PolarisStaffHelp/Serials/Receive_serial_issues.htm
- Claim serial issues: https://documentation.iii.com/polaris/7.3/PolarisStaffHelp/Serials/Claim_serial_issues.htm

Sierra:
- Issue check-in: https://documentation.iii.com/sierrahelp/Content/sgser/sgser_checkin_serial_issues.htm
- Claiming serials: https://documentation.iii.com/sierrahelp/Content/sgser/sgser_claiming_serials.htm

Symphony WorkFlows:
- Create subscription: https://sirsi.sitehost.iu.edu/Helps/Symphony/Workflows/English/Content/Topics/08-Serials/subscription_create.htm
- Routing list: https://sirsi.sitehost.iu.edu/Helps/Symphony/Workflows/English/Content/Topics/08-Serials/routing_list.htm
- Check in serial: https://sirsi.sitehost.iu.edu/Helps/Symphony/Workflows/English/Content/Topics/08-Serials/serial_checkin.htm
- Claim serial issues: https://sirsi.sitehost.iu.edu/Helps/Symphony/Workflows/English/Content/Topics/08-Serials/serial_claim.htm

Alma:
- Predictive patterns: https://knowledge.exlibrisgroup.com/Alma/Product_Documentation/010Alma_Online_Help_(English)/Physical_Resource_Management/016Managing_Physical_Resources/Prediction_Patterns
- Claiming: https://knowledge.exlibrisgroup.com/Alma/Product_Materials/050Alma_FAQs/Acquisitions/Claims
