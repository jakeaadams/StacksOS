/**
 * MARC XML Parsing Utility Tests
 *
 * Tests parseMarcXml, formatMarcText, and getTagLabel functions
 * used by the OPAC MARC Record Viewer.
 */

import { describe, it, expect } from "vitest";
import { parseMarcXml, formatMarcText, getTagLabel } from "@/components/opac/marc-viewer";

const SAMPLE_MARC_XML = `<?xml version="1.0" encoding="UTF-8"?>
<record xmlns="http://www.loc.gov/MARC21/slim">
  <leader>01142cam a2200301 a 4500</leader>
  <controlfield tag="001">12345</controlfield>
  <controlfield tag="008">060425s2006    nyua     b    001 0 eng  </controlfield>
  <datafield tag="020" ind1=" " ind2=" ">
    <subfield code="a">978-0-06-112008-4</subfield>
  </datafield>
  <datafield tag="100" ind1="1" ind2=" ">
    <subfield code="a">Lee, Harper,</subfield>
    <subfield code="d">1926-2016.</subfield>
  </datafield>
  <datafield tag="245" ind1="1" ind2="0">
    <subfield code="a">To kill a mockingbird /</subfield>
    <subfield code="c">Harper Lee.</subfield>
  </datafield>
  <datafield tag="260" ind1=" " ind2=" ">
    <subfield code="a">New York :</subfield>
    <subfield code="b">HarperCollins,</subfield>
    <subfield code="c">2006.</subfield>
  </datafield>
  <datafield tag="650" ind1=" " ind2="0">
    <subfield code="a">Race relations</subfield>
    <subfield code="z">Alabama</subfield>
  </datafield>
</record>`;

describe("MARC Utils", () => {
  // ── parseMarcXml ─────────────────────────────────────────────────────
  describe("parseMarcXml", () => {
    it("parses a valid MARC XML record", () => {
      const result = parseMarcXml(SAMPLE_MARC_XML);
      expect(result).not.toBeNull();
      expect(result!.leader).toBe("01142cam a2200301 a 4500");
      expect(result!.fields.length).toBeGreaterThanOrEqual(5);
    });

    it("extracts control fields with value", () => {
      const result = parseMarcXml(SAMPLE_MARC_XML)!;
      const f001 = result.fields.find((f) => f.tag === "001");
      expect(f001).toBeDefined();
      expect(f001!.value).toBe("12345");
      expect(f001!.subfields).toHaveLength(0);
    });

    it("extracts data fields with subfields", () => {
      const result = parseMarcXml(SAMPLE_MARC_XML)!;
      const f245 = result.fields.find((f) => f.tag === "245");
      expect(f245).toBeDefined();
      expect(f245!.subfields.length).toBe(2);
      expect(f245!.subfields[0]!.code).toBe("a");
      expect(f245!.subfields[0]!.value).toContain("To kill a mockingbird");
    });

    it("extracts indicators from data fields", () => {
      const result = parseMarcXml(SAMPLE_MARC_XML)!;
      const f100 = result.fields.find((f) => f.tag === "100");
      expect(f100!.ind1).toBe("1");
    });

    it("returns null for empty input", () => {
      expect(parseMarcXml("")).toBeNull();
    });

    it("returns null for invalid XML", () => {
      expect(parseMarcXml("<not valid xml<<<")).toBeNull();
    });

    it("returns null for non-MARC XML", () => {
      expect(parseMarcXml("<html><body>Not MARC</body></html>")).toBeNull();
    });
  });

  // ── formatMarcText ───────────────────────────────────────────────────
  describe("formatMarcText", () => {
    it("formats a parsed record as plain text", () => {
      const parsed = parseMarcXml(SAMPLE_MARC_XML)!;
      const text = formatMarcText(parsed);
      expect(text).toContain("LDR 01142cam");
      expect(text).toContain("001    12345");
      expect(text).toContain("245");
      expect(text).toContain("$a To kill a mockingbird");
    });
  });

  // ── getTagLabel ──────────────────────────────────────────────────────
  describe("getTagLabel", () => {
    it("returns a label for known tags", () => {
      expect(getTagLabel("245")).toBe("Title Statement");
      expect(getTagLabel("100")).toBe("Author (Personal)");
      expect(getTagLabel("020")).toBe("ISBN");
    });

    it("returns a fallback for unknown tags", () => {
      expect(getTagLabel("999")).toBe("Field 999");
    });
  });
});
