import type {
  AdjustmentRow,
  ExpenseRow,
  ExpenseSplitRow,
  ParticipantRow,
  PoolMemberRow,
  PoolRow,
  TripRow,
} from "@/db/dexie";
import {
  adjustmentFromDb,
  expenseFromDb,
  expenseSplitFromDb,
  participantFromDb,
  poolFromDb,
  poolMemberFromDb,
  tripFromDb,
  type DbTrip,
} from "./mappers";
import { apiCall } from "./client";

export type WorkspaceSnapshot = {
  trip: TripRow | null;
  participants: ParticipantRow[];
  pools: PoolRow[];
  poolMembers: PoolMemberRow[];
  expenses: ExpenseRow[];
  expenseSplits: ExpenseSplitRow[];
  adjustments: AdjustmentRow[];
};

export async function loadWorkspace(tripId: string): Promise<WorkspaceSnapshot> {
  return apiCall(async (sb) => {
    const [
      tripRes,
      partsRes,
      poolsRes,
      membersRes,
      expRes,
      splitsRes,
      adjRes,
    ] = await Promise.all([
      sb.from("trips").select("*").eq("id", tripId).maybeSingle(),
      sb.from("participants").select("*").eq("trip_id", tripId),
      sb.from("pools").select("*").eq("trip_id", tripId),
      sb.from("pool_members").select("*").eq("trip_id", tripId),
      sb.from("expenses").select("*").eq("trip_id", tripId),
      sb.from("expense_splits").select("*").eq("trip_id", tripId),
      sb.from("adjustments").select("*").eq("trip_id", tripId),
    ]);

    for (const res of [
      tripRes,
      partsRes,
      poolsRes,
      membersRes,
      expRes,
      splitsRes,
      adjRes,
    ]) {
      if (res.error) return { data: null as unknown as WorkspaceSnapshot, error: res.error };
    }

    const expenses = (expRes.data ?? [])
      .map(expenseFromDb)
      .filter((e) => !e.supersededById)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

    return {
      data: {
        trip: tripRes.data ? tripFromDb(tripRes.data as DbTrip) : null,
        participants: (partsRes.data ?? []).map(participantFromDb),
        pools: (poolsRes.data ?? []).map(poolFromDb),
        poolMembers: (membersRes.data ?? []).map(poolMemberFromDb),
        expenses,
        expenseSplits: (splitsRes.data ?? []).map(expenseSplitFromDb),
        adjustments: (adjRes.data ?? []).map(adjustmentFromDb),
      },
      error: null,
    };
  });
}
