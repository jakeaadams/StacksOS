import { NextRequest } from "next/server";
import { callOpenSRF, successResponse, errorResponse, serverErrorResponse } from "@/lib/api";
import { requirePermissions } from "@/lib/permissions";
import { logger } from "@/lib/logger";
import { z } from "zod";

export type EDIMessageType = "ORDERS" | "ORDRSP" | "DESADV" | "INVOIC";

export interface EDIAccount {
  id: number;
  label: string;
  host: string;
  username: string;
  password?: string;
  account: string;
  vendorCode: string;
  vendorId: number;
  lastActivity?: string;
  inDirectory?: string;
  outDirectory?: string;
  owner: number;
  useHttp?: boolean;
  provider?: number;
  path?: string;
}

export interface EDIMessage {
  id: number;
  accountId: number;
  messageType: EDIMessageType;
  direction: "inbound" | "outbound";
  status: "pending" | "processed" | "error" | "cancelled";
  content?: string;
  error?: string;
  purchaseOrderId?: number;
  invoiceId?: number;
  createTime: string;
  processTime?: string;
  vendorMessageId?: string;
}

const ediPostSchema = z
  .object({
    action: z.string().trim().min(1),
  })
  .passthrough();

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const action = searchParams.get("action");
  const id = searchParams.get("id");
  const accountId = searchParams.get("accountId");
  const limit = parseInt(searchParams.get("limit") || "100", 10);
  const offset = parseInt(searchParams.get("offset") || "0", 10);

  try {
    const { authtoken, actor } = await requirePermissions(["STAFF_LOGIN"]);
    const orgId = actor?.ws_ou ?? actor?.home_ou;
    logger.debug({ route: "api.evergreen.acquisitions.edi", action, id, accountId }, "EDI GET");

    switch (action) {
      case "accounts": {
        let accounts: EDIAccount[] = [];
        try {
          const response = await callOpenSRF(
            "open-ils.acq",
            "open-ils.acq.edi_account.org.retrieve",
            [authtoken, orgId, { limit: 200 }]
          );
          const payload = response?.payload || [];
          const accountList = Array.isArray(payload?.[0]) ? payload[0] : payload;
          accounts = (Array.isArray(accountList) ? accountList : []).map((acc) => ({
            id: acc.id,
            label: acc.label || acc.name || "EDI Account " + acc.id,
            host: acc.host || "",
            username: acc.username || "",
            account: acc.account || "",
            vendorCode: acc.vendor_code || acc.vendorCode || "",
            vendorId: typeof acc.provider === "object" ? acc.provider?.id : acc.provider,
            lastActivity: acc.last_activity || null,
            inDirectory: acc.in_dir || acc.inDirectory || "",
            outDirectory: acc.out_dir || acc.outDirectory || "",
            owner: acc.owner || orgId,
            useHttp: acc.use_http === "t" || acc.use_http === true,
            provider: typeof acc.provider === "object" ? acc.provider?.id : acc.provider,
            path: acc.path || "",
          }));
        } catch (error: unknown) {
          logger.warn(
            { route: "api.evergreen.acquisitions.edi", action, err: String(error) },
            "EDI accounts lookup failed"
          );
        }
        return successResponse({ accounts });
      }
      case "account": {
        if (!id) return errorResponse("Account ID required", 400);
        try {
          const response = await callOpenSRF("open-ils.acq", "open-ils.acq.edi_account.retrieve", [
            authtoken,
            parseInt(id, 10),
          ]);
          const acc = response?.payload?.[0];
          if (!acc || acc.ilsevent) return errorResponse("EDI account not found", 404);
          return successResponse({
            account: {
              id: acc.id,
              label: acc.label || "EDI Account " + acc.id,
              host: acc.host || "",
              username: acc.username || "",
              account: acc.account || "",
              vendorCode: acc.vendor_code || "",
              vendorId: typeof acc.provider === "object" ? acc.provider?.id : acc.provider,
              lastActivity: acc.last_activity || null,
              inDirectory: acc.in_dir || "",
              outDirectory: acc.out_dir || "",
              owner: acc.owner || orgId,
              useHttp: acc.use_http === "t",
              provider: typeof acc.provider === "object" ? acc.provider?.id : acc.provider,
              path: acc.path || "",
            },
          });
        } catch (_error: unknown) {
          return errorResponse("Failed to retrieve EDI account", 500);
        }
      }
      case "messages": {
        const filters: Record<string, any> = {};
        if (accountId) filters.account = parseInt(accountId, 10);
        let messages: EDIMessage[] = [];
        try {
          const response = await callOpenSRF(
            "open-ils.acq",
            "open-ils.acq.edi_message.org.retrieve",
            [
              authtoken,
              orgId,
              { ...filters, limit, offset, order_by: { acqedim: "create_time DESC" } },
            ]
          );
          const payload = response?.payload || [];
          const messageList = Array.isArray(payload?.[0]) ? payload[0] : payload;
          messages = (Array.isArray(messageList) ? messageList : []).map((msg) => ({
            id: msg.id,
            accountId: typeof msg.account === "object" ? msg.account?.id : msg.account,
            messageType: msg.message_type || "ORDERS",
            direction: msg.direction || (msg.outgoing ? "outbound" : "inbound"),
            status: msg.status || (msg.error ? "error" : "processed"),
            content: msg.edi || msg.content,
            error: msg.error || null,
            purchaseOrderId:
              typeof msg.purchase_order === "object" ? msg.purchase_order?.id : msg.purchase_order,
            invoiceId: typeof msg.invoice === "object" ? msg.invoice?.id : msg.invoice,
            createTime: msg.create_time,
            processTime: msg.process_time || msg.edit_time,
            vendorMessageId: msg.vendor_message_id || msg.remote_file,
          }));
        } catch (error: unknown) {
          logger.warn(
            { route: "api.evergreen.acquisitions.edi", action, err: String(error) },
            "EDI messages lookup failed"
          );
        }
        return successResponse({ messages, total: messages.length });
      }
      case "message_types": {
        return successResponse({
          types: [
            { code: "ORDERS", number: "850", description: "Purchase Order", direction: "outbound" },
            {
              code: "ORDRSP",
              number: "855",
              description: "Order Response/Acknowledgment",
              direction: "inbound",
            },
            {
              code: "DESADV",
              number: "856",
              description: "Dispatch Advice/Shipping Notice",
              direction: "inbound",
            },
            { code: "INVOIC", number: "810", description: "Invoice", direction: "inbound" },
          ],
        });
      }
      default:
        return errorResponse("Invalid action", 400);
    }
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AuthenticationError")
      return errorResponse("Authentication required", 401);
    return serverErrorResponse(err, "EDI GET", req);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { authtoken, actor } = await requirePermissions(["ADMIN_ACQ_EDI_ACCOUNT"]);
    const body = ediPostSchema.parse(await req.json());
    const { action } = body;
    const orgId = actor?.ws_ou ?? actor?.home_ou;
    logger.debug({ route: "api.evergreen.acquisitions.edi", action }, "EDI POST");

    switch (action) {
      case "create_account": {
        const {
          label,
          host,
          username,
          password,
          account,
          vendorId,
          inDirectory,
          outDirectory,
          useHttp,
          path,
        } = body;
        if (!label) return errorResponse("Account label required", 400);
        if (!host) return errorResponse("Host required", 400);
        if (!vendorId) return errorResponse("Vendor ID required", 400);
        try {
          const response = await callOpenSRF("open-ils.acq", "open-ils.acq.edi_account.create", [
            authtoken,
            {
              label,
              host,
              username: username || "",
              password: password || "",
              account: account || "",
              provider: vendorId,
              owner: orgId,
              in_dir: inDirectory || "/incoming",
              out_dir: outDirectory || "/outgoing",
              use_http: useHttp ? "t" : "f",
              path: path || "",
            },
          ]);
          const result = response?.payload?.[0];
          if (result?.ilsevent)
            return errorResponse(result.textcode || "Failed to create EDI account", 400);
          return successResponse(
            { account: result, accountId: result?.id || result },
            "EDI account created"
          );
        } catch (_error: unknown) {
          return errorResponse("Failed to create EDI account", 500);
        }
      }
      case "update_account": {
        const {
          id,
          label,
          host,
          username,
          password,
          account,
          vendorId,
          inDirectory,
          outDirectory,
          useHttp,
          path,
        } = body;
        if (!id) return errorResponse("Account ID required", 400);
        const updates: Record<string, any> = { id };
        if (label !== undefined) updates.label = label;
        if (host !== undefined) updates.host = host;
        if (username !== undefined) updates.username = username;
        if (password !== undefined) updates.password = password;
        if (account !== undefined) updates.account = account;
        if (vendorId !== undefined) updates.provider = vendorId;
        if (inDirectory !== undefined) updates.in_dir = inDirectory;
        if (outDirectory !== undefined) updates.out_dir = outDirectory;
        if (useHttp !== undefined) updates.use_http = useHttp ? "t" : "f";
        if (path !== undefined) updates.path = path;
        try {
          const response = await callOpenSRF("open-ils.acq", "open-ils.acq.edi_account.update", [
            authtoken,
            updates,
          ]);
          const result = response?.payload?.[0];
          if (result?.ilsevent)
            return errorResponse(result.textcode || "Failed to update EDI account", 400);
          return successResponse({ updated: true, accountId: id }, "EDI account updated");
        } catch (_error: unknown) {
          return errorResponse("Failed to update EDI account", 500);
        }
      }
      case "delete_account": {
        const { id } = body;
        if (!id) return errorResponse("Account ID required", 400);
        try {
          const response = await callOpenSRF("open-ils.acq", "open-ils.acq.edi_account.delete", [
            authtoken,
            id,
          ]);
          const result = response?.payload?.[0];
          if (result?.ilsevent)
            return errorResponse(result.textcode || "Failed to delete EDI account", 400);
          return successResponse({ deleted: true, accountId: id }, "EDI account deleted");
        } catch (_error: unknown) {
          return errorResponse("Failed to delete EDI account", 500);
        }
      }
      case "send_order": {
        const { purchaseOrderId, accountId } = body;
        if (!purchaseOrderId) return errorResponse("Purchase order ID required", 400);
        if (!accountId) return errorResponse("EDI account ID required", 400);
        try {
          const response = await callOpenSRF("open-ils.acq", "open-ils.acq.edi.order.send", [
            authtoken,
            accountId,
            purchaseOrderId,
          ]);
          const result = response?.payload?.[0];
          if (result?.ilsevent)
            return errorResponse(result.textcode || "Failed to send EDI order", 400);
          return successResponse({ sent: true, purchaseOrderId, accountId }, "EDI order sent");
        } catch (_error: unknown) {
          return errorResponse("Failed to send EDI order", 500);
        }
      }
      case "process_inbound": {
        const { accountId } = body;
        if (!accountId) return errorResponse("EDI account ID required", 400);
        try {
          const response = await callOpenSRF("open-ils.acq", "open-ils.acq.edi.inbound.process", [
            authtoken,
            accountId,
          ]);
          const result = response?.payload?.[0];
          if (result?.ilsevent)
            return errorResponse(result.textcode || "Failed to process inbound EDI", 400);
          const processedCount = typeof result === "number" ? result : result?.processed || 0;
          return successResponse(
            { processed: true, accountId, count: processedCount },
            "Processed " + processedCount + " inbound EDI message(s)"
          );
        } catch (_error: unknown) {
          return errorResponse("Failed to process inbound EDI", 500);
        }
      }
      case "retry_message": {
        const { messageId } = body;
        if (!messageId) return errorResponse("Message ID required", 400);
        try {
          const response = await callOpenSRF("open-ils.acq", "open-ils.acq.edi_message.retry", [
            authtoken,
            messageId,
          ]);
          const result = response?.payload?.[0];
          if (result?.ilsevent)
            return errorResponse(result.textcode || "Failed to retry EDI message", 400);
          return successResponse({ retried: true, messageId }, "EDI message queued for retry");
        } catch (_error: unknown) {
          return errorResponse("Failed to retry EDI message", 500);
        }
      }
      case "test_connection": {
        const { accountId } = body;
        if (!accountId) return errorResponse("Account ID required", 400);
        try {
          const response = await callOpenSRF("open-ils.acq", "open-ils.acq.edi_account.test", [
            authtoken,
            accountId,
          ]);
          const result = response?.payload?.[0];
          if (result?.ilsevent || result === false)
            return errorResponse(result?.textcode || "Connection test failed", 400);
          return successResponse({ success: true, accountId }, "Connection test successful");
        } catch (_error: unknown) {
          return errorResponse("Connection test failed", 500);
        }
      }
      default:
        return errorResponse("Invalid action", 400);
    }
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AuthenticationError")
      return errorResponse("Authentication required", 401);
    if (err instanceof Error && err.name === "PermissionError")
      return errorResponse("Permission denied", 403);
    return serverErrorResponse(err, "EDI POST", req);
  }
}
