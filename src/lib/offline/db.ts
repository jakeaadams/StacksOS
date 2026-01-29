/**
 * StacksOS Offline Circulation Database
 * Uses IndexedDB for storing offline transactions and cached data
 */

const DB_NAME = "stacksos-offline";
const DB_VERSION = 1;

export interface OfflineTransaction {
  id: string;
  type: "checkout" | "checkin" | "renewal" | "in_house_use";
  timestamp: Date;
  workstation: string;
  staffUsername: string;
  data: {
    patronBarcode?: string;
    itemBarcode: string;
    dueDate?: string;
    count?: number; // for in-house use
    backdateDate?: string; // for checkin
  };
  status: "pending" | "uploaded" | "processed" | "error";
  errorMessage?: string;
  sessionId?: string;
}

export interface BlockedPatron {
  barcode: string;
  patronId: number;
  name: string;
  blockReason: string;
  blockDate: string;
}

export interface CachedPatron {
  id: number;
  barcode: string;
  firstName: string;
  lastName: string;
  patronType: string;
  homeLibrary: string;
  isActive: boolean;
  hasBlock: boolean;
}

export interface LoanPolicy {
  patronType: string;
  itemType: string;
  loanPeriodDays: number;
  renewalLimit: number;
}

export interface OfflineSession {
  id: string;
  name: string;
  createdAt: Date;
  createdBy: string;
  workstation: string;
  transactionCount: number;
  status: "active" | "uploaded" | "processed";
  processedAt?: Date;
  processedBy?: string;
}

export interface SyncStatus {
  key: string;
  lastSync: Date;
  recordCount: number;
}

class OfflineDB {
  private db: IDBDatabase | null = null;
  private dbPromise: Promise<IDBDatabase> | null = null;

