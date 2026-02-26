/**
 * Fieldmapper Index Maps
 *
 * Typed index maps for the most common Evergreen fieldmapper classes.
 * These map field names to their positional indices in the `__p` array
 * that Evergreen/OpenSRF returns via the fieldmapper protocol.
 *
 * Each map is declared `as const` so that keys and values are literal types,
 * enabling type-safe field extraction via the `fieldValue()` helper.
 *
 * IMPORTANT: These indices are auto-derived from the project's local
 * `src/lib/api/idl/fm_IDL.xml`.  If the Evergreen IDL is modified
 * (e.g. after an upgrade), re-derive the maps from the new IDL.
 * The runtime `decodeFieldmapper()` path already reads from the IDL
 * file at startup, so these maps are only used for the raw `__p`
 * access pattern where decoding has not been applied.
 */

// ---------------------------------------------------------------------------
// actor.usr  (au) - Patron
// ---------------------------------------------------------------------------

export const AU_FIELDS = {
  addresses: 0,
  cards: 1,
  checkouts: 2,
  hold_requests: 3,
  permissions: 4,
  settings: 5,
  standing_penalties: 6,
  stat_cat_entries: 7,
  survey_responses: 8,
  waiver_entries: 9,
  ws_ou: 10,
  wsid: 11,
  active: 12,
  barred: 13,
  billing_address: 14,
  card: 15,
  claims_returned_count: 16,
  claims_never_checked_out_count: 17,
  create_date: 18,
  credit_forward_balance: 19,
  day_phone: 20,
  dob: 21,
  email: 22,
  evening_phone: 23,
  expire_date: 24,
  family_name: 25,
  first_given_name: 26,
  home_ou: 27,
  id: 28,
  ident_type: 29,
  ident_type2: 30,
  ident_value: 31,
  ident_value2: 32,
  last_xact_id: 33,
  mailing_address: 34,
  master_account: 35,
  net_access_level: 36,
  other_phone: 37,
  passwd: 38,
  photo_url: 39,
  prefix: 40,
  profile: 41,
  second_given_name: 42,
  standing: 43,
  suffix: 44,
  super_user: 45,
  usrgroup: 46,
  usrname: 47,
  alias: 48,
  juvenile: 49,
  last_update_time: 50,
  pref_prefix: 51,
  pref_first_given_name: 52,
  pref_second_given_name: 53,
  pref_family_name: 54,
  pref_suffix: 55,
  guardian: 56,
  guardian_email: 57,
  name_keywords: 58,
  name_kw_tsvector: 59,
  groups: 60,
  deleted: 61,
  notes: 62,
  demographic: 63,
  billable_transactions: 64,
  money_summary: 65,
  open_billable_transactions_summary: 66,
  checkins: 67,
  performed_circulations: 68,
  fund_alloc_pcts: 69,
  reservations: 70,
  usr_activity: 71,
  usr_work_ou_map: 72,
  locale: 73,
  isnew: 74,
  ischanged: 75,
  isdeleted: 76,
} as const;

export type AuField = keyof typeof AU_FIELDS;

// ---------------------------------------------------------------------------
// actor.card  (ac) - Patron Card
// ---------------------------------------------------------------------------

export const AC_FIELDS = {
  active: 0,
  barcode: 1,
  id: 2,
  usr: 3,
  isnew: 4,
  ischanged: 5,
  isdeleted: 6,
} as const;

export type AcField = keyof typeof AC_FIELDS;

// ---------------------------------------------------------------------------
// action.circulation  (circ)
// ---------------------------------------------------------------------------

export const CIRC_FIELDS = {
  checkin_lib: 0,
  checkin_staff: 1,
  checkin_time: 2,
  circ_lib: 3,
  circ_staff: 4,
  desk_renewal: 5,
  due_date: 6,
  duration: 7,
  duration_rule: 8,
  fine_interval: 9,
  id: 10,
  max_fine: 11,
  max_fine_rule: 12,
  opac_renewal: 13,
  phone_renewal: 14,
  recurring_fine: 15,
  recurring_fine_rule: 16,
  renewal_remaining: 17,
  grace_period: 18,
  stop_fines: 19,
  stop_fines_time: 20,
  target_copy: 21,
  usr: 22,
  xact_finish: 23,
  xact_start: 24,
  create_time: 25,
  workstation: 26,
  checkin_workstation: 27,
  checkin_scan_time: 28,
  parent_circ: 29,
  billings: 30,
  payments: 31,
  billable_transaction: 32,
  circ_type: 33,
  billing_total: 34,
  payment_total: 35,
  unrecovered: 36,
  copy_location: 37,
  aaactsc_entries: 38,
  aaasc_entries: 39,
  auto_renewal: 40,
  auto_renewal_remaining: 41,
  renewal: 42,
  isnew: 43,
  ischanged: 44,
  isdeleted: 45,
} as const;

