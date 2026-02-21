export interface PatronDetails {
  id: number;
  barcode: string;
  first_given_name: string;
  family_name: string;
  email?: string;
  day_phone?: string;
  home_ou?: number;
  profile?: any;
  active: boolean;
  barred: boolean;
  expire_date?: string;
  standing_penalties?: any[];
}

export interface CheckoutRow {
  id: string | number;
  title: string;
  barcode: string;
  dueDate?: string;
  status: string;
}

export interface HoldRow {
  id: number;
  title: string;
  author?: string;
  status: string;
  pickupLib?: number;
  requestTime?: string;
}

export interface BillRow {
  id: number;
  title: string;
  amount: number;
  balance: number;
  billedDate?: string;
}

export interface PatronNote {
  id: number;
  title: string;
  value: string;
  public: boolean;
  createDate?: string;
  creator?: number;
}

export interface PenaltyType {
  id: number;
  name: string;
  label: string;
  blockList: string;
}

export type RecordPresence = {
  actorName: string | null;
  activity: "viewing" | "editing";
  lastSeenAt: string;
};

export type RecordTask = {
  id: number;
  title: string;
  body: string | null;
  status: "open" | "done" | "canceled";
  createdAt: string;
};

export function toDateLabel(value?: string) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString();
}

