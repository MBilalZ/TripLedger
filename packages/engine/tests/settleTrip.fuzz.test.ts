import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { TripFacts } from "@tripledger/types";
import { DEFAULT_TRIP_SETTINGS } from "@tripledger/types";
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
              amountPaisa: 100 * (1 + (i * 17) % 500),
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
          const sumFinal = result.participants.reduce(
            (s, p) => s + p.balancePaisa,
            0,
          );
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
});
