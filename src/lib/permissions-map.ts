/**
 * Centralized Permission Mappings
 * 
 * Maps actions to required Evergreen permissions.
 * Used across multiple API routes to ensure consistent RBAC enforcement.
 */

/**
 * Circulation action permissions
 */
export const CIRCULATION_PERMS = {
  checkout: ["COPY_CHECKOUT"],
  checkin: ["COPY_CHECKIN"],
  renew: ["RENEW_CIRC"],
  place_hold: ["TITLE_HOLDS"],
  cancel_hold: ["CANCEL_HOLDS"],
  suspend_hold: ["UPDATE_HOLD"],
  activate_hold: ["UPDATE_HOLD"],
  pay_bills: ["VIEW_TRANSACTION", "ACCEPT_PAYMENT"],
  void_bills: ["VOID_BILLING"],
  adjust_bills: ["ADJUST_BILLS"],
  mark_lost: ["MARK_ITEM_LOST"],
  mark_damaged: ["MARK_ITEM_DAMAGED"],
  mark_claims_returned: ["MARK_ITEM_CLAIMS_RETURNED"],
  override: ["COPY_CHECKOUT.override", "CIRC_EXCEEDS_COPY_RANGE.override"],
} as const;

/**
 * Claims action permissions
 */
export const CLAIMS_PERMS = {
  claims_returned: ["MARK_ITEM_CLAIMS_RETURNED"],
  claims_never_checked_out: ["MARK_ITEM_CLAIMS_RETURNED", "UPDATE_USER"],
  resolve_claims: ["COPY_CHECKIN", "UPDATE_USER"],
} as const;

/**
 * Lost item action permissions
 */
export const LOST_PERMS = {
  mark_lost: ["MARK_ITEM_LOST"],
  declare_lost: ["MARK_ITEM_LOST"],
  restore_lost: ["UPDATE_COPY"],
} as const;

/**
 * Offline transaction permissions
 */
export const OFFLINE_PERMS = {
  checkout: ["COPY_CHECKOUT"],
  checkin: ["COPY_CHECKIN"],
  renew: ["RENEW_CIRC"],
  in_house_use: ["STAFF_LOGIN"],
} as const;

/**
 * Patron management permissions
 */
export const PATRON_PERMS = {
  view: ["VIEW_USER"],
  create: ["CREATE_USER"],
  update: ["UPDATE_USER"],
  delete: ["DELETE_USER"],
  view_notes: ["VIEW_USER"],
  add_notes: ["UPDATE_USER"],
  delete_notes: ["UPDATE_USER"],
  view_bills: ["VIEW_TRANSACTION"],
  view_checkouts: ["VIEW_CIRCULATIONS"],
  view_holds: ["VIEW_HOLD"],
  reset_password: ["UPDATE_USER"],
  barred: ["BAR_PATRON"],
  unbarred: ["BAR_PATRON"],
} as const;

/**
 * Acquisitions permissions
 */
export const ACQUISITIONS_PERMS = {
  view_po: ["VIEW_PURCHASE_ORDER"],
  create_po: ["CREATE_PURCHASE_ORDER"],
  update_po: ["UPDATE_PURCHASE_ORDER"],
  view_lineitem: ["VIEW_LINEITEM"],
  receive_lineitem: ["RECEIVE_LINEITEM"],
  cancel_lineitem: ["CANCEL_LINEITEM"],
  view_invoice: ["VIEW_INVOICE"],
  create_invoice: ["CREATE_INVOICE"],
} as const;

/**
 * Cataloging permissions
 */
export const CATALOGING_PERMS = {
  create_marc: ["CREATE_MARC"],
  update_marc: ["UPDATE_MARC"],
  delete_marc: ["DELETE_MARC"],
  create_volume: ["CREATE_VOLUME"],
  update_volume: ["UPDATE_VOLUME"],
  delete_volume: ["DELETE_VOLUME"],
  create_copy: ["CREATE_COPY"],
  update_copy: ["UPDATE_COPY"],
  delete_copy: ["DELETE_COPY"],
} as const;

/**
 * Serials permissions
 */
export const SERIALS_PERMS = {
  receive: ["RECEIVE_SERIAL"],
  view: ["VIEW_SERIAL"],
  admin: ["ADMIN_SERIAL"],
} as const;

/**
 * Transit permissions
 */
export const TRANSIT_PERMS = {
  view: ["VIEW_TRANSIT"],
  abort: ["ABORT_TRANSIT"],
  receive: ["COPY_CHECKIN"],
} as const;

/**
 * Booking permissions
 */
export const BOOKING_PERMS = {
  view: ["VIEW_BOOKING_RESERVATION"],
  create: ["CREATE_BOOKING_RESERVATION"],
  update: ["UPDATE_BOOKING_RESERVATION"],
  cancel: ["CANCEL_BOOKING_RESERVATION"],
  capture: ["CAPTURE_BOOKING_RESERVATION"],
  return: ["CHECKIN_BOOKING_RESERVATION"],
} as const;

/**
 * Helper function to get permissions for an action
 */
export function getPermissionsForAction(
  category: string,
  action: string
): readonly string[] | undefined {
  const maps: Record<string, any> = {
    circulation: CIRCULATION_PERMS,
    claims: CLAIMS_PERMS,
    lost: LOST_PERMS,
    offline: OFFLINE_PERMS,
    patron: PATRON_PERMS,
    acquisitions: ACQUISITIONS_PERMS,
    cataloging: CATALOGING_PERMS,
    serials: SERIALS_PERMS,
    transit: TRANSIT_PERMS,
    booking: BOOKING_PERMS,
  };

  const categoryMap = maps[category];
  if (!categoryMap) return undefined;

  return categoryMap[action];
}

/**
 * Type helper for valid action keys
 */
export type CirculationAction = keyof typeof CIRCULATION_PERMS;
export type ClaimsAction = keyof typeof CLAIMS_PERMS;
export type LostAction = keyof typeof LOST_PERMS;
export type OfflineAction = keyof typeof OFFLINE_PERMS;
export type PatronAction = keyof typeof PATRON_PERMS;
export type AcquisitionsAction = keyof typeof ACQUISITIONS_PERMS;
export type CatalogingAction = keyof typeof CATALOGING_PERMS;
export type SerialsAction = keyof typeof SERIALS_PERMS;
export type TransitAction = keyof typeof TRANSIT_PERMS;
export type BookingAction = keyof typeof BOOKING_PERMS;
