/**
 * Recent Search History Unit Tests
 *
 * Tests localStorage-backed search history with deduplication,
 * ordering, max-items cap, and SSR safety.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getRecentSearches,
  addRecentSearch,
  removeRecentSearch,
  clearRecentSearches,
} from "@/lib/search-history";

const STORAGE_KEY = "stacksos_recent_searches";

// Provide a real localStorage mock since jsdom's may be incomplete
const store = new Map<string, string>();
const localStorageMock: Storage = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => {
    store.set(key, value);
  },
  removeItem: (key: string) => {
    store.delete(key);
  },
  clear: () => store.clear(),
  get length() {
    return store.size;
  },
  key: (index: number) => [...store.keys()][index] ?? null,
};

vi.stubGlobal("localStorage", localStorageMock);

describe("Search History", () => {
  beforeEach(() => {
    store.clear();
  });

  // ── getRecentSearches ──────────────────────────────────────────────
  describe("getRecentSearches", () => {
    it("returns empty array when nothing stored", () => {
      expect(getRecentSearches()).toEqual([]);
    });

    it("returns stored searches", () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(["foo", "bar"]));
      expect(getRecentSearches()).toEqual(["foo", "bar"]);
    });

    it("filters non-string values", () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(["valid", 42, null, "also valid"]));
      expect(getRecentSearches()).toEqual(["valid", "also valid"]);
    });

    it("handles corrupt JSON gracefully", () => {
      localStorage.setItem(STORAGE_KEY, "not json{{");
      expect(getRecentSearches()).toEqual([]);
    });
  });

  // ── addRecentSearch ────────────────────────────────────────────────
  describe("addRecentSearch", () => {
    it("adds a term to the list", () => {
      addRecentSearch("cats");
      expect(getRecentSearches()).toEqual(["cats"]);
    });

    it("newest search appears first", () => {
      addRecentSearch("first");
      addRecentSearch("second");
      expect(getRecentSearches()).toEqual(["second", "first"]);
    });

    it("deduplicates case-insensitively", () => {
      addRecentSearch("Cats");
      addRecentSearch("cats");
      const result = getRecentSearches();
      expect(result).toEqual(["cats"]);
    });

    it("caps at 10 items", () => {
      for (let i = 1; i <= 15; i++) {
        addRecentSearch(`search-${i}`);
      }
      const result = getRecentSearches();
      expect(result).toHaveLength(10);
      expect(result[0]).toBe("search-15");
      expect(result[9]).toBe("search-6");
    });

    it("ignores empty or whitespace-only strings", () => {
      addRecentSearch("");
      addRecentSearch("   ");
      expect(getRecentSearches()).toEqual([]);
    });

    it("trims whitespace from terms", () => {
      addRecentSearch("  hello world  ");
      expect(getRecentSearches()).toEqual(["hello world"]);
    });
  });

  // ── removeRecentSearch ─────────────────────────────────────────────
  describe("removeRecentSearch", () => {
    it("removes a specific term", () => {
      addRecentSearch("alpha");
      addRecentSearch("beta");
      removeRecentSearch("alpha");
      expect(getRecentSearches()).toEqual(["beta"]);
    });

    it("removes case-insensitively", () => {
      addRecentSearch("Mystery Novels");
      removeRecentSearch("mystery novels");
      expect(getRecentSearches()).toEqual([]);
    });

    it("does nothing if term not found", () => {
      addRecentSearch("existing");
      removeRecentSearch("nonexistent");
      expect(getRecentSearches()).toEqual(["existing"]);
    });
  });

  // ── clearRecentSearches ────────────────────────────────────────────
  describe("clearRecentSearches", () => {
    it("removes all recent searches", () => {
      addRecentSearch("one");
      addRecentSearch("two");
      clearRecentSearches();
      expect(getRecentSearches()).toEqual([]);
    });

    it("works when already empty", () => {
      clearRecentSearches();
      expect(getRecentSearches()).toEqual([]);
    });
  });
});
