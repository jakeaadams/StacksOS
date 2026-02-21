export interface Hold {
  id: number;
  holdType: string;
  target: number;
  requestTime: string;
  captureTime?: string;
  fulfillmentTime?: string;
  expireTime?: string;
  pickupLib: number;
  frozen: boolean;
  frozenUntil?: string;
  shelfExpireTime?: string;
  currentCopy?: number;
  title: string;
  author?: string;
  status?: number;
  queuePosition?: number;
  potentialCopies?: number;

  // Shelf/expired enrichment (from holds shelf endpoints)
  patronName?: string;
  patronBarcode?: string;
  itemBarcode?: string;
  callNumber?: string;
}

export interface PullListItem {
  hold_id: number;
  copy_id: number;
  title: string;
  author: string;
  call_number: string;
  barcode: string;
  shelving_location: string;
  patron_barcode: string;
}

export type TabKey = "patron" | "title" | "pull" | "shelf" | "expired";
