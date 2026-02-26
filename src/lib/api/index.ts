/**
 * Evergreen API Utilities
 *
 * This is the ONLY module that API routes should import for Evergreen integration.
 * It provides:
 * - callOpenSRF: The gateway function for all Evergreen calls
 * - Auth helpers: getAuthToken, requireAuthToken
 * - Response helpers: successResponse, errorResponse, etc.
 * - Common queries: getCopyByBarcode, getPatronByBarcode, etc.
 * - Type definitions for all Evergreen entities
 */

// Core client functions
export {
  callOpenSRF,
  getAuthToken,
  requireAuthToken,
  AuthenticationError,
  isSuccessResult,
  isOpenSRFEvent,
  getErrorMessage,
  extractPayload,
  getCopyByBarcode,
  getPatronByBarcode,
  getPatronById,
  getPatronFleshed,
  getOrgTree,
  getCopyStatuses,
} from "./client";

// Fieldmapper helpers
export {
  decodeFieldmapper,
  decodeOpenSRFResponse,
  encodeFieldmapper,
  fmGet,
  fmNumber,
  fmString,
  fmBoolean,
  fmDate,
} from "./fieldmapper";

// Fieldmapper index maps
export {
  AU_FIELDS,
  AC_FIELDS,
  CIRC_FIELDS,
  AHR_FIELDS,
  ACP_FIELDS,
  MVR_FIELDS,
  ACN_FIELDS,
  PGT_FIELDS,
  PPL_FIELDS,
  PGPM_FIELDS,
  CCMM_FIELDS,
  CHMM_FIELDS,
  CRCD_FIELDS,
  CRRF_FIELDS,
  CRMF_FIELDS,
  AUSP_FIELDS,
  CSP_FIELDS,
  AOU_FIELDS,
  ACPL_FIELDS,
  FIELDMAPPER_MAPS,
} from "./fieldmapper-maps";

// Typed payload extraction helpers
export {
  fieldValue,
  fieldString,
  fieldNumber,
  fieldBool,
  payloadFirst,
  payloadFirstArray,
  payloadAll,
  nestedFieldValue,
} from "./extract-payload";

// pcrud helpers
export { callPcrud } from "./pcrud";

// Request utilities
export { getRequestMeta, getClientIp, getUserAgent, getRequestId } from "./requests";

// Response helpers
export {
  successResponse,
  okResponse,
  errorResponse,
  notFoundResponse,
  unauthorizedResponse,
  forbiddenResponse,
  serverErrorResponse,
  handleOpenSRFResult,
  parseJsonBody,
  parseJsonBodyWithSchema,
  requireFields,
  withErrorHandling,
} from "./responses";

// Type exports
export type {
  // OpenSRF types
  OpenSRFResponse,
  OpenSRFEvent,
  ApiSuccessResponse,
  ApiErrorResponse,
  ApiResponse,
  // Auth types
  AuthSession,
  // Patron types
  Patron,
  PatronCard,
  Address,
  PatronPenalty,
  // Circulation types
  Circulation,
  CheckoutResult,
  CheckinResult,
  // Hold types
  HoldType,
  Hold,
  HoldDetails,
  // Copy types
  Copy,
  Volume,
  CopyStatus,
  // Bib types
  BibRecord,
  MVR,
  // Org types
  OrgUnit,
  // Transaction types
  Transaction,
  Billing,
  Payment,
  // Transit types
  Transit,
  // Acquisitions types
  PurchaseOrder,
  LineItem,
  Invoice,
  // Serial types
  Subscription,
  SerialItem,
  // Booking types
  BookableResource,
  Reservation,
} from "./types";
