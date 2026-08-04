import type {
  AdjustmentRow,
  ExpenseRow,
  ExpenseSplitRow,
  ParticipantRow,
  PoolMemberRow,
  PoolRow,
  TripRow,
} from "@/db/dexie";
import type { SettlementRounding, SplitMode, TransferMode } from "@tripledger/types";

export type DbTrip = {
  id: string;
  name: string;
  currency: string;
  created_at: string;
  updated_at: string;
  transfer_mode: string;
  settlement_rounding: string;
  settlement_hub_id: string | null;
  created_by: string;
};

export function tripFromDb(r: DbTrip): TripRow {
  return {
    id: r.id,
    name: r.name,
    currency: r.currency,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    transferMode: (r.transfer_mode as TransferMode) || "minimize",
    settlementRounding: (r.settlement_rounding as SettlementRounding) || "rupee",
    settlementHubId: r.settlement_hub_id,
  };
}

export function participantFromDb(r: {
  id: string;
  trip_id: string;
  display_name: string;
}): ParticipantRow {
  return { id: r.id, tripId: r.trip_id, displayName: r.display_name };
}

export function poolFromDb(r: {
  id: string;
  trip_id: string;
  name: string;
  split_mode: string;
}): PoolRow {
  return {
    id: r.id,
    tripId: r.trip_id,
    name: r.name,
    splitMode: (r.split_mode as SplitMode) || "shares",
  };
}

export function poolMemberFromDb(r: {
  id: string;
  trip_id: string;
  pool_id: string;
  participant_id: string;
  included: boolean;
  shares: number;
  percent_bps: number;
  exact_paisa: number;
}): PoolMemberRow {
  return {
    id: r.id,
    tripId: r.trip_id,
    poolId: r.pool_id,
    participantId: r.participant_id,
    included: r.included,
    shares: r.shares,
    percentBps: r.percent_bps,
    exactPaisa: r.exact_paisa,
  };
}

export function expenseFromDb(r: {
  id: string;
  trip_id: string;
  pool_id: string;
  description: string;
  category: string;
  amount_paisa: number;
  paid_by_id: string;
  date: string;
  notes: string;
  superseded_by_id: string | null;
  created_at: string;
  split_mode: string | null;
}): ExpenseRow {
  return {
    id: r.id,
    tripId: r.trip_id,
    poolId: r.pool_id,
    description: r.description,
    category: r.category,
    amountPaisa: r.amount_paisa,
    paidById: r.paid_by_id,
    date: r.date,
    notes: r.notes,
    supersededById: r.superseded_by_id,
    createdAt: r.created_at,
    splitMode: (r.split_mode as SplitMode | null) ?? null,
  };
}

export function expenseSplitFromDb(r: {
  id: string;
  trip_id: string;
  expense_id: string;
  participant_id: string;
  included: boolean;
  shares: number;
  percent_bps: number;
  exact_paisa: number;
}): ExpenseSplitRow {
  return {
    id: r.id,
    tripId: r.trip_id,
    expenseId: r.expense_id,
    participantId: r.participant_id,
    included: r.included,
    shares: r.shares,
    percentBps: r.percent_bps,
    exactPaisa: r.exact_paisa,
  };
}

export function adjustmentFromDb(r: {
  id: string;
  trip_id: string;
  from_id: string;
  to_id: string;
  amount_paisa: number;
  reason: string;
  created_at: string;
  adjustment_group_id: string | null;
}): AdjustmentRow {
  return {
    id: r.id,
    tripId: r.trip_id,
    fromId: r.from_id,
    toId: r.to_id,
    amountPaisa: r.amount_paisa,
    reason: r.reason,
    createdAt: r.created_at,
    groupId: r.adjustment_group_id,
  };
}
