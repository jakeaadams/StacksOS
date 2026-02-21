export interface RecordDetail {
  id: number;
  tcn: string;
  title: string;
  author?: string;
  contributors?: string[];
  isbn?: string;
  issn?: string;
  upc?: string;
  publisher?: string;
  pubdate?: string;
  edition?: string;
  physicalDescription?: string;
  language?: string;
  subjects?: string[];
  summary?: string;
  series?: string;
  format?: string;
  notes?: string[];
  createDate?: string;
  editDate?: string;
  holdCount?: number;
  marcXml?: string;
}

export interface CopyInfo {
  id: number;
  barcode: string;
  status: string;
  statusId: number;
  location: string;
  locationId?: number;
  circLib: string;
  callNumber: string;
  dueDate?: string;
  holdable: boolean;
  circulate: boolean;
}

export interface HoldingsSummary {
  library: string;
  location: string;
  callNumber: string;
  totalCopies: number;
  availableCopies: number;
}

export interface TitleHold {
  id: number;
  queuePosition?: number;
  status?: string | number;
  requestTime?: string;
  pickupLib?: number;
  patronName?: string;
  patronBarcode?: string;
}

export interface MarcControlField {
  tag: string;
  value: string;
}

export interface MarcDataField {
  tag: string;
  ind1: string;
  ind2: string;
  subfields: Array<{ code: string; value: string }>;
}

export interface ParsedMarcRecord {
  leader: string;
  controlFields: MarcControlField[];
  dataFields: MarcDataField[];
  field008: string;
}

export interface FixedFieldRow {
  position: string;
  label: string;
  value: string;
  note: string;
}

export interface CopyLocationOption {
  id: number;
  name: string;
}

export interface CopyStatusOption {
  id: number;
  name: string;
}
