import { describe, expect, it } from "vitest";
import { parseRupeesToPaisa } from "../src/index.js";

describe("parseRupeesToPaisa", () => {
  it("converts whole rupees", () => {
    expect(parseRupeesToPaisa(10)).toBe(1000);
  });

  it("rejects non-positive", () => {
    expect(() => parseRupeesToPaisa(0)).toThrow(/greater than zero/);
  });
});
