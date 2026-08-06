import type { SettlementRounding, SplitMode, TransferMode } from "@tripledger/types";
import type {
  AdjustmentRow,
  ExpenseRow,
  ExpenseSplitRow,
  ParticipantRow,
  PoolMemberRow,
  PoolRow,
  TripRow,
} from "@/db/dexie";

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

export function tripToDb(trip: TripRow, createdBy?: string): Record<string, unknown> {
  return {
    id: trip.id,
    name: trip.name,
    currency: trip.currency,
    created_at: trip.createdAt,
    updated_at: trip.updatedAt,
    transfer_mode: trip.transferMode,
    settlement_rounding: trip.settlementRounding,
    settlement_hub_id: trip.settlementHubId,
    ...(createdBy !== undefined ? { created_by: createdBy } : {}),
  };
}

export function participantFromDb(r: {
  id: string;
  trip_id: string;
  display_name: string;
}): ParticipantRow {
  return { id: r.id, tripId: r.trip_id, displayName: r.display_name };
}

export function participantToDb(
  row: ParticipantRow,
  userId: string | null = null,
): Record<string, unknown> {
  return {
    id: row.id,
    trip_id: row.tripId,
    display_name: row.displayName,
    user_id: userId,
  };
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

export function poolToDb(row: PoolRow): Record<string, unknown> {
  return {
    id: row.id,
    trip_id: row.tripId,
    name: row.name,
    split_mode: row.splitMode,
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

export function poolMemberToDb(row: PoolMemberRow): Record<string, unknown> {
  return {
    id: row.id,
    trip_id: row.tripId,
    pool_id: row.poolId,
    participant_id: row.participantId,
    included: row.included,
    shares: row.shares,
    percent_bps: row.percentBps,
    exact_paisa: row.exactPaisa,
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
  voided?: boolean | null;
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
    voided: !!r.voided,
  };
}

export function expenseToDb(row: ExpenseRow): Record<string, unknown> {
  return {
    id: row.id,
    trip_id: row.tripId,
    pool_id: row.poolId,
    description: row.description,
    category: row.category,
    amount_paisa: row.amountPaisa,
    paid_by_id: row.paidById,
    date: row.date,
    notes: row.notes,
    superseded_by_id: row.supersededById,
    created_at: row.createdAt,
    split_mode: row.splitMode,
    voided: row.voided ?? false,
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

export function expenseSplitToDb(row: ExpenseSplitRow): Record<string, unknown> {
  return {
    id: row.id,
    trip_id: row.tripId,
    expense_id: row.expenseId,
    participant_id: row.participantId,
    included: row.included,
    shares: row.shares,
    percent_bps: row.percentBps,
    exact_paisa: row.exactPaisa,
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

export function adjustmentToDb(row: AdjustmentRow): Record<string, unknown> {
  return {
    id: row.id,
    trip_id: row.tripId,
    from_id: row.fromId,
    to_id: row.toId,
    amount_paisa: row.amountPaisa,
    reason: row.reason,
    created_at: row.createdAt,
    adjustment_group_id: row.groupId ?? null,
  };
}