export type CircField = keyof typeof CIRC_FIELDS;

// ---------------------------------------------------------------------------
// action.hold_request  (ahr)
// ---------------------------------------------------------------------------

export const AHR_FIELDS = {
  status: 0,
  transit: 1,
  capture_time: 2,
  current_copy: 3,
  email_notify: 4,
  expire_time: 5,
  fulfillment_lib: 6,
  fulfillment_staff: 7,
  fulfillment_time: 8,
  hold_type: 9,
  holdable_formats: 10,
  id: 11,
  phone_notify: 12,
  sms_notify: 13,
  sms_carrier: 14,
  pickup_lib: 15,
  prev_check_time: 16,
  request_lib: 17,
  request_time: 18,
  requestor: 19,
  reset_entries: 20,
  selection_depth: 21,
  selection_ou: 22,
  target: 23,
  usr: 24,
  cancel_time: 25,
  canceled_by: 26,
  canceling_ws: 27,
  notify_time: 28,
  notify_count: 29,
  notifications: 30,
  bib_rec: 31,
  eligible_copies: 32,
  frozen: 33,
  thaw_date: 34,
  shelf_time: 35,
  cancel_cause: 36,
  cancel_note: 37,
  cut_in_line: 38,
  mint_condition: 39,
  shelf_expire_time: 40,
  notes: 41,
  current_shelf_lib: 42,
  behind_desk: 43,
  acq_request: 44,
  hopeless_date: 45,
  isnew: 46,
  ischanged: 47,
  isdeleted: 48,
} as const;

export type AhrField = keyof typeof AHR_FIELDS;

// ---------------------------------------------------------------------------
// asset.copy  (acp)
// ---------------------------------------------------------------------------

export const ACP_FIELDS = {
  age_protect: 0,
  alert_message: 1,
  barcode: 2,
  call_number: 3,
  circ_as_type: 4,
  circ_lib: 5,
  circ_modifier: 6,
  circulate: 7,
  copy_number: 8,
  create_date: 9,
  active_date: 10,
  creator: 11,
  deleted: 12,
  dummy_isbn: 13,
  deposit: 14,
  deposit_amount: 15,
  dummy_author: 16,
  dummy_title: 17,
  edit_date: 18,
  editor: 19,
  fine_level: 20,
  holdable: 21,
  id: 22,
  loan_duration: 23,
  location: 24,
  opac_visible: 25,
  price: 26,
  ref: 27,
  status: 28,
  status_changed_time: 29,
  mint_condition: 30,
  floating: 31,
  cost: 32,
  notes: 33,
  stat_cat_entry_copy_maps: 34,
  circulations: 35,
  aged_circulations: 36,
  in_house_use: 37,
  all_circulations: 38,
  total_circ_count: 39,
  last_circ: 40,
  holds: 41,
  stat_cat_entries: 42,
  parts: 43,
  peer_record_maps: 44,
  peer_records: 45,
  last_captured_hold: 46,
  latest_inventory: 47,
  copy_inventory: 48,
  holds_count: 49,
  tags: 50,
  copy_alerts: 51,
  open_circulation: 52,
  isnew: 53,
  ischanged: 54,
  isdeleted: 55,
} as const;

export type AcpField = keyof typeof ACP_FIELDS;

// ---------------------------------------------------------------------------
// metabib.virtual_record  (mvr) - MODS slim bib record
// ---------------------------------------------------------------------------

export const MVR_FIELDS = {
  title: 0,
  author: 1,
  doc_id: 2,
  doc_type: 3,
  pubdate: 4,
  isbn: 5,
  publisher: 6,
  tcn: 7,
  subject: 8,
  types_of_resource: 9,
  call_numbers: 10,
  edition: 11,
  online_loc: 12,
  synopsis: 13,
  physical_description: 14,
  toc: 15,
  copy_count: 16,
  series: 17,
  serials: 18,
  foreign_copy_maps: 19,
  isnew: 20,
  ischanged: 21,
  isdeleted: 22,
} as const;

export type MvrField = keyof typeof MVR_FIELDS;

// ---------------------------------------------------------------------------
// asset.call_number  (acn)
// ---------------------------------------------------------------------------

