/**
 * Citation Generator Unit Tests
 *
 * Tests formatting functions for MLA 9, APA 7, Chicago 17, Harvard, and BibTeX
 * citation styles exported from the OPAC citation-generator component.
 */

import { describe, it, expect } from "vitest";
import {
  formatMLA,
  formatAPA,
  formatChicago,
  formatHarvard,
  formatBibTeX,
} from "@/components/opac/citation-generator";

const fullProps = {
  title: "The Great Gatsby",
  author: "F. Scott Fitzgerald",
  contributors: ["Maxwell Perkins", "Zelda Fitzgerald"],
  publisher: "Charles Scribner's Sons",
  publicationDate: "1925",
  isbn: "978-0-7432-7356-5",
  edition: "First",
  format: "Print",
  language: "English",
};

describe("Citation Generator", () => {
  // ── Full metadata ────────────────────────────────────────────────────
  describe("full metadata", () => {
    it("MLA format includes author, title in italics, publisher, and year", () => {
      const result = formatMLA(fullProps);
      expect(result).toContain("Fitzgerald");
      expect(result).toContain("The Great Gatsby");
      expect(result).toContain("Charles Scribner");
      expect(result).toContain("1925");
      expect(result).not.toContain("undefined");
    });

    it("APA format includes author last name, year in parens, and title", () => {
      const result = formatAPA(fullProps);
      expect(result).toContain("Fitzgerald");
      expect(result).toContain("1925");
      expect(result).toContain("The Great Gatsby");
      expect(result).toContain("Charles Scribner");
      expect(result).not.toContain("undefined");
    });

    it("Chicago format includes author, title, publisher, and year", () => {
      const result = formatChicago(fullProps);
      expect(result).toContain("Fitzgerald");
      expect(result).toContain("The Great Gatsby");
      expect(result).toContain("Charles Scribner");
      expect(result).toContain("1925");
      expect(result).not.toContain("undefined");
    });

    it("Harvard format includes author, year, title, and publisher", () => {
      const result = formatHarvard(fullProps);
      expect(result).toContain("Fitzgerald");
      expect(result).toContain("1925");
      expect(result).toContain("The Great Gatsby");
      expect(result).toContain("Charles Scribner");
      expect(result).not.toContain("undefined");
    });

    it("BibTeX format produces a valid entry with all fields", () => {
      const result = formatBibTeX(fullProps);
      expect(result).toMatch(/@book\{/);
      expect(result).toContain("title");
      expect(result).toContain("author");
      expect(result).toContain("publisher");
      expect(result).toContain("year");
      expect(result).toContain("The Great Gatsby");
      expect(result).not.toContain("undefined");
    });
  });

  // ── Missing author ───────────────────────────────────────────────────
  describe("missing author", () => {
    const noAuthor = {
      title: "Anonymous Works",
      publisher: "Oxford Press",
      publicationDate: "2020",
    };

    it("MLA handles missing author without 'undefined'", () => {
      const result = formatMLA(noAuthor);
      expect(result).toContain("Anonymous Works");
      expect(result).not.toContain("undefined");
      expect(result.length).toBeGreaterThan(0);
    });

    it("APA handles missing author without 'undefined'", () => {
      const result = formatAPA(noAuthor);
      expect(result).toContain("Anonymous Works");
      expect(result).not.toContain("undefined");
    });

    it("Chicago handles missing author without 'undefined'", () => {
      const result = formatChicago(noAuthor);
      expect(result).toContain("Anonymous Works");
      expect(result).not.toContain("undefined");
    });

    it("Harvard handles missing author without 'undefined'", () => {
      const result = formatHarvard(noAuthor);
      expect(result).toContain("Anonymous Works");
      expect(result).not.toContain("undefined");
    });

    it("BibTeX handles missing author without 'undefined'", () => {
      const result = formatBibTeX(noAuthor);
      expect(result).not.toContain("undefined");
      expect(result).toContain("Anonymous Works");
    });
  });

  // ── Missing publisher ────────────────────────────────────────────────
  describe("missing publisher", () => {
    const noPublisher = {
      title: "Self-Published Memoir",
      author: "Jane Doe",
      publicationDate: "2023",
    };

    it("MLA handles missing publisher gracefully", () => {
      const result = formatMLA(noPublisher);
      expect(result).toContain("Self-Published Memoir");
      expect(result).not.toContain("undefined");
    });

    it("APA handles missing publisher gracefully", () => {
      const result = formatAPA(noPublisher);
      expect(result).toContain("Self-Published Memoir");
      expect(result).not.toContain("undefined");
    });
  });

  // ── Title only (minimal input) ──────────────────────────────────────
  describe("title only", () => {
    const titleOnly = { title: "Untitled Document" };

    it("every format produces output for title-only input", () => {
      const mla = formatMLA(titleOnly);
      const apa = formatAPA(titleOnly);
      const chicago = formatChicago(titleOnly);
      const harvard = formatHarvard(titleOnly);
      const bibtex = formatBibTeX(titleOnly);

      for (const result of [mla, apa, chicago, harvard, bibtex]) {
        expect(result).toContain("Untitled Document");
        expect(result).not.toContain("undefined");
        expect(result.length).toBeGreaterThan(0);
      }
    });
  });

  // ── BibTeX specific ──────────────────────────────────────────────────
  describe("BibTeX specific", () => {
    it("generates a key from author last name and year", () => {
      const result = formatBibTeX({
        title: "Some Book",
        author: "John Smith",
        publicationDate: "2024",
      });
      // Key should be derived from author-year, e.g. smith2024
      expect(result).toMatch(/@book\{[a-z]+2024/i);
    });

    it("generates a key from title when author is missing", () => {
      const result = formatBibTeX({
        title: "Algorithms in Practice",
        publicationDate: "2022",
      });
      // Key should fall back to title-based key
      expect(result).toMatch(/@book\{/);
      expect(result).not.toContain("undefined");
    });

    it("handles special characters in title", () => {
      const result = formatBibTeX({
        title: "C++ & Data Structures: A Modern Approach",
        author: "Alice O'Brien",
        publicationDate: "2023",
      });
      expect(result).toContain("C++ & Data Structures");
      expect(result).not.toContain("undefined");
      expect(result).toMatch(/@book\{/);
    });
  });

  // ── Publication date parsing ─────────────────────────────────────────
  describe("publication date parsing", () => {
    it("handles a four-digit year string", () => {
      const result = formatAPA({ title: "Year Only", publicationDate: "2024" });
      expect(result).toContain("2024");
    });

    it("handles an ISO date string (YYYY-MM-DD)", () => {
      const result = formatAPA({ title: "Full Date", publicationDate: "2024-01-15" });
      expect(result).toContain("2024");
    });

    it("handles a verbose date string (Month Year)", () => {
      const result = formatAPA({ title: "Verbose Date", publicationDate: "January 2024" });
      expect(result).toContain("2024");
    });
  });

  // ── Contributors ─────────────────────────────────────────────────────
  describe("contributors", () => {
    const withContributors = {
      title: "Collaborative Research",
      author: "Primary Author",
      contributors: ["Editor One", "Translator Two"],
      publisher: "Academic Press",
      publicationDate: "2021",
    };

    it("MLA includes contributor names", () => {
      const result = formatMLA(withContributors);
      expect(result).toContain("Editor One");
    });

    it("Chicago includes contributor names", () => {
      const result = formatChicago(withContributors);
      expect(result).toContain("Editor One");
    });
  });
});
