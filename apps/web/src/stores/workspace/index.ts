import { defineStore } from "pinia";
import { createAdjustmentActions } from "./adjustments";
import { createCoreActions } from "./core";
import { createExpenseActions } from "./expenses";
import { createParticipantActions } from "./participants";
import { createPoolActions } from "./pools";
import { createWorkspaceState } from "./state";

export const useWorkspaceStore = defineStore("workspace", () => {
  const state = createWorkspaceState();
  const core = createCoreActions(state);
  const participants = createParticipantActions(state, core);
  const pools = createPoolActions(state, core);
  const expenses = createExpenseActions(state, core, pools);
  const adjustments = createAdjustmentActions(state, core);

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
    loading: state.loading,
    statusMessage: state.statusMessage,
    ...core,
    ...participants,
    ...pools,
    ...expenses,
    ...adjustments,
  };
});
