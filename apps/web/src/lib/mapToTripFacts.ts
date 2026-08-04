import type { TripFacts } from "@tripledger/types";
import { DEFAULT_TRIP_SETTINGS } from "@tripledger/types";
import type {
  AdjustmentRow,
  ExpenseRow,
  ExpenseSplitRow,
  ParticipantRow,
  PoolMemberRow,
  PoolRow,
  TripRow,
} from "@/db/dexie";

export type TripFactsSource = {
  trip: TripRow | null | undefined;
  participants: ParticipantRow[];
  pools: PoolRow[];
  poolMembers: PoolMemberRow[];
  expenses: ExpenseRow[];
  expenseSplits: ExpenseSplitRow[];
  adjustments: AdjustmentRow[];
};

/** Build engine TripFacts from workspace rows (in-memory or Dexie-loaded). */
export function mapToTripFacts(args: TripFactsSource): TripFacts {
  const activeExpenses = args.expenses.filter(
    (e) => !e.supersededById && !e.voided,
  );
  return {
    participants: args.participants.map((p) => ({
      id: p.id,
      displayName: p.displayName,
    })),
    pools: args.pools.map((p) => ({
      id: p.id,
      name: p.name,
      splitMode: p.splitMode ?? "shares",
    })),
    poolMembers: args.poolMembers.map((m) => ({
      poolId: m.poolId,
      participantId: m.participantId,
      included: m.included ?? (m.headCount ?? m.shares ?? 0) > 0,
      shares: Math.max(1, m.shares ?? m.headCount ?? 1),
      percentBps: m.percentBps ?? 0,
      exactPaisa: m.exactPaisa ?? 0,
    })),
    expenses: activeExpenses.map((e) => ({
      id: e.id,
      poolId: e.poolId,
      description: e.description,
      category: e.category,
      amountPaisa: e.amountPaisa,
      paidById: e.paidById,
      date: e.date,
      notes: e.notes,
      supersededById: e.supersededById,
      splitMode: e.splitMode ?? null,
    })),
    expenseSplits: args.expenseSplits.map((s) => ({
      expenseId: s.expenseId,
      participantId: s.participantId,
      included: s.included,
      shares: s.shares,
      percentBps: s.percentBps,
      exactPaisa: s.exactPaisa,
    })),
    adjustments: args.adjustments.map((a) => ({
      id: a.id,
      fromId: a.fromId,
      toId: a.toId,
      amountPaisa: a.amountPaisa,
      reason: a.reason,
    })),
    settings: {
      transferMode: args.trip?.transferMode ?? DEFAULT_TRIP_SETTINGS.transferMode,
      settlementRounding:
        args.trip?.settlementRounding ?? DEFAULT_TRIP_SETTINGS.settlementRounding,
      settlementHubId:
        args.trip?.settlementHubId ?? DEFAULT_TRIP_SETTINGS.settlementHubId,
    },
  };
}

/** @deprecated Use mapToTripFacts */
export const factsFromState = mapToTripFacts;
