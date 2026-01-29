/**
 * Shared TypeScript types for Evergreen API integration
 */

// ============================================================================
// OpenSRF Response Types
// ============================================================================

export interface OpenSRFResponse<T = unknown> {
  payload: T[];
  status?: number;
}

export interface OpenSRFEvent {
  ilsevent: number;
  textcode: string;
  desc?: string;
  payload?: unknown;
  servertime?: string;
}

// ============================================================================
// API Response Types
// ============================================================================

export interface ApiSuccessResponse<T = unknown> {
  ok: true;
  data?: T;
  message?: string;
  [key: string]: unknown;
}

export interface ApiErrorResponse {
  ok: false;
  error: string;
  details?: unknown;
}

export type ApiResponse<T = unknown> = ApiSuccessResponse<T> | ApiErrorResponse;

// ============================================================================
// Authentication Types
// ============================================================================

export interface AuthSession {
  authtoken: string;
  authtime: number;
  patronid?: number;
  wsid?: number;
}

// ============================================================================
// Patron Types
// ============================================================================

export interface Patron {
  id: number;
  usrname: string;
  family_name: string;
  first_given_name: string;
  second_given_name?: string;
  email?: string;
  day_phone?: string;
  evening_phone?: string;
  other_phone?: string;
  dob?: string;
  ident_value?: string;
  ident_type?: number;
  home_ou: number;
  profile: number;
  active: boolean;
  barred: boolean;
  deleted: boolean;
  juvenile: boolean;
  expire_date?: string;
  create_date: string;
  card?: PatronCard;
  cards?: PatronCard[];
  addresses?: Address[];
  billing_address?: Address;
  mailing_address?: Address;
  standing_penalties?: PatronPenalty[];
  claims_returned_count?: number;
  claims_never_checked_out_count?: number;
}

export interface PatronCard {
  id: number;
  usr: number;
  barcode: string;
  active: boolean;
}

export interface Address {
  id: number;
  valid: boolean;
  address_type: string;
  street1: string;
  street2?: string;
  city: string;
  county?: string;
  state: string;
  country: string;
  post_code: string;
}

export interface PatronPenalty {
  id: number;
  usr: number;
  standing_penalty: number;
  staff: number;
  note?: string;
  set_date: string;
  stop_date?: string;
}

// ============================================================================
// Circulation Types
// ============================================================================

export interface Circulation {
  id: number;
  usr: number;
  target_copy: number;
  circ_lib: number;
  xact_start: string;
  xact_finish?: string;
  due_date: string;
  checkin_time?: string;
  stop_fines?: string;
  stop_fines_time?: string;
  renewal_remaining: number;
  duration: string;
  recurring_fine: string;
  max_fine: string;
}

export interface CheckoutResult {
  circ?: Circulation;
  copy?: Copy;
  record?: BibRecord;
  volume?: Volume;
  patron?: Patron;
}

export interface CheckinResult {
  circ?: Circulation;
  copy?: Copy;
  record?: BibRecord;
  hold?: Hold;
  transit?: Transit;
}

// ============================================================================
// Hold Types
// ============================================================================

export type HoldType = "T" | "V" | "C" | "M" | "P";

export interface Hold {
  id: number;
  usr: number;
  requestor: number;
  hold_type: HoldType;
  target: number;
  pickup_lib: number;
  request_time: string;
  capture_time?: string;
  fulfillment_time?: string;
  current_copy?: number;
  shelf_time?: string;
  shelf_expire_time?: string;
  expire_time?: string;
  frozen: boolean;
  thaw_date?: string;
  cancel_time?: string;
  cancel_cause?: number;
  cancel_note?: string;
  email_notify?: boolean;
  phone_notify?: string;
  sms_notify?: string;
}

export interface HoldDetails extends Hold {
  title?: string;
  author?: string;
  queue_position?: number;
  potential_copies?: number;
  status?: number;
}

// ============================================================================
// Copy / Item Types
// ============================================================================

