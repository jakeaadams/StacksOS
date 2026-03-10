export interface CheckinItem {
  id: string;
  barcode: string;
  title: string;
  author: string;
  callNumber: string;
  status: "checkedin" | "hold" | "transit" | "alert" | "error";
  message?: string;
  holdFor?: { name: string; barcode: string };
  transitTo?: string;
  timestamp: Date;
  wasOverdue?: boolean;
  fineAmount?: number;
}
