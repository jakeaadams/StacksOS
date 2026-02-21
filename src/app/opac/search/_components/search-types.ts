export interface SearchResult {
  id: number;
  title: string;
  author?: string;
  coverUrl?: string;
  publicationYear?: number;
  summary?: string;
  subjects?: string[];
  isbn?: string;
  formats: import("@/components/opac/book-card").BookFormat[];
  availableCopies: number;
  totalCopies: number;
  holdCount: number;
  rating?: number;
  reviewCount?: number;
  rankingReason?: string;
  rankingScore?: number;
  aiExplanation?: string;
}

export interface FacetValue {
  value: string;
  count: number;
}

export interface FacetGroup {
  field: string;
  label: string;
  values: FacetValue[];
}
