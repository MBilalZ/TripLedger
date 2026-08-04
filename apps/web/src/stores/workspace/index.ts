import { computed } from "vue";
import { defineStore } from "pinia";
import { useAuthStore } from "@/stores/auth";
import { createAdjustmentActions } from "./adjustments";
import { createCoreActions } from "./core";
import { createExpenseActions } from "./expenses";
import { createParticipantActions } from "./participants";
import { createPoolActions } from "./pools";
import { createWorkspaceState } from "./state";

export const useWorkspaceStore = defineStore("workspace", () => {
  const auth = useAuthStore();
  const state = createWorkspaceState();
  const core = createCoreActions(state);
  const participants = createParticipantActions(state, core);
  const pools = createPoolActions(state, core);
  const expenses = createExpenseActions(state, core, pools);
  const adjustments = createAdjustmentActions(state, core);

  const isOwner = computed(
    () => !auth.cloud || state.myRole.value === "owner",
  );

  return {
    tripId: state.tripId,
    trip: state.trip,
    participants: state.participants,
    pools: state.pools,
    poolMembers: state.poolMembers,
    expenses: state.expenses,
    expenseSplits: state.expenseSplits,
    adjustments: state.adjustments,
    settlement: state.settlement,
    myRole: state.myRole,
    isOwner,
    loading: state.loading,
    statusMessage: state.statusMessage,
    ...core,
    ...participants,
    ...pools,
    ...expenses,
    ...adjustments,
  };
});
