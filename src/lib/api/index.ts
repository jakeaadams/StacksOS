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

// pcrud helpers
export { callPcrud } from "./pcrud";

// Request utilities
export {
  getRequestMeta,
  getClientIp,
  getUserAgent,
  getRequestId,
} from "./requests";

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
