import { formatPkr, settleTrip } from "@tripledger/engine";
import { db, type TripRow } from "@/db/dexie";
import { mapToTripFacts } from "@/lib/mapToTripFacts";

export type GroupBalanceFilter = "all" | "outstanding" | "you_owe" | "owed_to_you";

export type TripSummary = {
  trip: TripRow;
  expenseCount: number;
  myBalancePaisa: number | null;
  /** Largest counterparty transfer involving me, if any. */
  topCounterparty: { name: string; paisa: number } | null;
  label: string;
};

function pickMyParticipantId(
  participants: { id: string; displayName: string }[],
  myNames: string[],
): string | null {
  const lowered = myNames.map((n) => n.trim().toLowerCase()).filter(Boolean);
  for (const name of lowered) {
    const hit = participants.find((p) => p.displayName.trim().toLowerCase() === name);
    if (hit) return hit.id;
  }
  const you = participants.find((p) => p.displayName.trim().toLowerCase() === "you");
  return you?.id ?? null;
}

async function loadTripRows(tripId: string) {
  const trip = (await db.trips.get(tripId)) ?? null;
  if (!trip) return null;
  const [participants, pools, poolMembers, expenses, expenseSplits, adjustments] =
    await Promise.all([
      db.participants.where("tripId").equals(tripId).toArray(),
      db.pools.where("tripId").equals(tripId).toArray(),
      db.poolMembers.where("tripId").equals(tripId).toArray(),
      db.expenses
        .where("tripId")
        .equals(tripId)
        .filter((e) => !e.supersededById && !e.voided)
        .toArray(),
      db.expenseSplits.where("tripId").equals(tripId).toArray(),
      db.adjustments.where("tripId").equals(tripId).toArray(),
    ]);
  return {
    trip,
    participants,
    pools,
    poolMembers,
    expenses,
    expenseSplits,
    adjustments,
  };
}

export async function buildTripSummaries(
  trips: TripRow[],
  myDisplayNames: string[],
): Promise<TripSummary[]> {
  const out: TripSummary[] = [];
  for (const trip of trips) {
    const rows = await loadTripRows(trip.id);
    if (!rows) {
      out.push({
        trip,
        expenseCount: 0,
        myBalancePaisa: null,
        topCounterparty: null,
        label: "no expenses",
      });
      continue;
    }
    const facts = mapToTripFacts(rows);
    const settlement = settleTrip(facts);
    const myId = pickMyParticipantId(rows.participants, myDisplayNames);
    const myBalance =
      myId == null
        ? null
        : (settlement.participants.find((p) => p.participantId === myId)?.balancePaisa ??
          0);

    let topCounterparty: TripSummary["topCounterparty"] = null;
    if (myId && settlement.settlements.length) {
      for (const t of settlement.settlements) {
        if (t.fromId === myId) {
          if (!topCounterparty || t.amountPaisa > Math.abs(topCounterparty.paisa)) {
            topCounterparty = { name: t.toName, paisa: -t.amountPaisa };
          }
        } else if (t.toId === myId) {
          if (!topCounterparty || t.amountPaisa > Math.abs(topCounterparty.paisa)) {
            topCounterparty = { name: t.fromName, paisa: t.amountPaisa };
          }
        }
      }
    }

    let label = "no expenses";
    if (rows.expenses.length === 0) {
      label = "no expenses";
    } else if (myBalance == null) {
      label = `${rows.expenses.length} expense(s)`;
    } else if (Math.abs(myBalance) < 1) {
      label = "settled up";
    } else if (myBalance < 0) {
      label = `you owe ${formatPkr(-myBalance)}`;
    } else {
      label = `you are owed ${formatPkr(myBalance)}`;
    }

    out.push({
      trip,
      expenseCount: rows.expenses.length,
      myBalancePaisa: myBalance,
      topCounterparty,
      label,
    });
  }
  return out;
}

export function filterSummaries(
  summaries: TripSummary[],
  filter: GroupBalanceFilter,
): TripSummary[] {
  if (filter === "all") return summaries;
  return summaries.filter((s) => {
    const b = s.myBalancePaisa;
    if (b == null) return false;
    if (filter === "outstanding") return Math.abs(b) >= 1;
    if (filter === "you_owe") return b < -0.5;
    if (filter === "owed_to_you") return b > 0.5;
    return true;
  });
}

export function overallBalancePaisa(summaries: TripSummary[]): number {
  return summaries.reduce((sum, s) => sum + (s.myBalancePaisa ?? 0), 0);
}
