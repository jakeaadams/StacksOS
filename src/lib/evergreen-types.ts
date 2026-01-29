/**
 * Evergreen ILS TypeScript Definitions
 * Proper types for OpenSRF responses and Evergreen data structures
 */

// ============================================================================
// Core OpenSRF Types
// ============================================================================

export interface OpenSRFPayload<T = unknown> {
  payload: T[];
  status?: number;
}

export interface OpenSRFError {
  ilsevent?: number;
  textcode?: string;
  desc?: string;
  payload?: unknown;
}

// ============================================================================
// Organization / Library Types
// ============================================================================

export interface OrgUnit {
  id: number;
  shortname: string;
  name: string;
  parent_ou?: number | null;
  ou_type: number | OrgType;
  children?: OrgUnit[];
  email?: string;
  phone?: string;
  opac_visible?: boolean;
  ill_address?: Address;
  holds_address?: Address;
  mailing_address?: Address;
  billing_address?: Address;
}

export interface OrgType {
  id: number;
  name: string;
  opac_label?: string;
  depth: number;
  parent?: number;
  can_have_users?: boolean;
  can_have_vols?: boolean;
}

export interface Address {
  id: number;
  street1?: string;
  street2?: string;
  city?: string;
  county?: string;
  state?: string;
  country?: string;
  post_code?: string;
}

// ============================================================================
// Patron / User Types
// ============================================================================

export interface Patron {
  id: number;
  usrname: string;
  email?: string;
  first_given_name?: string;
  second_given_name?: string;
  family_name?: string;
  prefix?: string;
  suffix?: string;
  dob?: string;
  ident_type?: number;
  ident_value?: string;
  ident_type2?: number;
  ident_value2?: string;
  home_ou: number;
  profile: number;
  active?: boolean;
  barred?: boolean;
  deleted?: boolean;
  juvenile?: boolean;
  master_account?: boolean;
  super_user?: boolean;
  expire_date?: string;
  create_date?: string;
  card?: PatronCard;
  cards?: PatronCard[];
  addresses?: Address[];
  billing_address?: Address;
  mailing_address?: Address;
  standing_penalties?: PatronPenalty[];
  stat_cat_entries?: StatCatEntry[];
  settings?: PatronSetting[];
  notes?: PatronNote[];
  phone?: string;
  day_phone?: string;
  evening_phone?: string;
  other_phone?: string;
}

export interface PatronCard {
  id: number;
  usr: number;
  barcode: string;
  active?: boolean;
}

export interface PatronPenalty {
  id: number;
  usr: number;
  standing_penalty: number | StandingPenaltyType;
  org_unit: number;
  staff: number;
  note?: string;
  set_date: string;
  stop_date?: string;
}

export interface StandingPenaltyType {
  id: number;
  name: string;
  label?: string;
  block_list?: string;
  staff_alert?: boolean;
  org_depth?: number;
}

export interface PatronSetting {
  id?: number;
  usr: number;
  name: string;
  value?: string;
}

export interface PatronNote {
  id: number;
  usr: number;
  creator: number;
  create_date: string;
  pub: boolean;
  title?: string;
  value: string;
}

export interface StatCatEntry {
  id: number;
  stat_cat: number;
  stat_cat_entry: string;
  target_usr: number;
}

// ============================================================================
// Circulation Types
// ============================================================================

export interface Circulation {
  id: number;
  usr: number;
  target_copy: number;
  circ_lib: number;
  circ_staff: number;
  xact_start: string;
  xact_finish?: string | null;
  due_date: string;
  stop_fines?: string;
  stop_fines_time?: string;
  checkin_time?: string | null;
  checkin_staff?: number;
  checkin_lib?: number;
  renewal_remaining?: number;
  grace_period?: string;
  duration?: string;
  recurring_fine?: number;
  max_fine?: number;
  phone_renewal?: boolean;
  desk_renewal?: boolean;
  opac_renewal?: boolean;
  duration_rule?: string;
  recurring_fine_rule?: string;
  max_fine_rule?: string;
  copy_location?: number;
  auto_renewal?: boolean;
  auto_renewal_remaining?: number;
}

