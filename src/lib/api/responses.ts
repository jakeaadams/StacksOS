/**
 * API Response Helpers
 * Consistent response formatting for all API routes
 */

import { NextResponse } from "next/server";
import { AuthenticationError, getErrorMessage } from "./client";
import { logger } from "@/lib/logger";
import { apiErrorResponsesTotal } from "@/lib/metrics";
import { ZodType } from "zod";

// ============================================================================
// Success Responses
// ============================================================================

/**
 * Return a success response with data
 */
export function successResponse<T extends Record<string, any>>(data: T, message?: string) {
  return NextResponse.json({
    ok: true,
    ...data,
    ...(message && { message }),
  });
}

/**
 * Return a simple success response with just a message
 */
export function okResponse(message: string) {
  return NextResponse.json({ ok: true, message });
}

// ============================================================================
// Error Responses
// ============================================================================

/**
 * Return an error response
 */
export function errorResponse(error: string, status: number = 400, details?: any) {
  const body: any = { ok: false, error };
  if (details !== undefined) body.details = details;
  return NextResponse.json(body, { status });
}

/**
 * Return a 404 not found response
 */
export function notFoundResponse(message: string = "Not found") {
  return errorResponse(message, 404);
}

/**
 * Return a 401 unauthorized response
 */
export function unauthorizedResponse(message: string = "Authentication required") {
  return errorResponse(message, 401);
}

/**
 * Return a 403 forbidden response
 */
export function forbiddenResponse(message: string = "Permission denied") {
  return errorResponse(message, 403);
}

// ============================================================================
// Server Error Responses
// ============================================================================

function shouldExposeErrorDetails(): boolean {
  const flag = String(process.env.STACKSOS_DEBUG_ERRORS || "").toLowerCase();
  if (["1", "true", "yes"].includes(flag)) return true;
  return process.env.NODE_ENV !== "production";
}

function serializeError(error: unknown): { name?: string; message: string; stack?: string } {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }
  return { message: String(error) };
}

function getRequestId(req?: Request): string | undefined {
  const raw = req?.headers?.get?.("x-request-id") || "";
  const trimmed = raw.trim();
  return trimmed ? trimmed : undefined;
}

function recordApiError(context: string, status: number) {
  try {
    apiErrorResponsesTotal.inc({ context, status: String(status) });
  } catch {
    // Metrics must never break production traffic.
  }
}

/**
 * Return a 500 server error response with structured logging.
 *
 * Note: we include requestId in details (safe) to help correlate UI errors with server logs.
 */
export function serverErrorResponse(error: unknown, context: string, req?: Request) {
  // Normalize common control-flow errors into correct HTTP statuses.
  // Many routes call serverErrorResponse() directly from catch blocks.
  if (error instanceof AuthenticationError) {
    recordApiError(context, 401);
    return unauthorizedResponse(error.message);
  }

  // Avoid importing PermissionError to prevent circular imports. Match by name.
  if (error && typeof error === "object" && (error as any).name === "PermissionError") {
    const message = String((error as any).message || "Permission denied");
    const missing = Array.isArray((error as any).missing) ? (error as any).missing : [];
    const requestId = getRequestId(req);

    logger.warn({ requestId, route: context, missing }, "Permission denied");

    recordApiError(context, 403);
    return errorResponse(message, 403, { missing, requestId });
  }

  const expose = shouldExposeErrorDetails();
  const details = serializeError(error);
  const requestId = getRequestId(req);

  logger.error({ requestId, route: context, error: details }, "Unhandled server error");

  recordApiError(context, 500);
  const message = expose ? details.message : "Internal server error";
  const responseDetails = expose ? { ...details, requestId } : { requestId };

  return errorResponse(message, 500, responseDetails);
}

// ============================================================================
// OpenSRF Result Helpers
// ============================================================================

/**
 * Handle OpenSRF result - return error response if failed
 */
export function handleOpenSRFResult(
  result: any,
  successData: Record<string, any>,
  errorFallback: string,
  successMessage?: string
): NextResponse {
  // Check for success conditions
  if (
    result === 1 ||
    result === true ||
    (typeof result === "number" && result > 0) ||
    (result && !result.ilsevent) ||
    result?.ilsevent === 0
  ) {
    return successResponse(successData, successMessage);
  }

  // It's an error
  return errorResponse(getErrorMessage(result, errorFallback), 400, result);
}

// ============================================================================
// Request Helpers
// ============================================================================

/**
 * Parse JSON body with error handling
 */
export async function parseJsonBody<T = any>(request: Request): Promise<T | NextResponse> {
  try {
    return await request.json();
  } catch (_error) {
    return errorResponse("Invalid JSON body", 400);
  }
}

/**
 * Parse and validate a JSON body against a Zod schema.
 * Returns a typed object on success, or a NextResponse error on failure.
 */
export async function parseJsonBodyWithSchema<T>(
  request: Request,
  schema: ZodType<T>
): Promise<T | NextResponse> {
  const body = await parseJsonBody<unknown>(request);
  if (body instanceof NextResponse) return body;

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("Invalid request body", 400, {
      issues: parsed.error.issues,
    });
  }

  return parsed.data;
}

/**
 * Require specific fields in request body
 */
export function requireFields(body: Record<string, any>, fields: string[]): NextResponse | null {
  const missing = fields.filter((f) => body[f] === undefined || body[f] === null);
  if (missing.length > 0) {
    return errorResponse("Missing required fields: " + missing.join(", "), 400);
  }
  return null;
}

// ============================================================================
// Route Handler Wrapper
// ============================================================================

/**
 * Wrap a route handler with standard error handling
 */
export function withErrorHandling(handler: (req: Request) => Promise<NextResponse>, context: string) {
  return async (req: Request): Promise<NextResponse> => {
    try {
      return await handler(req);
    } catch (error) {
      if (error instanceof AuthenticationError) {
        return unauthorizedResponse(error.message);
      }
      return serverErrorResponse(error, context, req);
    }
  };
}
