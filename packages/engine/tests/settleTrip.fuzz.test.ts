import type { TripFacts } from "@tripledger/types";
import { DEFAULT_TRIP_SETTINGS } from "@tripledger/types";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { settleTrip } from "../src/index.js";

describe("settleTrip property tests", () => {
  it("random trips satisfy invariants I1–I9 when input is valid", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 8 }),
        fc.integer({ min: 1, max: 4 }),
        fc.integer({ min: 1, max: 20 }),
        (nPeople, nPools, nExpenses) => {
          const participants = Array.from({ length: nPeople }, (_, i) => ({
            id: `p${i}`,
            displayName: `P${i}`,
          }));
          const pools = Array.from({ length: nPools }, (_, i) => ({
            id: `pool${i}`,
            name: `Pool ${i}`,
            splitMode: "shares" as const,
          }));

          const poolMembers = pools.flatMap((pool) => {
            const count = 1 + ((pool.id.charCodeAt(4) + nPeople) % nPeople);
            return participants.slice(0, count).map((p, idx) => ({
              poolId: pool.id,
              participantId: p.id,
              included: true,
              shares: 1 + (idx % 3),
              percentBps: 0,
              exactPaisa: 0,
            }));
          });

          const expenses = Array.from({ length: nExpenses }, (_, i) => {
            const pool = pools[i % pools.length]!;
            const payer = participants[i % participants.length]!;
            return {
              id: `e${i}`,
              poolId: pool.id,
              description: `Expense ${i}`,
              amountPaisa: 100 * (1 + ((i * 17) % 500)),
              paidById: payer.id,
              splitMode: null as null,
            };
          });

          const adjustments =
            nPeople >= 2 && nExpenses > 0
              ? [
                  {
                    id: "a0",
                    fromId: participants[0]!.id,
                    toId: participants[1]!.id,
                    amountPaisa: 100 * (1 + (nExpenses % 50)),
                  },
                ]
              : [];

          const facts: TripFacts = {
            participants,
            pools,
            poolMembers,
            expenses,
            expenseSplits: [],
            adjustments,
            settings: { ...DEFAULT_TRIP_SETTINGS },
          };

          const result = settleTrip(facts);
          expect(result.consistency.ok).toBe(true);
          const sumFinal = result.participants.reduce((s, p) => s + p.balancePaisa, 0);
          expect(sumFinal).toBe(0);
          const sumRounded = result.participants.reduce(
            (s, p) => s + p.balanceRupeesPaisa,
            0,
          );
          expect(sumRounded).toBe(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("percent pool splits satisfy invariants when bps sum to 10000", () => {
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 6 }), (nPeople) => {
        const participants = Array.from({ length: nPeople }, (_, i) => ({
          id: `p${i}`,
          displayName: `P${i}`,
        }));
        const base = Math.floor(10_000 / nPeople);
        let rem = 10_000 - base * nPeople;
        const poolMembers = participants.map((p, _i) => {
          const extra = rem > 0 ? 1 : 0;
          rem -= extra;
          return {
            poolId: "pool0",
            participantId: p.id,
            included: true,
            shares: 1,
            percentBps: base + extra,
            exactPaisa: 0,
          };
        });
        const facts: TripFacts = {
          participants,
          pools: [{ id: "pool0", name: "P", splitMode: "percent" }],
          poolMembers,
          expenses: [
            {
              id: "e0",
              poolId: "pool0",
              description: "X",
              amountPaisa: 10_000,
              paidById: participants[0]!.id,
              splitMode: null,
            },
          ],
          expenseSplits: [],
          adjustments: [],
          settings: { ...DEFAULT_TRIP_SETTINGS },
        };
        const result = settleTrip(facts);
        expect(result.consistency.ok).toBe(true);
      }),
      { numRuns: 40 },
    );
  });

  it("fail-closed: unknown payer yields no settlements", () => {
    const facts: TripFacts = {
      participants: [{ id: "p0", displayName: "A" }],
      pools: [{ id: "pool0", name: "P", splitMode: "shares" }],
      poolMembers: [
        {
          poolId: "pool0",
          participantId: "p0",
          included: true,
          shares: 1,
          percentBps: 0,
          exactPaisa: 0,
        },
      ],
      expenses: [
        {
          id: "e0",
          poolId: "pool0",
          description: "Bad",
          amountPaisa: 1000,
          paidById: "missing",
          splitMode: null,
        },
      ],
      expenseSplits: [],
      adjustments: [],
      settings: { ...DEFAULT_TRIP_SETTINGS },
    };
    const result = settleTrip(facts);
    expect(result.consistency.ok).toBe(false);
    expect(result.settlements).toHaveLength(0);
    expect(result.consistency.violations.some((v) => v.id === "INPUT")).toBe(true);
  });
});