export interface CheckoutResult {
  textcode?: string;
  desc?: string;
  payload?: {
    circ?: Circulation;
    copy?: Copy;
    record?: BibRecord;
    volume?: CallNumber;
  };
  ilsevent?: number;
  success?: boolean;
}

export interface CheckinResult {
  textcode?: string;
  desc?: string;
  payload?: {
    circ?: Circulation;
    copy?: Copy;
    record?: BibRecord;
    hold?: Hold;
    transit?: Transit;
  };
  ilsevent?: number;
}

export interface RenewResult {
  textcode?: string;
  desc?: string;
  payload?: {
    circ?: Circulation;
    copy?: Copy;
    old_circ?: Circulation;
  };
  ilsevent?: number;
}

// ============================================================================
// Hold Types
// ============================================================================

export interface Hold {
  id: number;
  usr: number;
  requestor: number;
  hold_type: "T" | "V" | "C" | "M" | "P" | "I" | "F";
  target: number;
  pickup_lib: number;
  request_lib: number;
  request_time: string;
  capture_time?: string | null;
  fulfillment_time?: string | null;
  checkin_time?: string | null;
  return_time?: string | null;
  prev_check_time?: string;
  expire_time?: string;
  cancel_time?: string | null;
  cancel_cause?: number;
  cancel_note?: string;
  frozen: boolean;
  thaw_date?: string | null;
  shelf_time?: string | null;
  current_copy?: number | null;
  current_shelf_lib?: number;
  behind_desk?: boolean;
  shelf_expire_time?: string;
  selection_ou?: number;
  selection_depth?: number;
  notify_email?: boolean;
  notify_sms?: boolean;
  notify_phone?: boolean;
  email_notify?: string;
  sms_notify?: string;
  phone_notify?: string;
  sms_carrier?: number;
  cut_in_line?: boolean;
  mint_condition?: boolean;
  hopeless_date?: string;
  notes?: HoldNote[];
}

export interface HoldNote {
  id: number;
  hold: number;
  title?: string;
  body: string;
  slip?: boolean;
  staff?: boolean;
  pub?: boolean;
}

export interface HoldDetails {
  hold: Hold;
  copy?: Copy;
  volume?: CallNumber;
  mvr?: MODSRecord;
  status?: number;
  queue_position?: number;
  potential_copies?: number;
  estimated_wait?: string;
  patron_barcode?: string;
}

export interface Transit {
  id: number;
  source_send_time: string;
  dest_recv_time?: string;
  target_copy: number;
  source: number;
  dest: number;
  prev_hop?: number;
  hold?: number;
  copy_status?: number;
  persistant_transfer?: boolean;
  prev_dest?: number;
  cancel_time?: string;
}

// ============================================================================
// Catalog / Bibliographic Types
// ============================================================================

export interface BibRecord {
  id: number;
  tcn_value?: string;
  tcn_source?: string;
  marc?: string;
  quality?: number;
  source?: number;
  owner?: number;
  share_depth?: number;
  active?: boolean;
  deleted?: boolean;
  create_date?: string;
  edit_date?: string;
  creator?: number;
  editor?: number;
}

export interface MODSRecord {
  doc_id: number;
  tcn?: string;
  title?: string;
  author?: string;
  isbn?: string;
  issn?: string;
  publisher?: string;
  pubdate?: string;
  edition?: string;
  physical_description?: string;
  series?: string;
  abstract?: string;
  subject?: string[];
  type_of_resource?: string;
  genre?: string[];
  copy_count?: number;
  hold_count?: number;
}

export interface CallNumber {
  id: number;
  record: number;
  owning_lib: number;
  label: string;
  label_class?: number;
  prefix?: number | CallNumberPrefix;
  suffix?: number | CallNumberSuffix;
  label_sortkey?: string;
  deleted?: boolean;
  copies?: Copy[];
}

export interface CallNumberPrefix {
  id: number;
  owning_lib: number;
  label: string;
  label_sortkey?: string;
}

export interface CallNumberSuffix {
  id: number;
  owning_lib: number;
  label: string;
  label_sortkey?: string;
}

