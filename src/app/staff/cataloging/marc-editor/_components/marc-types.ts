export interface MarcField {
  tag: string;
  ind1: string;
  ind2: string;
  subfields: { code: string; value: string }[];
}

export interface MarcRecord {
  leader: string;
  fields: MarcField[];
}

export type AiCatalogingSuggestion = {
  id: string;
  type: "subject" | "summary" | "series";
  confidence: number;
  message: string;
  suggestedValue: string;
  provenance?: string[];
};

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

export type FixedFieldOption = {
  value: string;
  label: string;
};

export type IndicatorRule = {
  ind1: string[];
  ind2: string[];
};