export const ACN_FIELDS = {
  copies: 0,
  create_date: 1,
  creator: 2,
  deleted: 3,
  edit_date: 4,
  editor: 5,
  id: 6,
  label: 7,
  owning_lib: 8,
  record: 9,
  notes: 10,
  uri_maps: 11,
  uris: 12,
  label_sortkey: 13,
  label_class: 14,
  prefix: 15,
  suffix: 16,
  dewey: 17,
  isnew: 18,
  ischanged: 19,
  isdeleted: 20,
} as const;

export type AcnField = keyof typeof ACN_FIELDS;

// ---------------------------------------------------------------------------
// permission.grp_tree  (pgt)
// ---------------------------------------------------------------------------

export const PGT_FIELDS = {
  children: 0,
  description: 1,
  id: 2,
  name: 3,
  parent: 4,
  perm_interval: 5,
  temporary_perm_interval: 6,
  application_perm: 7,
  usergroup: 8,
  hold_priority: 9,
  mfa_allowed: 10,
  mfa_required: 11,
  erenew: 12,
  isnew: 13,
  ischanged: 14,
  isdeleted: 15,
} as const;

export type PgtField = keyof typeof PGT_FIELDS;

// ---------------------------------------------------------------------------
// permission.perm_list  (ppl)
// ---------------------------------------------------------------------------

export const PPL_FIELDS = {
  code: 0,
  description: 1,
  id: 2,
  isnew: 3,
  ischanged: 4,
  isdeleted: 5,
} as const;

export type PplField = keyof typeof PPL_FIELDS;

// ---------------------------------------------------------------------------
// permission.grp_perm_map  (pgpm)
// ---------------------------------------------------------------------------

export const PGPM_FIELDS = {
  depth: 0,
  grantable: 1,
  grp: 2,
  id: 3,
  perm: 4,
  isnew: 5,
  ischanged: 6,
  isdeleted: 7,
} as const;

export type PgpmField = keyof typeof PGPM_FIELDS;

// ---------------------------------------------------------------------------
// config.circ_matrix_matchpoint  (ccmm)
// ---------------------------------------------------------------------------

export const CCMM_FIELDS = {
  id: 0,
  is_renewal: 1,
  active: 2,
  org_unit: 3,
  copy_circ_lib: 4,
  copy_owning_lib: 5,
  user_home_ou: 6,
  grp: 7,
  circ_modifier: 8,
  copy_location: 9,
  marc_type: 10,
  marc_form: 11,
  marc_bib_level: 12,
  marc_vr_format: 13,
  ref_flag: 14,
  juvenile_flag: 15,
  usr_age_lower_bound: 16,
  usr_age_upper_bound: 17,
  item_age: 18,
  circulate: 19,
  duration_rule: 20,
  recurring_fine_rule: 21,
  max_fine_rule: 22,
  hard_due_date: 23,
  renewals: 24,
  grace_period: 25,
  script_test: 26,
  total_copy_hold_ratio: 27,
  available_copy_hold_ratio: 28,
  description: 29,
  renew_extends_due_date: 30,
  renew_extend_min_interval: 31,
  isnew: 32,
  ischanged: 33,
  isdeleted: 34,
} as const;

export type CcmmField = keyof typeof CCMM_FIELDS;

// ---------------------------------------------------------------------------
// config.hold_matrix_matchpoint  (chmm)
// ---------------------------------------------------------------------------

export const CHMM_FIELDS = {
  id: 0,
  active: 1,
  strict_ou_match: 2,
  user_home_ou: 3,
  request_ou: 4,
  pickup_ou: 5,
  item_owning_ou: 6,
  item_circ_ou: 7,
  usr_grp: 8,
  requestor_grp: 9,
  circ_modifier: 10,
  copy_location: 11,
  marc_type: 12,
  marc_form: 13,
  marc_bib_level: 14,
  marc_vr_format: 15,
  ref_flag: 16,
  item_age: 17,
  holdable: 18,
  distance_is_from_owner: 19,
  transit_range: 20,
  max_holds: 21,
  include_frozen_holds: 22,
  age_hold_protect_rule: 23,
  stop_blocked_user: 24,
  description: 25,
  isnew: 26,
  ischanged: 27,
  isdeleted: 28,
} as const;

export type ChmmField = keyof typeof CHMM_FIELDS;

// ---------------------------------------------------------------------------
// config.rule_circ_duration  (crcd)
// ---------------------------------------------------------------------------

export const CRCD_FIELDS = {
  extended: 0,
  id: 1,
  max_renewals: 2,
  name: 3,
  normal: 4,
  shrt: 5,
  max_auto_renewals: 6,
  isnew: 7,
  ischanged: 8,
  isdeleted: 9,
} as const;

export type CrcdField = keyof typeof CRCD_FIELDS;

// ---------------------------------------------------------------------------
// config.rule_recurring_fine  (crrf)
// ---------------------------------------------------------------------------

