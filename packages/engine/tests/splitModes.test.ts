import type { TripFacts } from "@tripledger/types";
import { DEFAULT_TRIP_SETTINGS } from "@tripledger/types";
import { describe, expect, it } from "vitest";
import { rupeesToPaisa, settleTrip } from "../src/index.js";

function basePeople() {
  return [
    { id: "a", displayName: "A" },
    { id: "b", displayName: "B" },
    { id: "c", displayName: "C" },
  ];
}

describe("split modes", () => {
  it("equal split among included people", () => {
    const facts: TripFacts = {
      participants: basePeople(),
      pools: [{ id: "p", name: "P", splitMode: "equal" }],
      poolMembers: [
        {
          poolId: "p",
          participantId: "a",
          included: true,
          shares: 1,
          percentBps: 0,
          exactPaisa: 0,
        },
        {
          poolId: "p",
          participantId: "b",
          included: true,
          shares: 1,
          percentBps: 0,
          exactPaisa: 0,
        },
        {
          poolId: "p",
          participantId: "c",
          included: false,
          shares: 1,
          percentBps: 0,
          exactPaisa: 0,
        },
      ],
      expenses: [
        {
          id: "e1",
          poolId: "p",
          description: "Lunch",
          amountPaisa: rupeesToPaisa(100),
          paidById: "a",
        },
      ],
      expenseSplits: [],
      adjustments: [],
      settings: { ...DEFAULT_TRIP_SETTINGS },
    };
    const r = settleTrip(facts);
    expect(r.consistency.ok).toBe(true);
    const by = Object.fromEntries(r.participants.map((p) => [p.participantId, p]));
    expect(by.a!.sharePaisa).toBe(rupeesToPaisa(50));
    expect(by.b!.sharePaisa).toBe(rupeesToPaisa(50));
    expect(by.c!.sharePaisa).toBe(0);
  });

  it("percent split", () => {
    const facts: TripFacts = {
      participants: basePeople(),
      pools: [{ id: "p", name: "P", splitMode: "percent" }],
      poolMembers: [
        {
          poolId: "p",
          participantId: "a",
          included: true,
          shares: 1,
          percentBps: 5000,
          exactPaisa: 0,
        },
        {
          poolId: "p",
          participantId: "b",
          included: true,
          shares: 1,
          percentBps: 3000,
          exactPaisa: 0,
        },
        {
          poolId: "p",
          participantId: "c",
          included: true,
          shares: 1,
          percentBps: 2000,
          exactPaisa: 0,
        },
      ],
      expenses: [
        {
          id: "e1",
          poolId: "p",
          description: "Bill",
          amountPaisa: rupeesToPaisa(1000),
          paidById: "a",
        },
      ],
      expenseSplits: [],
      adjustments: [],
      settings: { ...DEFAULT_TRIP_SETTINGS },
    };
    const r = settleTrip(facts);
    expect(r.consistency.ok).toBe(true);
    const by = Object.fromEntries(r.participants.map((p) => [p.participantId, p]));
    expect(by.a!.sharePaisa).toBe(rupeesToPaisa(500));
    expect(by.b!.sharePaisa).toBe(rupeesToPaisa(300));
    expect(by.c!.sharePaisa).toBe(rupeesToPaisa(200));
  });

  it("exact split", () => {
    const facts: TripFacts = {
      participants: basePeople(),
      pools: [{ id: "p", name: "P", splitMode: "exact" }],
      poolMembers: [
        {
          poolId: "p",
          participantId: "a",
          included: true,
          shares: 1,
          percentBps: 0,
          exactPaisa: rupeesToPaisa(700),
        },
        {
          poolId: "p",
          participantId: "b",
          included: true,
          shares: 1,
          percentBps: 0,
          exactPaisa: rupeesToPaisa(300),
        },
        {
          poolId: "p",
          participantId: "c",
          included: false,
          shares: 1,
          percentBps: 0,
          exactPaisa: 0,
        },
      ],
      expenses: [
        {
          id: "e1",
          poolId: "p",
          description: "Bill",
          amountPaisa: rupeesToPaisa(1000),
          paidById: "a",
        },
      ],
      expenseSplits: [],
      adjustments: [],
      settings: { ...DEFAULT_TRIP_SETTINGS },
    };
    const r = settleTrip(facts);
    expect(r.consistency.ok).toBe(true);
    const by = Object.fromEntries(r.participants.map((p) => [p.participantId, p]));
    expect(by.a!.sharePaisa).toBe(rupeesToPaisa(700));
    expect(by.b!.sharePaisa).toBe(rupeesToPaisa(300));
  });

  it("expense override ignores pool shares", () => {
    const facts: TripFacts = {
      participants: basePeople(),
      pools: [{ id: "p", name: "P", splitMode: "shares" }],
      poolMembers: [
        {
          poolId: "p",
          participantId: "a",
          included: true,
          shares: 9,
          percentBps: 0,
          exactPaisa: 0,
        },
        {
          poolId: "p",
          participantId: "b",
          included: true,
          shares: 1,
          percentBps: 0,
          exactPaisa: 0,
        },
        {
          poolId: "p",
          participantId: "c",
          included: true,
          shares: 1,
          percentBps: 0,
          exactPaisa: 0,
        },
      ],
      expenses: [
        {
          id: "e1",
          poolId: "p",
          description: "BBQ",
          amountPaisa: rupeesToPaisa(200),
          paidById: "a",
          splitMode: "equal",
        },
      ],
      expenseSplits: [
        {
          expenseId: "e1",
          participantId: "a",
          included: true,
          shares: 1,
          percentBps: 0,
          exactPaisa: 0,
        },
        {
          expenseId: "e1",
          participantId: "b",
          included: true,
          shares: 1,
          percentBps: 0,
          exactPaisa: 0,
        },
        {
          expenseId: "e1",
          participantId: "c",
          included: false,
          shares: 1,
          percentBps: 0,
          exactPaisa: 0,
        },
      ],
      adjustments: [],
      settings: { ...DEFAULT_TRIP_SETTINGS },
    };
    const r = settleTrip(facts);
    expect(r.consistency.ok).toBe(true);
    const by = Object.fromEntries(r.participants.map((p) => [p.participantId, p]));
    expect(by.a!.sharePaisa).toBe(rupeesToPaisa(100));
    expect(by.b!.sharePaisa).toBe(rupeesToPaisa(100));
    expect(by.c!.sharePaisa).toBe(0);
  });
});

