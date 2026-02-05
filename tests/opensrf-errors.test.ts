import { describe, it, expect } from "vitest";
import { getErrorMessage, isOpenSRFEvent, isSuccessResult } from "@/lib/api/client";

describe("OpenSRF error helpers", () => {
  it("getErrorMessage uses fallback for nullish", () => {
    expect(getErrorMessage(null, "fallback")).toBe("fallback");
    expect(getErrorMessage(undefined, "fallback")).toBe("fallback");
  });

  it("getErrorMessage prefers textcode/desc and last_event", () => {
    expect(getErrorMessage({ textcode: "PERM_FAILURE" }, "fallback")).toBe("PERM_FAILURE");
    expect(getErrorMessage({ desc: "Something happened" }, "fallback")).toBe("Something happened");
    expect(getErrorMessage({ last_event: { textcode: "BAD_BARCODE" } }, "fallback")).toBe("BAD_BARCODE");
    expect(getErrorMessage({ last_event: { desc: "Denied" } }, "fallback")).toBe("Denied");
  });

  it("isOpenSRFEvent identifies non-zero ilsevent", () => {
    expect(isOpenSRFEvent({ ilsevent: 1 })).toBe(true);
    expect(isOpenSRFEvent({ ilsevent: 0 })).toBe(false);
    expect(isOpenSRFEvent({})).toBe(false);
  });

  it("isSuccessResult treats common Evergreen success shapes as success", () => {
    expect(isSuccessResult(1)).toBe(true);
    expect(isSuccessResult(true)).toBe(true);
    expect(isSuccessResult(123)).toBe(true);
    expect(isSuccessResult({ ilsevent: 0 })).toBe(true);
    expect(isSuccessResult({ ilsevent: 1 })).toBe(false);
  });
});

