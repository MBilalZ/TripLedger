import { settleTrip } from "@tripledger/engine";
import type { TripFacts } from "@tripledger/types";
import { describe, expect, it } from "vitest";
import {
  buildPoolShareMatrix,
  buildSettlementReport,
  buildSettlementReportText,
} from "../src/lib/tripReport";

/** Two-pool shares fixture inspired by Part A / Part B sample. */
function makeFacts(): TripFacts {
  return {
    participants: [
      { id: "bilal", displayName: "Bilal" },
      { id: "mamo", displayName: "Mamo" },
      { id: "salman", displayName: "Salman" },
      { id: "farhan", displayName: "Farhan" },
    ],
    pools: [
      { id: "partA", name: "Part A", splitMode: "shares" },
      { id: "partB", name: "Part B", splitMode: "shares" },
    ],
    poolMembers: [
      // Part A: Bilal 6, Mamo 6, Salman 3 (15 heads)
      {
        poolId: "partA",
        participantId: "bilal",
        included: true,
        shares: 6,
        percentBps: 0,
        exactPaisa: 0,
      },
      {
        poolId: "partA",
        participantId: "mamo",
        included: true,
        shares: 6,
        percentBps: 0,
        exactPaisa: 0,
      },
      {
        poolId: "partA",
        participantId: "salman",
        included: true,
        shares: 3,
        percentBps: 0,
        exactPaisa: 0,
      },
      {
        poolId: "partA",
        participantId: "farhan",
        included: false,
        shares: 1,
        percentBps: 0,
        exactPaisa: 0,
      },
      // Part B: Bilal 6, Mamo 6, Salman 3, Farhan 2 (17 heads)
      {
        poolId: "partB",
        participantId: "bilal",
        included: true,
        shares: 6,
        percentBps: 0,
        exactPaisa: 0,
      },
      {
        poolId: "partB",
        participantId: "mamo",
        included: true,
        shares: 6,
        percentBps: 0,
        exactPaisa: 0,
      },
      {
        poolId: "partB",
        participantId: "salman",
        included: true,
        shares: 3,
        percentBps: 0,
        exactPaisa: 0,
      },
      {
        poolId: "partB",
        participantId: "farhan",
        included: true,
        shares: 2,
        percentBps: 0,
        exactPaisa: 0,
      },
    ],
    expenses: [
      {
        id: "e1",
        poolId: "partA",
        description: "Part A expenses",
        amountPaisa: 45_400_00,
        paidById: "bilal",
      },
      {
        id: "e2",
        poolId: "partB",
        description: "Part B expenses",
        amountPaisa: 31_600_00,
        paidById: "bilal",
      },
      // Rebalance payments so totals match sample paid amounts roughly:
      // Bilal 58000, Mamo 11000, Salman 5000, Farhan 3000 = 77000
      // e1+e2 already 77000 all on Bilal — add offsetting via separate paid expenses
      // Simpler: single expenses per payer totaling sample
    ],
    expenseSplits: [],
    adjustments: [
      {
        id: "adj1",
        fromId: "mamo",
        toId: "bilal",
        amountPaisa: 1_175_00,
        reason: "Bilal & Mamo shared expense",
      },
    ],
    settings: {
      transferMode: "minimize",
      settlementRounding: "none",
      settlementHubId: null,
    },
  };
}

/** Rebuild expenses so paid totals match the sample. */
function makeFactsWithPayments(): TripFacts {
  const base = makeFacts();
  // Total 77,000 — allocate payers: Bilal 58k, Mamo 11k, Salman 5k, Farhan 3k
  // Pool split: Part A 45400, Part B 31600 still
  return {
    ...base,
    expenses: [
      {
        id: "eA",
        poolId: "partA",
        description: "Part A block",
        amountPaisa: 45_400_00,
        paidById: "bilal",
        category: "Trip",
      },
      {
        id: "eB1",
        poolId: "partB",
        description: "Part B Bilal remainder",
        amountPaisa: 12_600_00,
        paidById: "bilal",
        category: "Trip",
      },
      {
        id: "eB2",
        poolId: "partB",
        description: "Part B Mamo",
        amountPaisa: 11_000_00,
        paidById: "mamo",
        category: "Trip",
      },
      {
        id: "eB3",
        poolId: "partB",
        description: "Part B Salman",
        amountPaisa: 5_000_00,
        paidById: "salman",
        category: "Trip",
      },
      {
        id: "eB4",
        poolId: "partB",
        description: "Part B Farhan",
        amountPaisa: 3_000_00,
        paidById: "farhan",
        category: "Trip",
      },
    ],
  };
}

