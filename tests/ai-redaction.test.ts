import { describe, expect, test } from "vitest";
import { redactText, redactObject } from "@/lib/ai/redaction";

describe("AI redaction", () => {
  test("redacts emails, phones, and long digit sequences", () => {
    const input =
      "Contact jane.doe@example.org or (415) 555-1212. Barcode 29000000001234 should not leak.";
    const out = redactText(input);
    expect(out).not.toContain("jane.doe@example.org");
    expect(out).not.toContain("(415) 555-1212");
    expect(out).not.toContain("29000000001234");
    expect(out).toContain("[REDACTED_EMAIL]");
    expect(out).toContain("[REDACTED_PHONE]");
    expect(out).toContain("[REDACTED_NUMBER]");
  });

  test("recursively redacts objects", () => {
    const value = {
      patron: { firstName: "Jane", lastName: "Doe", email: "a@b.com", phone: "555-555-5555", barcode: "29000000001234" },
      nested: ["ok", "user@example.com"],
      bib: { title: "A Great Book" },
    };
    const out = redactObject(value);
    expect(JSON.stringify(out)).not.toContain("a@b.com");
    expect(JSON.stringify(out)).not.toContain("555-555-5555");
    expect(JSON.stringify(out)).not.toContain("29000000001234");
    expect(JSON.stringify(out)).not.toContain("Jane");
    expect(JSON.stringify(out)).not.toContain("Doe");
    expect(JSON.stringify(out)).toContain("[REDACTED_NAME]");
    expect(JSON.stringify(out)).toContain("A Great Book");
  });
});
