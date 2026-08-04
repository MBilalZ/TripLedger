import { allocateSplit } from "@tripledger/engine";
import type { SplitMode } from "@tripledger/types";
import { parseRupeesToPaisa } from "@tripledger/validation";
import { newId, type AdjustmentRow } from "@/db/dexie";
import { getWorkspaceRepo } from "@/repositories";
import type { CoreActions } from "./core";
import type { WorkspaceState } from "./state";

export function createAdjustmentActions(
  state: WorkspaceState,
  core: CoreActions,
) {
  async function addAdjustment(input: {
    fromId: string;
    toId: string;
    amountRupees: number;
    reason: string;
    groupId?: string | null;
  }) {
    if (!input.fromId || !input.toId) {
      throw new Error("Select both people");
    }
    const amountPaisa = parseRupeesToPaisa(input.amountRupees);
    if (input.fromId === input.toId) throw new Error("From and To must differ");
    const row: AdjustmentRow = {
      id: newId("adj"),
      tripId: state.tripId.value,
      fromId: input.fromId,
      toId: input.toId,
      amountPaisa,
      reason: input.reason,
      createdAt: new Date().toISOString(),
      groupId: input.groupId ?? null,
    };
    await getWorkspaceRepo().addAdjustment(row);
    state.adjustments.value = [...state.adjustments.value, row];
    await core.touch();
    core.recomputeSettlement();
    state.announce("Adjustment added");
    return row.id;
  }

  async function addSplitAdjustments(input: {
    creditorId: string;
    amountRupees: number;
    reason: string;
    splitMode: SplitMode;
    debtors: Array<{
      participantId: string;
      included: boolean;
      shares: number;
      percentBps: number;
      exactPaisa: number;
    }>;
  }) {
    if (!input.creditorId) throw new Error("Select who is owed");
    const amountPaisa = parseRupeesToPaisa(input.amountRupees);
    const lines = input.debtors.filter(
      (d) => d.included && d.participantId !== input.creditorId,
    );
    if (!lines.length) throw new Error("Select at least one debtor");
    const alloc = allocateSplit(amountPaisa, input.splitMode, lines);
    if (alloc.error) throw new Error(alloc.error);
    const groupId = newId("adjg");
    for (const slice of alloc.slices) {
      if (slice.sharePaisa <= 0) continue;
      await addAdjustment({
        fromId: slice.participantId,
        toId: input.creditorId,
        amountRupees: slice.sharePaisa / 100,
        reason: input.reason,
        groupId,
      });
    }
    state.announce("Split adjustment added");
  }

  async function updateAdjustment(
    id: string,
    input: {
      fromId: string;
      toId: string;
      amountRupees: number;
      reason: string;
    },
  ) {
    if (!input.fromId || !input.toId) {
      throw new Error("Select both people");
    }
    const amountPaisa = parseRupeesToPaisa(input.amountRupees);
    if (input.fromId === input.toId) throw new Error("From and To must differ");
    await getWorkspaceRepo().updateAdjustment(id, {
      fromId: input.fromId,
      toId: input.toId,
      amountPaisa,
      reason: input.reason,
    });
    state.adjustments.value = state.adjustments.value.map((a) =>
      a.id === id
        ? {
            ...a,
            fromId: input.fromId,
            toId: input.toId,
            amountPaisa,
            reason: input.reason,
          }
        : a,
    );
    await core.touch();
    core.recomputeSettlement();
    state.announce("Adjustment updated");
  }

  async function removeAdjustment(id: string) {
    const target = state.adjustments.value.find((a) => a.id === id);
    const groupId = target?.groupId;
    const ids =
      groupId && groupId.length
        ? state.adjustments.value
            .filter((a) => a.groupId === groupId)
            .map((a) => a.id)
        : [id];
    await getWorkspaceRepo().removeAdjustments(ids);
    state.adjustments.value = state.adjustments.value.filter(
      (a) => !ids.includes(a.id),
    );
    await core.touch();
    core.recomputeSettlement();
    state.announce("Adjustment deleted");
  }

  return {
    addAdjustment,
    addSplitAdjustments,
    updateAdjustment,
    removeAdjustment,
  };
}