export const CRRF_FIELDS = {
  high: 0,
  id: 1,
  low: 2,
  name: 3,
  normal: 4,
  recurrence_interval: 5,
  grace_period: 6,
  isnew: 7,
  ischanged: 8,
  isdeleted: 9,
} as const;

export type CrrfField = keyof typeof CRRF_FIELDS;

// ---------------------------------------------------------------------------
// config.rule_max_fine  (crmf)
// ---------------------------------------------------------------------------

export const CRMF_FIELDS = {
  amount: 0,
  id: 1,
  name: 2,
  is_percent: 3,
  isnew: 4,
  ischanged: 5,
  isdeleted: 6,
} as const;

export type CrmfField = keyof typeof CRMF_FIELDS;

// ---------------------------------------------------------------------------
// actor.usr_standing_penalty  (ausp)
// ---------------------------------------------------------------------------

export const AUSP_FIELDS = {
  id: 0,
  set_date: 1,
  usr: 2,
  staff: 3,
  standing_penalty: 4,
  org_unit: 5,
  stop_date: 6,
  usr_message: 7,
  isnew: 8,
  ischanged: 9,
  isdeleted: 10,
} as const;

export type AuspField = keyof typeof AUSP_FIELDS;

// ---------------------------------------------------------------------------
// config.standing_penalty  (csp) - penalty types
// ---------------------------------------------------------------------------

export const CSP_FIELDS = {
  id: 0,
  name: 1,
  label: 2,
  block_list: 3,
  staff_alert: 4,
  org_depth: 5,
  ignore_proximity: 6,
  isnew: 7,
  ischanged: 8,
  isdeleted: 9,
} as const;

export type CspField = keyof typeof CSP_FIELDS;

// ---------------------------------------------------------------------------
// actor.org_unit  (aou)
// ---------------------------------------------------------------------------

export const AOU_FIELDS = {
  children: 0,
  billing_address: 1,
  holds_address: 2,
  id: 3,
  ill_address: 4,
  mailing_address: 5,
  name: 6,
  ou_type: 7,
  parent_ou: 8,
  shortname: 9,
  email: 10,
  phone: 11,
  opac_visible: 12,
  staff_catalog_visible: 13,
  fiscal_calendar: 14,
  users: 15,
  closed_dates: 16,
  circulations: 17,
  settings: 18,
  addresses: 19,
  checkins: 20,
  workstations: 21,
  fund_alloc_pcts: 22,
  copy_location_orders: 23,
  atc_prev_dests: 24,
  resv_requests: 25,
  resv_pickups: 26,
  rsrc_types: 27,
  resources: 28,
  rsrc_attrs: 29,
  attr_vals: 30,
  hours_of_operation: 31,
  isnew: 32,
  ischanged: 33,
  isdeleted: 34,
} as const;

export type AouField = keyof typeof AOU_FIELDS;

// ---------------------------------------------------------------------------
// asset.copy_location  (acpl) - Shelving Locations
// ---------------------------------------------------------------------------

export const ACPL_FIELDS = {
  circulate: 0,
  holdable: 1,
  hold_verify: 2,
  id: 3,
  name: 4,
  opac_visible: 5,
  owning_lib: 6,
  orders: 7,
  copies: 8,
  label_prefix: 9,
  label_suffix: 10,
  checkin_alert: 11,
  deleted: 12,
  url: 13,
  isnew: 14,
  ischanged: 15,
  isdeleted: 16,
} as const;

export type AcplField = keyof typeof ACPL_FIELDS;

// ---------------------------------------------------------------------------
// Consolidated lookup by class name
// ---------------------------------------------------------------------------

/**
 * Master map keyed by fieldmapper class ID.
 * Used by `fieldValue()` to resolve field-to-index mapping at runtime.
 */
export const FIELDMAPPER_MAPS: Record<string, Readonly<Record<string, number>>> = {
  au: AU_FIELDS,
  ac: AC_FIELDS,
  circ: CIRC_FIELDS,
  ahr: AHR_FIELDS,
  acp: ACP_FIELDS,
  mvr: MVR_FIELDS,
  acn: ACN_FIELDS,
  pgt: PGT_FIELDS,
  ppl: PPL_FIELDS,
  pgpm: PGPM_FIELDS,
  ccmm: CCMM_FIELDS,
  chmm: CHMM_FIELDS,
  crcd: CRCD_FIELDS,
  crrf: CRRF_FIELDS,
  crmf: CRMF_FIELDS,
  ausp: AUSP_FIELDS,
  csp: CSP_FIELDS,
  aou: AOU_FIELDS,
  acpl: ACPL_FIELDS,
};
