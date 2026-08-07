import { describe, expect, it } from "vitest";
import { toPdfSafeAscii } from "../src/lib/exportBrand";

describe("toPdfSafeAscii", () => {
  it("maps unicode minus, arrows, checkmarks, and dashes", () => {
    expect(toPdfSafeAscii("Diff −Rs. 161.30")).toBe("Diff -Rs. 161.30");
    expect(toPdfSafeAscii("Mamo → Bilal")).toBe("Mamo -> Bilal");
    expect(toPdfSafeAscii("balances OK ✓")).toBe("balances OK OK");
    expect(toPdfSafeAscii("needed — settled")).toBe("needed - settled");
  });

  it("strips remaining non-ascii without question marks", () => {
    expect(toPdfSafeAscii("café")).toBe("caf");
    expect(toPdfSafeAscii("hello")).not.toContain("?");
  });
});
