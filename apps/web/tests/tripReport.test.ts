import { describe, expect, it } from "vitest";
import type { SettleTripResult } from "@tripledger/types";
import {
  buildTripReport,
  buildTripReportText,
  chartSlicesByCategory,
  chartSlicesByPool,
  chartSlicesByPersonPaid,
} from "../src/lib/tripReport";

function makeSettlement(overrides?: Partial<SettleTripResult>): SettleTripResult {
  return {
    summary: {
      tripTotalPaisa: 10_000_00,
      participantCount: 2,
      poolCount: 1,
      expenseCount: 1,
      adjustmentCount: 0,
      transferMode: "minimize",
      settlementRounding: "none",
    },
    pools: [],
    participants: [
      {
        participantId: "p2",
        displayName: "Bob",
        paidPaisa: 0,
        sharePaisa: 5_000_00,
        adjNetPaisa: 0,
        balancePaisa: -5_000_00,
        balanceRupeesPaisa: -5_000_00,
      },
      {
        participantId: "p1",
        displayName: "Ada",
        paidPaisa: 10_000_00,
        sharePaisa: 5_000_00,
        adjNetPaisa: 100_00,
        balancePaisa: 5_100_00,
        balanceRupeesPaisa: 5_100_00,
      },
    ],
    settlements: [
      {
        fromId: "p2",
        fromName: "Bob",
        toId: "p1",
        toName: "Ada",
        amountPaisa: 5_000_00,
        amountRupees: 5000,
      },
    ],
    consistency: { ok: true, violations: [] },
    ...overrides,
  };
}

describe("tripReport charts", () => {
  it("builds category slices with Misc fallback and percents", () => {
    const slices = chartSlicesByCategory([
      { amountPaisa: 300, category: "Food", poolId: "pool1" },
      { amountPaisa: 100, poolId: "pool1" },
      { amountPaisa: 100, category: "Food", poolId: "pool1" },
    ]);
    expect(slices).toEqual([
      { name: "Food", paisa: 400, pct: 80 },
      { name: "Misc", paisa: 100, pct: 20 },
    ]);
  });

  it("builds pool slices using pool names", () => {
    const slices = chartSlicesByPool(
      [
        { amountPaisa: 200, poolId: "a" },
        { amountPaisa: 50, poolId: "missing" },
      ],
      [{ id: "a", name: "Cabin" }],
    );
    expect(slices[0]).toMatchObject({ name: "Cabin", paisa: 200 });
    expect(slices[1]).toMatchObject({ name: "Pool", paisa: 50 });
  });

  it("includes only people with paid > 0", () => {
    const slices = chartSlicesByPersonPaid(makeSettlement().participants);
    expect(slices).toHaveLength(1);
    expect(slices[0]?.name).toBe("Ada");
  });
});

describe("buildTripReport / text", () => {
  it("sorts friends by name and formats Adj only when non-zero", () => {
    const report = buildTripReport({
      tripName: "Murree",
      currency: "PKR",
      settlement: makeSettlement(),
      expenses: [{ amountPaisa: 10_000_00, category: "Food", poolId: "pool1" }],
      pools: [{ id: "pool1", name: "General" }],
    });

    expect(report.participants.map((p) => p.displayName)).toEqual(["Ada", "Bob"]);
    expect(report.participants[0]?.adjLabel).toMatch(/Rs\./);
    expect(report.participants[1]?.adjLabel).toBeNull();
    expect(report.participants[0]?.detailLine).toContain("Adj");
    expect(report.participants[1]?.detailLine).not.toContain("Adj");
  });

  it("includes balance, pays wording, empty-transfer copy, and charts", () => {
    const report = buildTripReport({
      tripName: "Murree",
      currency: "PKR",
      settlement: makeSettlement(),
      expenses: [{ amountPaisa: 10_000_00, category: "Food", poolId: "pool1" }],
      pools: [{ id: "pool1", name: "General" }],
    });
    const text = buildTripReportText(report);

    expect(text).toContain("*TripLedger — Murree*");
    expect(text).toContain("Total");
    expect(text).toContain("· PKR");
    expect(text).toContain("Balanced");
    expect(text).toContain("2 people");
    expect(text).toContain("*Per friend*");
    expect(text).toContain("Bal Rs.");
    expect(text).toContain("*Suggested transfers*");
    expect(text).toContain("Bob pays Ada:");
    expect(text).not.toContain("→");
    expect(text).toContain("*Charts*");
    expect(text).toContain("*By pool*");
    expect(text).toContain("General:");
    expect(text).toContain("*By category*");
    expect(text).toContain("Food:");
  });

  it("uses settled empty copy when no transfers", () => {
    const report = buildTripReport({
      tripName: "Solo",
      currency: "PKR",
      settlement: makeSettlement({
        settlements: [],
        summary: {
          tripTotalPaisa: 0,
          participantCount: 1,
          poolCount: 0,
          expenseCount: 0,
          adjustmentCount: 0,
          transferMode: "minimize",
          settlementRounding: "none",
        },
        participants: [
          {
            participantId: "p1",
            displayName: "Ada",
            paidPaisa: 0,
            sharePaisa: 0,
            adjNetPaisa: 0,
            balancePaisa: 0,
            balanceRupeesPaisa: 0,
          },
        ],
      }),
      expenses: [],
      pools: [],
    });
    const text = buildTripReportText(report);
    expect(text).toContain("No transfers needed — everyone is settled.");
    expect(text).toContain("1 person");
  });
});
