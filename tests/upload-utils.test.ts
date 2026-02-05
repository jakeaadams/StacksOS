import { describe, expect, it } from "vitest";
import { imageExtForMime, parsePositiveInt } from "@/lib/upload-utils";

describe("upload-utils", () => {
  describe("parsePositiveInt", () => {
    it("parses positive integers", () => {
      expect(parsePositiveInt("1")).toBe(1);
      expect(parsePositiveInt("00123")).toBe(123);
      expect(parsePositiveInt(42)).toBe(42);
    });

    it("rejects non-integers and traversal-like inputs", () => {
      expect(parsePositiveInt("")).toBeNull();
      expect(parsePositiveInt("0")).toBeNull();
      expect(parsePositiveInt("-1")).toBeNull();
      expect(parsePositiveInt("1.5")).toBeNull();
      expect(parsePositiveInt("123abc")).toBeNull();
      expect(parsePositiveInt("../123")).toBeNull();
      expect(parsePositiveInt("123/..")).toBeNull();
    });
  });

  describe("imageExtForMime", () => {
    it("maps supported mime types to extensions", () => {
      expect(imageExtForMime("image/jpeg")).toBe("jpg");
      expect(imageExtForMime("image/jpg")).toBe("jpg");
      expect(imageExtForMime("IMAGE/PNG")).toBe("png");
      expect(imageExtForMime("image/webp")).toBe("webp");
      expect(imageExtForMime("image/gif")).toBe("gif");
    });

    it("returns null for unsupported types", () => {
      expect(imageExtForMime("text/plain")).toBeNull();
      expect(imageExtForMime("")).toBeNull();
      expect(imageExtForMime(null)).toBeNull();
    });
  });
});

