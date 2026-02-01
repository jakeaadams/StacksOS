/**
 * Smart Search Detection
 * 
 * Auto-detects search type based on query pattern:
 * - ISBN-10: 10 digits (may have X at end)
 * - ISBN-13: 13 digits starting with 978 or 979
 * - Barcode: 8-14 digits (library barcodes)
 * - Email: contains @
 * - Phone: 10+ digits with optional formatting
 */

export type SearchContext = "patron" | "catalog" | "item" | "general";

export interface SmartSearchResult {
  type: string;
  query: string;
  confidence: "high" | "medium" | "low";
}

// ISBN-10: 10 chars, last can be X
const ISBN10_REGEX = /^\d{9}[\dXx]$/;
// ISBN-13: 13 digits, starts with 978 or 979
const ISBN13_REGEX = /^97[89]\d{10}$/;
// Library barcode: typically 8-14 digits
const BARCODE_REGEX = /^\d{8,14}$/;
// Email pattern
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Phone: 10+ digits, may have formatting
const PHONE_REGEX = /^[\d\s\-\(\)\.\+]{10,}$/;
// Call number pattern (letters followed by numbers, or LC/Dewey style)
const CALL_NUMBER_REGEX = /^[A-Z]{1,3}\s*\d|^\d{3}(\.\d+)?/i;

export function detectSearchType(query: string, context: SearchContext = "general"): SmartSearchResult {
  const trimmed = query.trim();
  const digitsOnly = trimmed.replace(/[\s\-]/g, "");
  
  // Check for ISBN first (most specific)
  if (ISBN13_REGEX.test(digitsOnly)) {
    return { type: "isbn", query: digitsOnly, confidence: "high" };
  }
  if (ISBN10_REGEX.test(digitsOnly)) {
    return { type: "isbn", query: digitsOnly, confidence: "high" };
  }
  
  // Check for email
  if (EMAIL_REGEX.test(trimmed)) {
    return { type: "email", query: trimmed, confidence: "high" };
  }
  
  // Context-specific detection
  if (context === "patron") {
    // For patron search: barcode vs name vs phone
    if (BARCODE_REGEX.test(digitsOnly)) {
      return { type: "barcode", query: digitsOnly, confidence: "high" };
    }
    if (PHONE_REGEX.test(trimmed) && digitsOnly.length >= 10) {
      return { type: "phone", query: trimmed, confidence: "medium" };
    }
    return { type: "name", query: trimmed, confidence: "low" };
  }
  
  if (context === "catalog" || context === "item") {
    // For catalog: ISBN, barcode, call number, or keyword
    if (BARCODE_REGEX.test(digitsOnly)) {
      // Could be ISBN or item barcode - try ISBN first for catalog
      return { type: context === "catalog" ? "isbn" : "barcode", query: digitsOnly, confidence: "medium" };
    }
    if (CALL_NUMBER_REGEX.test(trimmed)) {
      return { type: "callnumber", query: trimmed, confidence: "medium" };
    }
    return { type: "keyword", query: trimmed, confidence: "low" };
  }
  
  // General/fallback
  if (BARCODE_REGEX.test(digitsOnly)) {
    return { type: "identifier", query: digitsOnly, confidence: "medium" };
  }
  
  return { type: "keyword", query: trimmed, confidence: "low" };
}

/**
 * Get the effective search type for an API call
 */
export function getEffectiveSearchType(
  query: string, 
  manualType: string, 
  context: SearchContext = "general"
): string {
  // If user explicitly selected a type, respect it
  if (manualType && manualType !== "auto" && manualType !== "keyword" && manualType !== "name") {
    return manualType;
  }
  
  const detected = detectSearchType(query, context);
  
  // Only override if we have high/medium confidence
  if (detected.confidence === "high" || detected.confidence === "medium") {
    return detected.type;
  }
  
  return manualType || "keyword";
}
