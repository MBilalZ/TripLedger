import type { TripFacts } from "@tripledger/types";
import { DEFAULT_TRIP_SETTINGS } from "@tripledger/types";
import { rupeesToPaisa } from "../src/money.js";

function member(
  poolId: string,
  participantId: string,
  shares: number,
  included = true,
) {
  return {
    poolId,
    participantId,
    included,
    shares,
    percentBps: 0,
    exactPaisa: 0,
  };
}

/** Synthetic line items that reconcile to the known Abbottabad-style trip. */
export function buildSampleTripFacts(): TripFacts {
  const bilal = "p-bilal";
  const mamo = "p-mamo";
  const salman = "p-salman";
  const farhan = "p-farhan";
  const partA = "pool-a";
  const partB = "pool-b";

  const partAExpenses = [
    { id: "e-a1", description: "Fuel", amount: 12_000, paidBy: bilal },
    { id: "e-a2", description: "Breakfast", amount: 4_600, paidBy: bilal },
    { id: "e-a3", description: "Hotel A", amount: 18_800, paidBy: bilal },
    { id: "e-a4", description: "Misc A", amount: 10_000, paidBy: bilal },
  ] as const;

  const partBExpenses = [
    { id: "e-b1", description: "Hotel B", amount: 9_800, paidBy: bilal },
    { id: "e-b2", description: "Lunch", amount: 2_800, paidBy: bilal },
    { id: "e-b3", description: "Shopping", amount: 11_000, paidBy: mamo },
    { id: "e-b4", description: "Toll", amount: 5_000, paidBy: salman },
    { id: "e-b5", description: "Snacks", amount: 3_000, paidBy: farhan },
  ] as const;

  return {
    participants: [
      { id: bilal, displayName: "Bilal" },
      { id: mamo, displayName: "Mamo" },
      { id: salman, displayName: "Salman" },
      { id: farhan, displayName: "Farhan" },
    ],
    pools: [
      { id: partA, name: "Part A", splitMode: "shares" },
      { id: partB, name: "Part B", splitMode: "shares" },
    ],
    poolMembers: [
      member(partA, bilal, 6),
      member(partA, mamo, 6),
      member(partA, salman, 3),
      member(partA, farhan, 1, false),
      member(partB, bilal, 6),
      member(partB, mamo, 6),
      member(partB, salman, 3),
      member(partB, farhan, 2),
    ],
    expenses: [
      ...partAExpenses.map((e) => ({
        id: e.id,
        poolId: partA,
        description: e.description,
        category: "Misc",
        amountPaisa: rupeesToPaisa(e.amount),
        paidById: e.paidBy,
        splitMode: null,
      })),
      ...partBExpenses.map((e) => ({
        id: e.id,
        poolId: partB,
        description: e.description,
        category: "Misc",
        amountPaisa: rupeesToPaisa(e.amount),
        paidById: e.paidBy,
        splitMode: null,
      })),
    ],
    expenseSplits: [],
    adjustments: [
      {
        id: "adj-1",
        fromId: bilal,
        toId: salman,
        amountPaisa: rupeesToPaisa(9_000),
        reason: "Old payment",
      },
      {
        id: "adj-2",
        fromId: mamo,
        toId: bilal,
        amountPaisa: rupeesToPaisa(1_175),
        reason: "BBQ remainder",
      },
    ],
    settings: { ...DEFAULT_TRIP_SETTINGS },
  };
}