  async init(): Promise<IDBDatabase> {
    if (this.db) return this.db;
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Pending transactions store
        if (!db.objectStoreNames.contains("transactions")) {
          const txStore = db.createObjectStore("transactions", { keyPath: "id" });
          txStore.createIndex("status", "status", { unique: false });
          txStore.createIndex("sessionId", "sessionId", { unique: false });
          txStore.createIndex("timestamp", "timestamp", { unique: false });
        }

        // Block list store
        if (!db.objectStoreNames.contains("blockList")) {
          const blockStore = db.createObjectStore("blockList", { keyPath: "barcode" });
          blockStore.createIndex("patronId", "patronId", { unique: false });
        }

        // Patron cache store
        if (!db.objectStoreNames.contains("patrons")) {
          const patronStore = db.createObjectStore("patrons", { keyPath: "barcode" });
          patronStore.createIndex("id", "id", { unique: true });
          patronStore.createIndex("lastName", "lastName", { unique: false });
        }

        // Loan policies store
        if (!db.objectStoreNames.contains("loanPolicies")) {
          db.createObjectStore("loanPolicies", { keyPath: ["patronType", "itemType"] });
        }

        // Sessions store
        if (!db.objectStoreNames.contains("sessions")) {
          const sessionStore = db.createObjectStore("sessions", { keyPath: "id" });
          sessionStore.createIndex("status", "status", { unique: false });
        }

        // Sync status store
        if (!db.objectStoreNames.contains("syncStatus")) {
          db.createObjectStore("syncStatus", { keyPath: "key" });
        }
      };
    });

    return this.dbPromise;
  }

  // Transaction methods
  async addTransaction(tx: OfflineTransaction): Promise<void> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("transactions", "readwrite");
      const store = transaction.objectStore("transactions");
      const request = store.add(tx);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getTransactions(status?: string): Promise<OfflineTransaction[]> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("transactions", "readonly");
      const store = transaction.objectStore("transactions");
      
      let request: IDBRequest;
      if (status) {
        const index = store.index("status");
        request = index.getAll(status);
      } else {
        request = store.getAll();
      }
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getPendingCount(): Promise<number> {
    const pending = await this.getTransactions("pending");
    return pending.length;
  }

  async updateTransactionStatus(id: string, status: string, errorMessage?: string): Promise<void> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("transactions", "readwrite");
      const store = transaction.objectStore("transactions");
      const getRequest = store.get(id);
      
      getRequest.onsuccess = () => {
        const tx = getRequest.result;
        if (tx) {
          tx.status = status;
          if (errorMessage) tx.errorMessage = errorMessage;
          const putRequest = store.put(tx);
          putRequest.onsuccess = () => resolve();
          putRequest.onerror = () => reject(putRequest.error);
        } else {
          reject(new Error("Transaction not found"));
        }
      };
      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  async clearProcessedTransactions(): Promise<void> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("transactions", "readwrite");
      const store = transaction.objectStore("transactions");
      const index = store.index("status");
      const request = index.openCursor("processed");
      
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        } else {
          resolve();
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  // Block list methods
  async setBlockList(blocks: BlockedPatron[]): Promise<void> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("blockList", "readwrite");
      const store = transaction.objectStore("blockList");
      store.clear();
      blocks.forEach(block => store.add(block));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  async isPatronBlocked(barcode: string): Promise<BlockedPatron | null> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("blockList", "readonly");
      const store = transaction.objectStore("blockList");
      const request = store.get(barcode);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async getBlockListCount(): Promise<number> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("blockList", "readonly");
      const store = transaction.objectStore("blockList");
      const request = store.count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // Patron cache methods
  async cachePatrons(patrons: CachedPatron[]): Promise<void> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("patrons", "readwrite");
      const store = transaction.objectStore("patrons");
      patrons.forEach(patron => store.put(patron));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  async getPatronByBarcode(barcode: string): Promise<CachedPatron | null> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("patrons", "readonly");
      const store = transaction.objectStore("patrons");
      const request = store.get(barcode);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async getPatronCount(): Promise<number> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("patrons", "readonly");
      const store = transaction.objectStore("patrons");
      const request = store.count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // Loan policy methods
  async setLoanPolicies(policies: LoanPolicy[]): Promise<void> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("loanPolicies", "readwrite");
      const store = transaction.objectStore("loanPolicies");
      store.clear();
      policies.forEach(policy => store.add(policy));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  async getLoanPeriod(patronType: string, itemType: string = "default"): Promise<number> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("loanPolicies", "readonly");
      const store = transaction.objectStore("loanPolicies");
      const request = store.get([patronType, itemType]);
      request.onsuccess = () => {
        if (request.result) {
          resolve(request.result.loanPeriodDays);
        } else {
          // Default to 21 days if no policy found
          resolve(21);
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  // Session methods
  async createSession(session: OfflineSession): Promise<void> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("sessions", "readwrite");
      const store = transaction.objectStore("sessions");
      const request = store.add(session);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getSessions(): Promise<OfflineSession[]> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("sessions", "readonly");
      const store = transaction.objectStore("sessions");
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async updateSession(session: OfflineSession): Promise<void> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("sessions", "readwrite");
      const store = transaction.objectStore("sessions");
      const request = store.put(session);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // Sync status methods
  async setSyncStatus(key: string, recordCount: number): Promise<void> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("syncStatus", "readwrite");
      const store = transaction.objectStore("syncStatus");
      const request = store.put({ key, lastSync: new Date(), recordCount });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getSyncStatus(key: string): Promise<SyncStatus | null> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("syncStatus", "readonly");
      const store = transaction.objectStore("syncStatus");
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  // Utility methods
  async clearAll(): Promise<void> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const storeNames = ["transactions", "blockList", "patrons", "loanPolicies", "sessions", "syncStatus"];
      const transaction = db.transaction(storeNames, "readwrite");
      storeNames.forEach(name => transaction.objectStore(name).clear());
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }
}

// Singleton instance
export const offlineDB = new OfflineDB();