export interface Copy {
  id: number;
  barcode: string;
  call_number: number | CallNumber;
  circ_lib: number;
  status: number | CopyStatus;
  location: number | CopyLocation;
  circ_modifier?: string;
  loan_duration: number;
  fine_level: number;
  age_protect?: number;
  circulate: boolean;
  deposit?: boolean;
  deposit_amount?: number;
  ref: boolean;
  holdable: boolean;
  opac_visible: boolean;
  deleted?: boolean;
  create_date?: string;
  edit_date?: string;
  copy_number?: number;
  price?: number;
  cost?: number;
  mint_condition?: boolean;
  dummy_title?: string;
  dummy_author?: string;
  dummy_isbn?: string;
  alert_message?: string;
  floating?: number;
  active_date?: string;
}

export interface CopyStatus {
  id: number;
  name: string;
  holdable?: boolean;
  opac_visible?: boolean;
  copy_active?: boolean;
  restrict_copy_delete?: boolean;
  is_available?: boolean;
}

export interface CopyLocation {
  id: number;
  name: string;
  owning_lib: number;
  holdable?: boolean;
  hold_verify?: boolean;
  opac_visible?: boolean;
  circulate?: boolean;
  label_prefix?: string;
  label_suffix?: string;
  checkin_alert?: boolean;
  deleted?: boolean;
  url?: string;
}

// ============================================================================
// Acquisitions Types
// ============================================================================

export interface PurchaseOrder {
  id: number;
  owner: number;
  creator: number;
  editor: number;
  ordering_agency: number;
  create_time: string;
  edit_time: string;
  provider: number | Provider;
  state: string;
  order_date?: string;
  name?: string;
  cancel_reason?: number;
  prepayment_required?: boolean;
  note?: string;
}

export interface Provider {
  id: number;
  name: string;
  owner: number;
  currency_type?: string;
  code?: string;
  holding_tag?: string;
  san?: string;
  edi_default?: number;
  active?: boolean;
  prepayment_required?: boolean;
  url?: string;
  email?: string;
  phone?: string;
  fax_phone?: string;
  default_copy_count?: number;
  default_claim_policy?: number;
}

export interface LineItem {
  id: number;
  purchase_order?: number;
  picklist?: number;
  creator: number;
  editor: number;
  selector?: number;
  provider?: number;
  create_time: string;
  edit_time: string;
  expected_recv_time?: string;
  claim_policy?: number;
  estimated_unit_price?: number;
  state: string;
  cancel_reason?: number;
  eg_bib_id?: number;
  marc?: string;
  source_label?: string;
  item_count?: number;
  claim_count?: number;
  order_identifier?: string;
  attributes?: LineItemAttribute[];
  lineitem_details?: LineItemDetail[];
}

export interface LineItemAttribute {
  id: number;
  lineitem: number;
  definition: number;
  attr_type: string;
  attr_name: string;
  attr_value: string;
}

export interface LineItemDetail {
  id: number;
  lineitem: number;
  fund?: number;
  fund_debit?: number;
  eg_copy_id?: number;
  barcode?: string;
  cn_label?: string;
  owning_lib?: number;
  location?: number;
  collection_code?: string;
  circ_modifier?: string;
  recv_time?: string;
  cancel_reason?: number;
  note?: string;
}

export interface Fund {
  id: number;
  org: number;
  name: string;
  year: number;
  currency_type: string;
  code?: string;
  balance_stop_percent?: number;
  balance_warning_percent?: number;
  propagate?: boolean;
  rollover?: boolean;
  active?: boolean;
}

export interface Invoice {
  id: number;
  receiver: number;
  provider: number;
  shipper?: number;
  recv_date: string;
  recv_method?: string;
  inv_type?: string;
  inv_ident: string;
  payment_auth?: string;
  payment_method?: number;
  note?: string;
  complete?: boolean;
  close_date?: string;
}

// ============================================================================
// Serials Types
// ============================================================================

export interface SerialSubscription {
  id: number;
  owning_lib: number;
  start_date: string;
  end_date?: string;
  record_entry: number;
  expected_date_offset?: string;
  note?: string;
}

export interface SerialDistribution {
  id: number;
  subscription: number;
  holding_lib: number;
  label?: string;
  receive_call_number?: number;
  receive_unit_template?: number;
  bind_call_number?: number;
  bind_unit_template?: number;
  unit_label_prefix?: string;
  unit_label_suffix?: string;
  record_entry?: number;
  summary_method?: string;
}

