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

export interface GoogleBooksSearchItem {
  id: string;
  title: string | null;
  authors: string[];
  publishedDate: string | null;
  thumbnail: string | null;
  image: string | null;
  previewLink: string | null;
  infoLink: string | null;
}

function normalizeGoogleImageUrl(url: unknown): string | null {
  if (typeof url !== "string" || !url.trim()) return null;
  return url.replace(/^http:/, "https:");
}

function upgradeGoogleImageZoom(url: string | null): string | null {
  if (!url) return null;
  return url.replace(/([?&]zoom=)(\\d+)/, (_match, prefix: string) => `${prefix}2`);
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

async function searchGoogleBooks(query: string, maxResults: number, startIndex: number): Promise<{
  totalItems: number;
  items: GoogleBooksSearchItem[];
}> {
  const safeMaxResults = Math.max(1, Math.min(maxResults || 8, 12));
  const safeStartIndex = Math.max(0, Math.min(startIndex || 0, 200));
  const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=${safeMaxResults}&startIndex=${safeStartIndex}`;

  const res = await fetch(url, {
    next: { revalidate: 86400 }, // Cache for 24 hours
  });

  if (!res.ok) {
    throw new Error(`Google Books HTTP error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  const totalItems = typeof data?.totalItems === "number" ? data.totalItems : 0;
  const rawItems = Array.isArray(data?.items) ? data.items : [];

  const items: GoogleBooksSearchItem[] = rawItems
    .map((book: any) => {
      const volumeInfo = book?.volumeInfo || {};
      const imageLinks = volumeInfo?.imageLinks || {};

      const thumbnail =
        normalizeGoogleImageUrl(imageLinks.smallThumbnail) ||
        normalizeGoogleImageUrl(imageLinks.thumbnail);

      const image =
        upgradeGoogleImageZoom(normalizeGoogleImageUrl(imageLinks.thumbnail)) ||
        upgradeGoogleImageZoom(normalizeGoogleImageUrl(imageLinks.smallThumbnail));

      return {
        id: typeof book?.id === "string" ? book.id : "",
        title: typeof volumeInfo?.title === "string" ? volumeInfo.title : null,
        authors: Array.isArray(volumeInfo?.authors) ? volumeInfo.authors.filter(Boolean) : [],
        publishedDate: typeof volumeInfo?.publishedDate === "string" ? volumeInfo.publishedDate : null,
        thumbnail,
        image,
        previewLink: typeof volumeInfo?.previewLink === "string" ? volumeInfo.previewLink : null,
        infoLink: typeof volumeInfo?.infoLink === "string" ? volumeInfo.infoLink : null,
      };
    })
    .filter((item: GoogleBooksSearchItem) => item.thumbnail || item.image);

  return { totalItems, items };
}

// GET /api/google-books?isbn=9780123456789
// GET /api/google-books?isbns=9780123456789,9780987654321 (batch)
// GET /api/google-books?q=intitle:...&maxResults=8&startIndex=0 (search)
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

  const q = searchParams.get("q");
  if (q) {
    try {
      const maxResults = parseInt(searchParams.get("maxResults") || "8", 10);
      const startIndex = parseInt(searchParams.get("startIndex") || "0", 10);

      const result = await searchGoogleBooks(q, maxResults, startIndex);
      return NextResponse.json({ ok: true, query: q, ...result });
    } catch (error) {
      logger.error({ error: String(error), query: q }, "Error searching Google Books");
      return NextResponse.json(
        { ok: false, error: "Failed to search Google Books" },
        { status: 502 }
      );
    }
  }
  
  return NextResponse.json(
    { error: "Missing isbn or isbns parameter" },
    { status: 400 }
  );
}
