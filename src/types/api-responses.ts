/**
 * API Response Types
 * 
 * Typed interfaces for Evergreen API responses
 */

// ============================================================================
// Patron API Response Types
// ============================================================================

export interface PatronAddress {
  street1: string;
  street2?: string;
  city: string;
  state: string;
  post_code: string;
  country?: string;
}

export interface PatronCard {
  id: number;
  barcode: string;
  active: boolean;
}

export interface PatronOrgUnit {
  id: number;
  shortname: string;
  name: string;
}

export interface PatronProfile {
  id: number;
  name: string;
}

export interface PatronPenaltyRaw {
  id: number;
  note?: string;
  standing_penalty?: {
    id: number;
    name: string;
    label?: string;
    block_list?: string;
  };
}

export interface PatronRaw {
  id: number;
  first_given_name?: string;
  family_name?: string;
  email?: string;
  day_phone?: string;
  evening_phone?: string;
  phone?: string;
  card?: PatronCard;
  barcode?: string;
  home_ou?: PatronOrgUnit;
  homeLibrary?: string;
  profile?: PatronProfile;
  profileGroup?: string;
  active?: boolean;
  barred?: boolean;
  alerts?: unknown[];
  penalties?: unknown[];
  standing_penalties?: PatronPenaltyRaw[];
  balance_owed?: string | number;
  balanceOwed?: number;
  checkouts_count?: number;
  checkoutsCount?: number;
  holds_count?: number;
  holdsCount?: number;
  overdue_count?: number;
  overdueCount?: number;
  displayName?: string;
  firstName?: string;
  lastName?: string;
  dob?: string;
  dateOfBirth?: string;
  create_date?: string;
  created?: string;
  expire_date?: string;
  expires?: string;
  last_xact_id?: string;
  lastActivity?: string;
  addresses?: PatronAddress[];
  address?: PatronAddress;
  notes?: Array<{
    id: number;
    title: string;
    content: string;
    isAlert: boolean;
    created: string;
  }>;
}

// ============================================================================
// Item API Response Types
// ============================================================================

export interface ItemCallNumber {
  id: number;
  label: string;
  record?: {
    id: number;
    simple_record?: {
      title?: string;
      author?: string;
    };
  };
  owning_lib?: {
    id: number;
    shortname: string;
  };
}

export interface ItemLocation {
  id: number;
  name: string;
}

export interface ItemCircLib {
  id: number;
  shortname?: string;
  name?: string;
}

export interface ItemStatusRaw {
  id: number;
  name: string;
}

export interface ItemRaw {
  id: number;
  barcode?: string;
  call_number?: ItemCallNumber | number;
  callNumber?: string;
  location?: ItemLocation | string;
  circ_lib?: ItemCircLib;
  circLib?: string;
  owningLib?: string;
  status?: ItemStatusRaw | number;
  statusId?: number;
  copy_number?: number;
  copyNumber?: number;
  price?: string | number;
  holdable?: boolean;
  circulate?: boolean;
  ref?: boolean;
  refItem?: boolean;
  title?: string;
  author?: string;
  recordId?: number;
  callNumberId?: number;
  isbn?: string;
  publisher?: string;
  pubdate?: string;
  pubDate?: string;
  format?: string;
  edition?: string;
  currentCirculation?: ItemCirculation;
  holdInfo?: ItemHoldInfo;
}

export interface ItemCirculation {
  id: number;
  patronId: number;
  patronBarcode: string;
  patronName: string;
  checkoutDate: string;
  dueDate: string;
  renewals: number;
  isOverdue: boolean;
  finesAccrued: number;
}

export interface ItemHoldInfo {
  totalHolds: number;
  availableCopies: number;
  queuePosition?: number;
}

// ============================================================================
// Hold API Response Types
// ============================================================================

export interface HoldMvr {
  title?: string;
  author?: string;
}

export interface HoldRaw {
  id: number;
  hold_type?: string;
  target?: number;
  request_time?: string;
  capture_time?: string;
  fulfillment_time?: string;
  expire_time?: string;
  pickup_lib?: number;
  frozen?: boolean | string;
  thaw_date?: string;
  shelf_expire_time?: string;
  current_copy?: number;
  title?: string;
  author?: string;
  mvr?: HoldMvr;
  status?: string | number;
  queue_position?: number;
  potential_copies?: number;
}

// ============================================================================
// Bill API Response Types
// ============================================================================