export interface Copy {
  id: number;
  barcode: string;
  call_number: number | Volume;
  circ_lib: number;
  status: number;
  location: number;
  circ_modifier?: string;
  price?: number;
  deposit?: boolean;
  deposit_amount?: number;
  ref?: boolean;
  holdable: boolean;
  circulate: boolean;
  opac_visible: boolean;
  deleted: boolean;
  create_date: string;
  edit_date?: string;
}

export interface Volume {
  id: number;
  record: number;
  owning_lib: number;
  label: string;
  label_class: number;
  prefix?: number;
  suffix?: number;
}

export interface CopyStatus {
  id: number;
  name: string;
  holdable: boolean;
  opac_visible: boolean;
  copy_active: boolean;
}

// ============================================================================
// Bibliographic Types
// ============================================================================

export interface BibRecord {
  id: number;
  tcn_source: string;
  tcn_value: string;
  source: number;
  active: boolean;
  deleted: boolean;
  create_date: string;
  edit_date?: string;
  marc?: string;
}

export interface MVR {
  doc_id: number;
  title: string;
  author?: string;
  isbn?: string[];
  issn?: string[];
  publisher?: string;
  pubdate?: string;
  edition?: string;
  tcn?: string;
  series?: string[];
  types_of_resource?: string[];
}

// ============================================================================
// Organization Types
// ============================================================================

export interface OrgUnit {
  id: number;
  parent_ou?: number;
  ou_type: number;
  shortname: string;
  name: string;
  email?: string;
  phone?: string;
  opac_visible: boolean;
  children?: OrgUnit[];
}

// ============================================================================
// Transaction / Billing Types
// ============================================================================

export interface Transaction {
  id: number;
  usr: number;
  xact_start: string;
  xact_finish?: string;
  xact_type: string;
  balance_owed: number;
  total_owed: number;
  total_paid: number;
}

export interface Billing {
  id: number;
  xact: number;
  billing_ts: string;
  voided: boolean;
  void_time?: string;
  amount: number;
  billing_type: string;
  btype: number;
  note?: string;
}

export interface Payment {
  id: number;
  xact: number;
  payment_ts: string;
  voided: boolean;
  amount: number;
  payment_type: string;
  note?: string;
}

// ============================================================================
// Transit Types
// ============================================================================

export interface Transit {
  id: number;
  source: number;
  dest: number;
  target_copy: number;
  source_send_time: string;
  dest_recv_time?: string;
  hold?: number;
}

// ============================================================================
// Acquisitions Types
// ============================================================================

export interface PurchaseOrder {
  id: number;
  name?: string;
  owner: number;
  creator: number;
  editor: number;
  provider: number;
  ordering_agency: number;
  create_time: string;
  edit_time: string;
  state: string;
  order_date?: string;
}

export interface LineItem {
  id: number;
  purchase_order?: number;
  picklist?: number;
  creator: number;
  editor: number;
  selector: number;
  provider: number;
  estimated_unit_price?: number;
  claim_policy?: number;
  state: string;
}

export interface Invoice {
  id: number;
  receiver: number;
  provider: number;
  shipper: number;
  inv_ident: string;
  recv_date: string;
  recv_method: string;
  close_date?: string;
}

// ============================================================================
// Serial Types
// ============================================================================

export interface Subscription {
  id: number;
  owning_lib: number;
  record_entry: number;
  start_date: string;
  end_date?: string;
  expected_date_offset?: string;
}

export interface SerialItem {
  id: number;
  issuance: number;
  stream: number;
  unit?: number;
  status: string;
  date_expected: string;
  date_received?: string;
}

// ============================================================================
// Booking Types
// ============================================================================

export interface BookableResource {
  id: number;
  owner: number;
  type: number;
  barcode?: string;
}

export interface Reservation {
  id: number;
  usr: number;
  request_time: string;
  pickup_lib: number;
  start_time: string;
  end_time: string;
  target_resource?: number;
  target_resource_type: number;
  current_resource?: number;
  capture_time?: string;
  cancel_time?: string;
}
