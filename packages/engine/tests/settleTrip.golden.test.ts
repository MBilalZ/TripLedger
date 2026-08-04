import { describe, expect, it } from "vitest";
import { paisaToRupees, settleTrip } from "../src/index.js";
import { buildSampleTripFacts } from "./sampleTrip.js";

describe("settleTrip golden sample", () => {
  const result = settleTrip(buildSampleTripFacts());

  it("is mathematically consistent", () => {
    expect(result.consistency.ok).toBe(true);
    expect(result.consistency.violations).toEqual([]);
  });

  it("matches pool totals and paid amounts", () => {
    expect(paisaToRupees(result.summary.tripTotalPaisa)).toBe(77_000);
    const partA = result.pools.find((p) => p.name === "Part A")!;
    const partB = result.pools.find((p) => p.name === "Part B")!;
    expect(paisaToRupees(partA.totalPaisa)).toBe(45_400);
    expect(paisaToRupees(partB.totalPaisa)).toBe(31_600);
    expect(partA.headCount).toBe(15);
    expect(partB.headCount).toBe(17);

    const byName = Object.fromEntries(result.participants.map((p) => [p.displayName, p]));
    expect(paisaToRupees(byName.Bilal!.paidPaisa)).toBe(58_000);
    expect(paisaToRupees(byName.Mamo!.paidPaisa)).toBe(11_000);
    expect(paisaToRupees(byName.Salman!.paidPaisa)).toBe(5_000);
    expect(paisaToRupees(byName.Farhan!.paidPaisa)).toBe(3_000);
  });

  it("matches expected shares", () => {
    const byName = Object.fromEntries(result.participants.map((p) => [p.displayName, p]));
    expect(paisaToRupees(byName.Bilal!.sharePaisa)).toBeCloseTo(29_312.94, 2);
    expect(paisaToRupees(byName.Mamo!.sharePaisa)).toBeCloseTo(29_312.94, 2);
    expect(paisaToRupees(byName.Salman!.sharePaisa)).toBeCloseTo(14_656.47, 2);
    expect(paisaToRupees(byName.Farhan!.sharePaisa)).toBeCloseTo(3_717.65, 2);
  });

  it("produces expected rounded settlements", () => {
    const transfers = result.settlements
      .map((t) => ({
        from: t.fromName,
        to: t.toName,
        rs: t.amountRupees,
      }))
      .sort((a, b) => a.from.localeCompare(b.from));

    expect(transfers).toEqual([
      { from: "Farhan", to: "Bilal", rs: 718 },
      { from: "Mamo", to: "Bilal", rs: 19_488 },
      { from: "Salman", to: "Bilal", rs: 656 },
    ]);
  });
});