export interface BillRaw {
  id: number;
  xact?: number;
  amount?: string | number;
  balance_owed?: string | number;
  voided?: boolean | string;
  billing_type?: string;
  note?: string;
}

// ============================================================================
// Circulation API Response Types
// ============================================================================

export interface CirculationRaw {
  id: number;
  usr?: number;
  target_copy?: number;
  circ_lib?: number;
  due_date?: string;
  xact_start?: string;
  xact_finish?: string;
  checkin_time?: string;
  stop_fines?: string;
  stop_fines_time?: string;
  renewal_remaining?: number;
  __p?: (string | number | boolean | null)[];
}

// ============================================================================
// Transit API Response Types  
// ============================================================================

export interface TransitRaw {
  id: number;
  source?: number;
  dest?: number;
  target_copy?: number;
  copy_status?: number;
  source_send_time?: string;
  dest_recv_time?: string;
  cancel_time?: string;
  hold?: number;
}

// ============================================================================
// Admin Settings Response Types
// ============================================================================

export interface OrgSettingRaw {
  name?: string;
  value?: string | number | boolean | null;
  org_unit?: number;
}

export interface SettingTypeRaw {
  name?: string;
  label?: string;
  description?: string;
  datatype?: string;
  fm_class?: string;
}

export interface CopyLocationRaw {
  id: number;
  name?: string;
  owning_lib?: number | { id: number; shortname?: string };
  holdable?: boolean | string;
  hold_verify?: boolean | string;
  opac_visible?: boolean | string;
  circulate?: boolean | string;
  deleted?: boolean | string;
  label_prefix?: string;
  label_suffix?: string;
  checkin_alert?: boolean | string;
  __p?: (string | number | boolean | null)[];
}

// ============================================================================
// Policy Response Types
// ============================================================================

export interface PolicyFieldmapper {
  __c?: string;
  __p?: (string | number | boolean | null | PolicyFieldmapper)[];
}

export interface CircPolicyRaw extends PolicyFieldmapper {
  id?: number;
  active?: boolean | string;
  org_unit?: number | PolicyFieldmapper;
  grp?: number | PolicyFieldmapper;
  circ_modifier?: string;
  copy_location?: number | PolicyFieldmapper;
  is_renewal?: boolean | string;
  ref_flag?: boolean | string;
  usr_age_upper_bound?: string;
  usr_age_lower_bound?: string;
  item_age?: string;
  circulate?: boolean | string;
  duration_rule?: number | PolicyFieldmapper;
  recurring_fine_rule?: number | PolicyFieldmapper;
  max_fine_rule?: number | PolicyFieldmapper;
  hard_due_date?: string | PolicyFieldmapper;
  renewals?: number;
  grace_period?: string;
  script_test?: string;
  total_copy_hold_ratio?: number;
  available_copy_hold_ratio?: number;
  description?: string;
}

export interface HoldPolicyRaw extends PolicyFieldmapper {
  id?: number;
  active?: boolean | string;
  strict_ou_match?: boolean | string;
  user_home_ou?: number | PolicyFieldmapper;
  requestor_grp?: number | PolicyFieldmapper;
  usr_grp?: number | PolicyFieldmapper;
  pickup_ou?: number | PolicyFieldmapper;
  request_ou?: number | PolicyFieldmapper;
  item_owning_ou?: number | PolicyFieldmapper;
  item_circ_ou?: number | PolicyFieldmapper;
  circ_modifier?: string;
  marc_type?: string;
  marc_form?: string;
  marc_vr_format?: string;
  ref_flag?: boolean | string;
  item_age?: string;
  holdable?: boolean | string;
  distance_is_from_owner?: boolean | string;
  transit_range?: number;
  max_holds?: number;
  include_frozen_holds?: boolean | string;
  stop_blocked_user?: boolean | string;
  age_hold_protect_rule?: number | PolicyFieldmapper;
  description?: string;
}

export interface DurationRuleRaw extends PolicyFieldmapper {
  id?: number;
  name?: string;
  extended?: string;
  normal?: string;
  shrt?: string;
  max_renewals?: number;
  max_auto_renewals?: number;
}

export interface FineRuleRaw extends PolicyFieldmapper {
  id?: number;
  name?: string;
  high?: string;
  normal?: string;
  low?: string;
  recurrence_interval?: string;
  grace_period?: string;
}

export interface MaxFineRuleRaw extends PolicyFieldmapper {
  id?: number;
  name?: string;
  amount?: string;
  is_percent?: boolean | string;
}
