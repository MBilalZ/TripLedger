import { ref } from "vue";
import type { SettleTripResult } from "@tripledger/types";
import type {
  AdjustmentRow,
  ExpenseRow,
  ExpenseSplitRow,
  ParticipantRow,
  PoolMemberRow,
  PoolRow,
  TripRow,
} from "@/db/dexie";
import type { WorkspaceSnapshot } from "@/repositories";

export function createWorkspaceState() {
  const tripId = ref("");
  const trip = ref<TripRow | null>(null);
  const participants = ref<ParticipantRow[]>([]);
  const pools = ref<PoolRow[]>([]);
  const poolMembers = ref<PoolMemberRow[]>([]);
  const expenses = ref<ExpenseRow[]>([]);
  const expenseSplits = ref<ExpenseSplitRow[]>([]);
  const adjustments = ref<AdjustmentRow[]>([]);
  const settlement = ref<SettleTripResult | null>(null);
  const myRole = ref<"owner" | "member" | null>(null);
  const loading = ref(true);
  const statusMessage = ref("");

  function applySnapshot(data: WorkspaceSnapshot) {
    trip.value = data.trip;
    participants.value = data.participants;
    pools.value = data.pools;
    poolMembers.value = data.poolMembers;
    expenses.value = data.expenses;
    expenseSplits.value = data.expenseSplits;
    adjustments.value = data.adjustments;
    myRole.value = data.myRole ?? null;
  }

  function announce(msg: string) {
    statusMessage.value = msg;
  }

  return {
    tripId,
    trip,
    participants,
    pools,
    poolMembers,
    expenses,
    expenseSplits,
    adjustments,
    settlement,
    myRole,
    loading,
    statusMessage,
    applySnapshot,
    announce,
  };
}

export type WorkspaceState = ReturnType<typeof createWorkspaceState>;
