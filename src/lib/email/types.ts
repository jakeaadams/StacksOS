/**
 * Email notification types and interfaces
 */

export type NoticeType =
  | "hold_ready"
  | "overdue"
  | "pre_overdue"
  | "card_expiration"
  | "fine_bill";

export interface EmailRecipient {
  email: string;
  name?: string;
}

export interface EmailOptions {
  to: EmailRecipient;
  subject: string;
  html: string;
  text?: string;
  from?: EmailRecipient;
  replyTo?: EmailRecipient;
}

export interface NoticeContext {
  patron: {
    id: number;
    firstName: string;
    lastName: string;
    email: string;
    barcode?: string;
  };
  library: {
    name: string;
    phone?: string;
    email?: string;
    website?: string;
  };
  items?: Array<{
    title: string;
    author?: string;
    barcode: string;
    dueDate?: string;
    callNumber?: string;
  }>;
  holds?: Array<{
    id: number;
    title: string;
    author?: string;
    pickupLibrary: string;
    expirationDate?: string;
    shelfExpireTime?: string;
  }>;
  bills?: Array<{
    id: number;
    title: string;
    amount: number;
    balance: number;
    billedDate?: string;
  }>;
  expirationDate?: string;
  unsubscribeUrl?: string;
  preferencesUrl?: string;
}

export interface NoticePreferences {
  patronId: number;
  holdReady: boolean;
  overdue: boolean;
  preOverdue: boolean;
  cardExpiration: boolean;
  fineBill: boolean;
  emailEnabled: boolean;
}

export interface NoticeHistoryRecord {
  id?: number;
  patronId: number;
  noticeType: NoticeType;
  recipient: string;
  subject: string;
  status: "sent" | "failed" | "pending";
  error?: string;
  sentAt?: Date;
  createdAt: Date;
}