export interface SerialItem {
  id: number;
  issuance: number;
  stream: number;
  unit?: number;
  uri?: number;
  date_expected: string;
  date_received?: string;
  status: string;
  note?: string;
}

// ============================================================================
// Booking Types
// ============================================================================

export interface BookingResourceType {
  id: number;
  name: string;
  owner: number;
  fine_interval?: string;
  fine_amount?: number;
  max_fine?: number;
  catalog_item?: boolean;
  transferable?: boolean;
  inter_booking_interval?: string;
  elbow_room?: string;
}

export interface BookingResource {
  id: number;
  owner: number;
  type: number | BookingResourceType;
  overbook?: boolean;
  barcode?: string;
  deposit?: boolean;
  deposit_amount?: number;
  user_fee?: number;
}

export interface BookingReservation {
  id: number;
  usr: number;
  request_time: string;
  start_time: string;
  end_time: string;
  capture_time?: string;
  cancel_time?: string;
  pickup_time?: string;
  return_time?: string;
  booking_interval?: string;
  fine_interval?: string;
  fine_amount?: number;
  max_fine?: number;
  target_resource_type: number;
  target_resource?: number;
  current_resource?: number;
  request_lib: number;
  pickup_lib: number;
  capture_staff?: number;
  note?: string;
}

// ============================================================================
// Billing / Money Types
// ============================================================================

export interface Bill {
  id: number;
  xact: number;
  billing_ts: string;
  voider?: number;
  void_time?: string;
  amount: number;
  billing_type: string;
  btype: number;
  note?: string;
  period_start?: string;
  period_end?: string;
}

export interface Payment {
  id: number;
  xact: number;
  payment_ts: string;
  payment_type: string;
  amount: number;
  accepting_usr: number;
  cash_drawer?: number;
  note?: string;
  voider?: number;
  void_time?: string;
}

export interface BillTransaction {
  id: number;
  usr: number;
  xact_start: string;
  xact_finish?: string;
  total_owed?: number;
  total_paid?: number;
  balance_owed?: number;
  last_billing_ts?: string;
  last_billing_note?: string;
  last_billing_type?: string;
  last_payment_ts?: string;
  last_payment_note?: string;
  last_payment_type?: string;
  xact_type?: string;
  circulation?: Circulation;
  grocery?: GroceryBilling;
}

export interface GroceryBilling {
  id: number;
  xact: number;
  billing_location: number;
  note?: string;
}

// ============================================================================
// Authority Types
// ============================================================================

export interface AuthorityRecord {
  id: number;
  marc: string;
  heading?: string;
  simple_heading?: string;
  thesaurus?: string;
  control_set?: number;
  source?: number;
  deleted?: boolean;
  create_date?: string;
  edit_date?: string;
  creator?: number;
  editor?: number;
}

// ============================================================================
// Policy / Configuration Types
// ============================================================================

export interface CircDurationRule {
  id: number;
  name: string;
  extended?: string;
  normal?: string;
  shrt?: string;
  max_renewals?: number;
  max_auto_renewals?: number;
}

export interface RecurringFineRule {
  id: number;
  name: string;
  high?: number;
  normal?: number;
  low?: number;
  recurrence_interval?: string;
  grace_period?: string;
}

export interface MaxFineRule {
  id: number;
  name: string;
  amount: number;
  is_percent?: boolean;
}

// ============================================================================
// Search Types
// ============================================================================

export interface SearchResult {
  count: number;
  ids: number[][];
  facet_key?: string;
  superpage_summary?: Record<string, number>;
}

export interface SearchFacet {
  label: string;
  value: string;
  count: number;
}

// ============================================================================
// Workstation Types
// ============================================================================

export interface Workstation {
  id: number;
  name: string;
  owning_lib: number;
}

// ============================================================================
// Session / Auth Types
// ============================================================================

export interface AuthSession {
  authtoken: string;
  authtime: number;
}

export interface AuthResult {
  ilsevent?: number;
  textcode?: string;
  desc?: string;
  payload?: {
    authtoken?: string;
    authtime?: number;
  };
}

// ============================================================================
// Helper type for generic Record operations
// ============================================================================

export type RecordMap = Record<string, unknown>;
