import { describe, expect, it } from "vitest";
import type {
  ExpenseRow,
  ParticipantRow,
  PoolMemberRow,
  PoolRow,
  TripRow,
} from "../src/db/dexie";
import { mapToTripFacts } from "../src/lib/mapToTripFacts";

const trip: TripRow = {
  id: "t1",
  name: "Test",
  currency: "PKR",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  transferMode: "minimize",
  settlementRounding: "none",
  settlementHubId: null,
};

const participants: ParticipantRow[] = [
  { id: "p1", tripId: "t1", displayName: "Ada" },
  { id: "p2", tripId: "t1", displayName: "Bob" },
];

const pools: PoolRow[] = [
  { id: "pool1", tripId: "t1", name: "General", splitMode: "equal" },
];

const poolMembers: PoolMemberRow[] = [
  {
    id: "pm1",
    tripId: "t1",
    poolId: "pool1",
    participantId: "p1",
    included: true,
    shares: 1,
    percentBps: 0,
    exactPaisa: 0,
  },
  {
    id: "pm2",
    tripId: "t1",
    poolId: "pool1",
    participantId: "p2",
    included: true,
    shares: 1,
    percentBps: 0,
    exactPaisa: 0,
  },
];

describe("mapToTripFacts", () => {
  it("excludes removed and superseded expenses", () => {
    const expenses: ExpenseRow[] = [
      {
        id: "e1",
        tripId: "t1",
        poolId: "pool1",
        description: "Active",
        category: "Food",
        amountPaisa: 10000,
        paidById: "p1",
        date: "2026-01-01",
        notes: "",
        removed: false,
        supersededById: null,
        splitMode: null,
        createdAt: trip.createdAt,
      },
      {
        id: "e2",
        tripId: "t1",
        poolId: "pool1",
        description: "Removed",
        category: "Food",
        amountPaisa: 5000,
        paidById: "p1",
        date: "2026-01-01",
        notes: "",
        removed: true,
        supersededById: null,
        splitMode: null,
        createdAt: trip.createdAt,
      },
      {
        id: "e3",
        tripId: "t1",
        poolId: "pool1",
        description: "Old",
        category: "Food",
        amountPaisa: 2000,
        paidById: "p2",
        date: "2026-01-01",
        notes: "",
        removed: false,
        supersededById: "e1",
        splitMode: null,
        createdAt: trip.createdAt,
      },
    ];

    const facts = mapToTripFacts({
      trip,
      participants,
      pools,
      poolMembers,
      expenses,
      expenseSplits: [],
      adjustments: [],
    });

    expect(facts.expenses.map((e) => e.id)).toEqual(["e1"]);
    expect(facts.participants).toHaveLength(2);
    expect(facts.settings.transferMode).toBe("minimize");
  });
});
