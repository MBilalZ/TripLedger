import type {
  AdjustmentRow,
  ExpenseRow,
  ExpenseSplitRow,
  ParticipantRow,
  PoolMemberRow,
  PoolRow,
  TripRow,
} from "@/db/dexie";
import { apiCall } from "./client";
import {
  adjustmentFromDb,
  type DbTrip,
  expenseFromDb,
  expenseSplitFromDb,
  participantFromDb,
  poolFromDb,
  poolMemberFromDb,
  tripFromDb,
} from "./mappers";
import { requireUser } from "./supabase";

export type WorkspaceSnapshot = {
  trip: TripRow | null;
  participants: ParticipantRow[];
  pools: PoolRow[];
  poolMembers: PoolMemberRow[];
  expenses: ExpenseRow[];
  expenseSplits: ExpenseSplitRow[];
  adjustments: AdjustmentRow[];
  myRole: "owner" | "member" | null;
};

export async function loadWorkspace(tripId: string): Promise<WorkspaceSnapshot> {
  return apiCall(async (sb) => {
    const uid = await requireUser().catch(() => null);
    const [tripRes, partsRes, poolsRes, membersRes, expRes, splitsRes, adjRes, roleRes] =
      await Promise.all([
        sb.from("trips").select("*").eq("id", tripId).maybeSingle(),
        sb.from("participants").select("*").eq("trip_id", tripId).is("deleted_at", null),
        sb.from("pools").select("*").eq("trip_id", tripId).is("deleted_at", null),
        sb.from("pool_members").select("*").eq("trip_id", tripId),
        sb.from("expenses").select("*").eq("trip_id", tripId),
        sb.from("expense_splits").select("*").eq("trip_id", tripId),
        sb.from("adjustments").select("*").eq("trip_id", tripId).is("deleted_at", null),
        uid
          ? sb
              .from("trip_members")
              .select("role")
              .eq("trip_id", tripId)
              .eq("user_id", uid)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
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
      if (res.error)
        return { data: null as unknown as WorkspaceSnapshot, error: res.error };
    }

    const expenses = (expRes.data ?? [])
      .map(expenseFromDb)
      .filter((e) => !e.supersededById && !e.voided)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

    const role = roleRes.data?.role;
    const myRole = role === "owner" || role === "member" ? role : null;

    return {
      data: {
        trip: tripRes.data ? tripFromDb(tripRes.data as DbTrip) : null,
        participants: (partsRes.data ?? []).map(participantFromDb),
        pools: (poolsRes.data ?? []).map(poolFromDb),
        poolMembers: (membersRes.data ?? []).map(poolMemberFromDb),
        expenses,
        expenseSplits: (splitsRes.data ?? []).map(expenseSplitFromDb),
        adjustments: (adjRes.data ?? []).map(adjustmentFromDb),
        myRole,
      },
      error: null,
    };
  });
}