describe("buildPoolShareMatrix", () => {
  it("allocates Part A/B shares by heads and matches settleTrip share totals", () => {
    const facts = makeFactsWithPayments();
    const matrix = buildPoolShareMatrix(facts);
    const settlement = settleTrip(facts);

    const partA = matrix.get("partA")!;
    expect(partA.get("bilal")).toBe(18_160_00);
    expect(partA.get("mamo")).toBe(18_160_00);
    expect(partA.get("salman")).toBe(9_080_00);
    expect(partA.get("farhan") ?? 0).toBe(0);

    // Part B: 31600 / 17 * weights with LRM
    const partBBilal = matrix.get("partB")!.get("bilal")!;
    const partBMamo = matrix.get("partB")!.get("mamo")!;
    const partBSalman = matrix.get("partB")!.get("salman")!;
    const partBFarhan = matrix.get("partB")!.get("farhan")!;
    expect(partBBilal + partBMamo + partBSalman + partBFarhan).toBe(31_600_00);

    for (const p of settlement.participants) {
      const fromMatrix =
        (matrix.get("partA")?.get(p.participantId) ?? 0) +
        (matrix.get("partB")?.get(p.participantId) ?? 0);
      expect(fromMatrix).toBe(p.sharePaisa);
    }
  });
});

describe("buildSettlementReport", () => {
  it("builds payments total, pool parts, compare checksum, adjustments, transfers", () => {
    const facts = makeFactsWithPayments();
    const settlement = settleTrip(facts);
    const report = buildSettlementReport({
      tripName: "Murree",
      currency: "PKR",
      facts,
      settlement,
    });

    expect(report.paymentsTotalPaisa).toBe(77_000_00);
    expect(report.payments.find((p) => p.displayName === "Bilal")?.paidPaisa).toBe(
      58_000_00,
    );

    const partA = report.pools.find((p) => p.name === "Part A")!;
    expect(partA.totalWeight).toBe(15);
    expect(partA.members.find((m) => m.displayName === "Bilal")?.weight).toBe(6);
    expect(partA.costPerUnitLabel).toContain("3,026.6667");

    expect(report.differenceChecksumOk).toBe(true);
    expect(report.adjustments).toHaveLength(1);
    expect(report.adjustments[0]?.reason).toContain("shared expense");
    expect(report.transfers.length).toBeGreaterThan(0);
    expect(report.transfers[0]?.roundedLabel).toMatch(/^Rs\. /);
  });
});

describe("buildSettlementReportText", () => {
  it("includes narrative headings and final rounded lines", () => {
    const facts = makeFactsWithPayments();
    const settlement = settleTrip(facts);
    const report = buildSettlementReport({
      tripName: "Murree",
      currency: "PKR",
      facts,
      settlement,
    });
    const text = buildSettlementReportText(report);

    expect(text).toContain("*Expense Settlement Summary*");
    expect(text).toContain("*Expense List*");
    expect(text).toContain("*Part A:*");
    expect(text).toContain("*Part B:*");
    expect(text).toContain("*Actual Payments*");
    expect(text).toContain("*Expected Share*");
    expect(text).toContain("*Trip Settlement*");
    expect(text).toContain("*2. Adjustments*");
    expect(text).toContain("*Final Settlement*");
    expect(text).toContain("*Rounded to the nearest rupee:*");
    expect(text).toContain("Bilal & Mamo shared expense");
  });
});
