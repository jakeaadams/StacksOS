import { NextRequest } from "next/server";
import {
  callOpenSRF,
  successResponse,
  errorResponse,
  serverErrorResponse,
  unauthorizedResponse,
} from "@/lib/api";
import { logger } from "@/lib/logger";
import { cookies } from "next/headers";

/**
 * OPAC Patron Messages
 * GET /api/opac/messages - Get patron messages from Evergreen
 * POST /api/opac/messages - Mark messages as read
 * 
 * Uses Evergreen open-ils.actor service for message operations
 */

export async function GET(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const patronToken = cookieStore.get("patron_authtoken")?.value;
    const patronId = cookieStore.get("patron_id")?.value;

    if (!patronToken || !patronId) {
      return unauthorizedResponse("Please log in to view messages");
    }

    // Verify session is still valid
    const sessionResponse = await callOpenSRF(
      "open-ils.auth",
      "open-ils.auth.session.retrieve",
      [patronToken]
    );

    const user = sessionResponse?.payload?.[0];
    if (!user || user.ilsevent) {
      return unauthorizedResponse("Session expired. Please log in again.");
    }

    // Retrieve patron messages using open-ils.actor
    // Evergreen stores messages in actor.usr_message table
    const messagesResponse = await callOpenSRF(
      "open-ils.actor",
      "open-ils.actor.message.retrieve",
      [patronToken, parseInt(patronId)]
    );

    const messagesData = messagesResponse?.payload?.[0];
    const rawMessages = Array.isArray(messagesData) ? messagesData : [];

    // Transform messages to our format
    const messages = rawMessages.map((msg: Record<string, unknown>) => ({
      id: msg.id,
      title: msg.title || "Library Message",
      content: msg.message || msg.content || "",
      sendingLibrary: msg.sending_lib_name || msg.sending_lib || "Library",
      sendingLibraryId: msg.sending_lib,
      isRead: msg.read_date !== null,
      readDate: msg.read_date,
      createDate: msg.create_date,
      deleteDate: msg.deleted,
      isDeleted: msg.deleted !== null,
      // Message types: general, holds, fines, account
      messageType: msg.pub === "t" ? "general" : determineMessageType(msg),
    }));

    // Filter out deleted messages and sort by date (newest first)
    const activeMessages = messages
      .filter((m: Record<string, unknown>) => !m.isDeleted)
      .sort((a: Record<string, unknown>, b: Record<string, unknown>) => 
        new Date(b.createDate).getTime() - new Date(a.createDate).getTime()
      );

    const unreadCount = activeMessages.filter((m: Record<string, unknown>) => !m.isRead).length;

    return successResponse({
      messages: activeMessages,
      total: activeMessages.length,
      unreadCount,
    });
  } catch (error) {
    logger.error({ error: String(error) }, "Error fetching patron messages");
    return serverErrorResponse(error, "Failed to fetch messages");
  }
}

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const patronToken = cookieStore.get("patron_authtoken")?.value;

    if (!patronToken) {
      return unauthorizedResponse("Please log in to manage messages");
    }

    const { action, messageIds } = await req.json();

    if (!action) {
      return errorResponse("Action is required", 400);
    }

    if (!messageIds || !Array.isArray(messageIds) || messageIds.length === 0) {
      return errorResponse("Message IDs are required", 400);
    }

    // Process each message based on action
    const results = await Promise.all(
      messageIds.map(async (messageId: number) => {
        try {
          if (action === "mark_read") {
            // Mark message as read
            const readResponse = await callOpenSRF(
              "open-ils.actor",
              "open-ils.actor.message.read",
              [patronToken, messageId]
            );

            const result = readResponse?.payload?.[0];
            if (result?.ilsevent) {
              return { id: messageId, success: false, error: result.textcode };
            }
            return { id: messageId, success: true };
          } else if (action === "mark_unread") {
            // Mark message as unread (if supported)
            const unreadResponse = await callOpenSRF(
              "open-ils.actor",
              "open-ils.actor.message.unread",
              [patronToken, messageId]
            );

            const result = unreadResponse?.payload?.[0];
            if (result?.ilsevent) {
              return { id: messageId, success: false, error: result.textcode };
            }
            return { id: messageId, success: true };
          } else if (action === "delete") {
            // Delete message
            const deleteResponse = await callOpenSRF(
              "open-ils.actor",
              "open-ils.actor.message.delete",
              [patronToken, messageId]
            );

            const result = deleteResponse?.payload?.[0];
            if (result?.ilsevent) {
              return { id: messageId, success: false, error: result.textcode };
            }
            return { id: messageId, success: true };
          } else {
            return { id: messageId, success: false, error: "Unknown action" };
          }
        } catch (err) {
          return { id: messageId, success: false, error: String(err) };
        }
      })
    );

    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;

    return successResponse({
      success: failureCount === 0,
      processed: results.length,
      successCount,
      failureCount,
      results,
    });
  } catch (error) {
    logger.error({ error: String(error) }, "Error processing message action");
    return serverErrorResponse(error, "Failed to process message action");
  }
}

// Helper function to determine message type based on content/context
function determineMessageType(msg: Record<string, unknown>): string {
  const title = (msg.title || "").toLowerCase();
  const content = (msg.message || msg.content || "").toLowerCase();
  
  if (title.includes("hold") || content.includes("hold")) {
    return "holds";
  }
  if (title.includes("fine") || title.includes("fee") || content.includes("fine") || content.includes("fee")) {
    return "fines";
  }
  if (title.includes("account") || title.includes("card") || content.includes("account")) {
    return "account";
  }
  return "general";
}
