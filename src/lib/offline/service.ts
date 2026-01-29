/**
 * StacksOS Offline Circulation Service
 * Handles offline circulation operations and sync
 */

import { offlineDB, OfflineTransaction, OfflineSession } from "./db";
import { clientLogger } from "@/lib/client-logger";

export interface OfflineCheckoutResult {
  success: boolean;
  message: string;
  blocked?: boolean;
  blockReason?: string;
  transactionId?: string;
  dueDate?: string;
}

export interface SyncResult {
  success: boolean;
  message: string;
  processed: number;
  errors: number;
  exceptions: Array<{ transactionId: string; error: string }>;
}

class OfflineCirculationService {
  private isOnline: boolean = true;
  private listeners: Set<(online: boolean) => void> = new Set();

  constructor() {
    if (typeof window !== "undefined") {
      this.isOnline = navigator.onLine;
      window.addEventListener("online", () => this.setOnlineStatus(true));
      window.addEventListener("offline", () => this.setOnlineStatus(false));
    }
  }

  private setOnlineStatus(online: boolean) {
    this.isOnline = online;
    this.listeners.forEach(listener => listener(online));
  }

  onOnlineStatusChange(callback: (online: boolean) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  getOnlineStatus(): boolean {
    return this.isOnline;
  }

  // Generate unique transaction ID
  private generateId(): string {
    return `tx-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  // Calculate due date based on loan period
  private calculateDueDate(daysFromNow: number = 21): string {
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + daysFromNow);
    dueDate.setHours(23, 59, 59, 0);
    return dueDate.toISOString();
  }

  // Offline Checkout
  async checkout(
    patronBarcode: string,
    itemBarcode: string,
    customDueDate?: string,
    overrideBlock: boolean = false
  ): Promise<OfflineCheckoutResult> {
    // Check if patron is blocked
    if (!overrideBlock) {
      const block = await offlineDB.isPatronBlocked(patronBarcode);
      if (block) {
        return {
          success: false,
          message: "Patron is blocked",
          blocked: true,
          blockReason: block.blockReason,
        };
      }
    }

    // Get patron info from cache for validation
    const patron = await offlineDB.getPatronByBarcode(patronBarcode);
    if (!patron) {
      // Allow checkout even if patron not in cache, but warn
      clientLogger.warn("Patron not found in offline cache - proceeding anyway");
    }

    // Calculate due date
    let dueDate = customDueDate;
    if (!dueDate) {
      const loanPeriod = patron 
        ? await offlineDB.getLoanPeriod(patron.patronType)
        : 21;
      dueDate = this.calculateDueDate(loanPeriod);
    }

    const transaction: OfflineTransaction = {
      id: this.generateId(),
      type: "checkout",
      timestamp: new Date(),
      workstation: this.getWorkstation(),
      staffUsername: this.getStaffUsername(),
      data: {
        patronBarcode,
        itemBarcode,
        dueDate,
      },
      status: "pending",
    };

    await offlineDB.addTransaction(transaction);

    return {
      success: true,
      message: "Checkout recorded for offline processing",
      transactionId: transaction.id,
      dueDate,
    };
  }

  // Offline Checkin
  async checkin(
    itemBarcode: string,
    backdateDate?: string
  ): Promise<OfflineCheckoutResult> {
    const transaction: OfflineTransaction = {
      id: this.generateId(),
      type: "checkin",
      timestamp: new Date(),
      workstation: this.getWorkstation(),
      staffUsername: this.getStaffUsername(),
      data: {
        itemBarcode,
        backdateDate,
      },
      status: "pending",
    };

    await offlineDB.addTransaction(transaction);

    return {
      success: true,
      message: "Checkin recorded for offline processing",
      transactionId: transaction.id,
    };
  }

  // Offline Renewal
  async renew(
    itemBarcode: string,
    patronBarcode?: string
  ): Promise<OfflineCheckoutResult> {
    const transaction: OfflineTransaction = {
      id: this.generateId(),
      type: "renewal",
      timestamp: new Date(),
      workstation: this.getWorkstation(),
      staffUsername: this.getStaffUsername(),
      data: {
        itemBarcode,
        patronBarcode,
      },
      status: "pending",
    };

    await offlineDB.addTransaction(transaction);

    return {
      success: true,
      message: "Renewal recorded for offline processing",
      transactionId: transaction.id,
    };
  }

  // In-House Use
  async recordInHouseUse(
    itemBarcode: string,
    count: number = 1
  ): Promise<OfflineCheckoutResult> {
    const transaction: OfflineTransaction = {
      id: this.generateId(),
      type: "in_house_use",
      timestamp: new Date(),
      workstation: this.getWorkstation(),
      staffUsername: this.getStaffUsername(),
      data: {
        itemBarcode,
        count,
      },
      status: "pending",
    };

    await offlineDB.addTransaction(transaction);

    return {
      success: true,
      message: `In-house use recorded (${count})`,
      transactionId: transaction.id,
    };
  }

  // Download block list from server
  async downloadBlockList(): Promise<{ success: boolean; count: number; error?: string }> {
    try {
      const res = await fetch("/api/evergreen/offline?type=blocks");
      const data = await res.json();

      if (data.ok && data.blocks) {
        await offlineDB.setBlockList(data.blocks);
        await offlineDB.setSyncStatus("blockList", data.blocks.length);
        return { success: true, count: data.blocks.length };
      } else {
        return { success: false, count: 0, error: data.error || "Failed to download block list" };
      }
    } catch (_error) {
      return { success: false, count: 0, error: "Network error - cannot download block list" };
    }
  }

  // Download patron cache from server
  async downloadPatronCache(): Promise<{ success: boolean; count: number; error?: string }> {
    try {
      const res = await fetch("/api/evergreen/offline?type=patrons");
      const data = await res.json();

      if (data.ok && data.patrons) {
        await offlineDB.cachePatrons(data.patrons);
        await offlineDB.setSyncStatus("patrons", data.patrons.length);
        return { success: true, count: data.patrons.length };
      } else {
        return { success: false, count: 0, error: data.error || "Failed to download patron data" };
      }
    } catch (_error) {
      return { success: false, count: 0, error: "Network error - cannot download patron data" };
    }
  }

  // Download loan policies
  async downloadLoanPolicies(): Promise<{ success: boolean; count: number; error?: string }> {
    try {
      const res = await fetch("/api/evergreen/offline?type=policies");
      const data = await res.json();

      if (data.ok && data.policies) {
        await offlineDB.setLoanPolicies(data.policies);
        await offlineDB.setSyncStatus("loanPolicies", data.policies.length);
        return { success: true, count: data.policies.length };
      } else {
        return { success: false, count: 0, error: data.error || "Failed to download loan policies" };
      }
    } catch (_error) {
      return { success: false, count: 0, error: "Network error - cannot download loan policies" };
    }
  }

  // Download all offline data
  async downloadAllOfflineData(): Promise<{
    blockList: { success: boolean; count: number; error?: string };
    patrons: { success: boolean; count: number; error?: string };
    policies: { success: boolean; count: number; error?: string };
  }> {
    const [blockList, patrons, policies] = await Promise.all([
      this.downloadBlockList(),
      this.downloadPatronCache(),
      this.downloadLoanPolicies(),
    ]);

    return { blockList, patrons, policies };
  }

  // Upload pending transactions to server
  async uploadTransactions(): Promise<SyncResult> {
    const pending = await offlineDB.getTransactions("pending");

    if (pending.length === 0) {
      return {
        success: true,
        message: "No pending transactions to upload",
        processed: 0,
        errors: 0,
        exceptions: [],
      };
    }

    let processed = 0;
    let errors = 0;
    const exceptions: Array<{ transactionId: string; error: string }> = [];

    for (const tx of pending) {
      try {
        const res = await fetch("/api/evergreen/offline", {
          method: "POST",
        credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(tx),
        });

        const result = await res.json();

        if (result.ok) {
          await offlineDB.updateTransactionStatus(tx.id, "processed");
          processed++;
        } else {
          await offlineDB.updateTransactionStatus(tx.id, "error", result.error);
          errors++;
          exceptions.push({ transactionId: tx.id, error: result.error || "Unknown error" });
        }
      } catch (_error) {
        await offlineDB.updateTransactionStatus(tx.id, "error", "Upload failed - network error");
        errors++;
        exceptions.push({ transactionId: tx.id, error: "Network error" });
      }
    }

    return {
      success: errors === 0,
      message: `Processed ${processed} transactions with ${errors} errors`,
      processed,
      errors,
      exceptions,
    };
  }

  // Get sync status
  async getSyncStatus(): Promise<{
    blockList: { lastSync: Date | null; count: number };
    patrons: { lastSync: Date | null; count: number };
    policies: { lastSync: Date | null; count: number };
    pendingTransactions: number;
  }> {
    const [blockListStatus, patronsStatus, policiesStatus, pendingCount] = await Promise.all([
      offlineDB.getSyncStatus("blockList"),
      offlineDB.getSyncStatus("patrons"),
      offlineDB.getSyncStatus("loanPolicies"),
      offlineDB.getPendingCount(),
    ]);

    return {
      blockList: {
        lastSync: blockListStatus?.lastSync || null,
        count: blockListStatus?.recordCount || 0,
      },
      patrons: {
        lastSync: patronsStatus?.lastSync || null,
        count: patronsStatus?.recordCount || 0,
      },
      policies: {
        lastSync: policiesStatus?.lastSync || null,
        count: policiesStatus?.recordCount || 0,
      },
      pendingTransactions: pendingCount,
    };
  }

  // Get pending transactions
  async getPendingTransactions(): Promise<OfflineTransaction[]> {
    return offlineDB.getTransactions("pending");
  }

  // Get all transactions
  async getAllTransactions(): Promise<OfflineTransaction[]> {
    return offlineDB.getTransactions();
  }

  // Clear processed transactions
  async clearProcessed(): Promise<void> {
    return offlineDB.clearProcessedTransactions();
  }

  // Session management
  async createSession(name: string): Promise<OfflineSession> {
    const session: OfflineSession = {
      id: `session-${Date.now()}`,
      name,
      createdAt: new Date(),
      createdBy: this.getStaffUsername(),
      workstation: this.getWorkstation(),
      transactionCount: 0,
      status: "active",
    };

    await offlineDB.createSession(session);
    return session;
  }

  async getSessions(): Promise<OfflineSession[]> {
    return offlineDB.getSessions();
  }

  // Helpers
  private getWorkstation(): string {
    if (typeof window !== "undefined") {
      return localStorage.getItem("stacksos_workstation") || "OFFLINE-WS";
    }
    return "OFFLINE-WS";
  }

  private getStaffUsername(): string {
    if (typeof window !== "undefined") {
      return localStorage.getItem("stacksos_username") || "offline-staff";
    }
    return "offline-staff";
  }
}

// Singleton instance
export const offlineService = new OfflineCirculationService();
