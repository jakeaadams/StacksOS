import { logger } from "@/lib/logger";
import { NextRequest, NextResponse } from "next/server";

/**
 * Google Books API Integration
 * Fetches book ratings and supplemental metadata from Google Books
 * Free API - no key required for basic usage (rate limited)
 */

export interface GoogleBookData {
  isbn: string;
  averageRating: number | null;
  ratingsCount: number | null;
  thumbnail: string | null;
  description: string | null;
  previewLink: string | null;
}

async function fetchGoogleBook(isbn: string): Promise<GoogleBookData | null> {
  try {
    const url = `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}&maxResults=1`;
    const res = await fetch(url, { 
      next: { revalidate: 86400 } // Cache for 24 hours
    });
    
    if (!res.ok) return null;
    
    const data = await res.json();
    
    if (!data.items || data.items.length === 0) {
      return null;
    }
    
    const book = data.items[0];
    const volumeInfo = book.volumeInfo || {};
    
    return {
      isbn,
      averageRating: volumeInfo.averageRating ?? null,
      ratingsCount: volumeInfo.ratingsCount ?? null,
      thumbnail: volumeInfo.imageLinks?.thumbnail ?? null,
      description: volumeInfo.description ?? null,
      previewLink: volumeInfo.previewLink ?? null,
    };
  } catch (error) {
    logger.error({ error: String(error), isbn }, "Error fetching Google Books data");
    return null;
  }
}

// GET /api/google-books?isbn=9780123456789
// GET /api/google-books?isbns=9780123456789,9780987654321 (batch)
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  
  // Single ISBN
  const isbn = searchParams.get("isbn");
  if (isbn) {
    const data = await fetchGoogleBook(isbn.replace(/-/g, ""));
    return NextResponse.json(data);
  }
  
  // Batch ISBNs (comma-separated)
  const isbns = searchParams.get("isbns");
  if (isbns) {
    const isbnList = isbns.split(",").map((i) => i.trim().replace(/-/g, "")).filter(Boolean);
    
    // Limit to 20 ISBNs per request to avoid rate limiting
    const limitedList = isbnList.slice(0, 20);
    
    // Fetch in parallel with small delay between requests
    const results: Record<string, GoogleBookData | null> = {};
    
    await Promise.all(
      limitedList.map(async (isbnItem, index) => {
        // Stagger requests slightly to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, index * 100));
        results[isbnItem] = await fetchGoogleBook(isbnItem);
      })
    );
    
    return NextResponse.json(results);
  }
  
  return NextResponse.json(
    { error: "Missing isbn or isbns parameter" },
    { status: 400 }
  );
}