describe("transfer modes", () => {
  const base: TripFacts = {
    participants: basePeople(),
    pools: [{ id: "p", name: "P", splitMode: "equal" }],
    poolMembers: [
      {
        poolId: "p",
        participantId: "a",
        included: true,
        shares: 1,
        percentBps: 0,
        exactPaisa: 0,
      },
      {
        poolId: "p",
        participantId: "b",
        included: true,
        shares: 1,
        percentBps: 0,
        exactPaisa: 0,
      },
      {
        poolId: "p",
        participantId: "c",
        included: true,
        shares: 1,
        percentBps: 0,
        exactPaisa: 0,
      },
    ],
    expenses: [
      {
        id: "e1",
        poolId: "p",
        description: "X",
        amountPaisa: rupeesToPaisa(300),
        paidById: "a",
      },
    ],
    expenseSplits: [],
    adjustments: [],
    settings: { ...DEFAULT_TRIP_SETTINGS },
  };

  it("minimize produces balanced transfers", () => {
    const r = settleTrip(base);
    expect(r.consistency.ok).toBe(true);
    expect(r.settlements.length).toBeGreaterThan(0);
  });

  it("settle_to_one routes via hub", () => {
    const r = settleTrip({
      ...base,
      settings: {
        transferMode: "settle_to_one",
        settlementRounding: "rupee",
        settlementHubId: "a",
      },
    });
    expect(r.consistency.ok).toBe(true);
    for (const t of r.settlements) {
      expect(t.fromId === "a" || t.toId === "a").toBe(true);
    }
  });

  it("pairwise keeps net balances", () => {
    const r = settleTrip({
      ...base,
      settings: {
        transferMode: "pairwise",
        settlementRounding: "rupee",
        settlementHubId: null,
      },
    });
    expect(r.consistency.ok).toBe(true);
  });

  it("none rounding uses exact paisa", () => {
    const r = settleTrip({
      ...base,
      settings: {
        transferMode: "minimize",
        settlementRounding: "none",
        settlementHubId: null,
      },
    });
    expect(r.consistency.ok).toBe(true);
    for (const p of r.participants) {
      expect(p.balanceRupeesPaisa).toBe(p.balancePaisa);
    }
  });
});
