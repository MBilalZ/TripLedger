import { allocateSplit } from "@tripledger/engine";
import type { SplitMode } from "@tripledger/types";
import { parseRupeesToPaisa } from "@tripledger/validation";
import { type AdjustmentRow, newId } from "@/db/dexie";
import { getWorkspaceRepo } from "@/repositories";
import type { CoreActions } from "./core";
import type { WorkspaceState } from "./state";

/**
 * Payments (adjustments): money moved outside expenses/pools.
 * Engine: fromId adjNet -= amount, toId adjNet += amount.
 * Splitwise "X paid Y" → Y owes X less / X is owed: fromId=Y (received), toId=X (paid by).
 */
export function createAdjustmentActions(state: WorkspaceState, core: CoreActions) {
  async function addAdjustment(input: {
    paidById: string;
    receivedById: string;
    amountRupees: number;
    reason: string;
    groupId?: string | null;
  }) {
    if (!input.paidById || !input.receivedById) {
      throw new Error("Select who paid and who received");
    }
    const amountPaisa = parseRupeesToPaisa(input.amountRupees);
    if (input.paidById === input.receivedById) {
      throw new Error("Paid by and Received by must differ");
    }
    const row: AdjustmentRow = {
      id: newId("adj"),
      tripId: state.tripId.value,
      fromId: input.receivedById,
      toId: input.paidById,
      amountPaisa,
      reason: input.reason,
      createdAt: new Date().toISOString(),
      groupId: input.groupId ?? null,
    };
    await getWorkspaceRepo().addAdjustment(row);
    state.adjustments.value = [...state.adjustments.value, row];
    await core.touch();
    core.recomputeSettlement();
    state.announce("Payment recorded");
    return row.id;
  }

  async function addSplitAdjustments(input: {
    paidById: string;
    amountRupees: number;
    reason: string;
    splitMode: SplitMode;
    recipients: Array<{
      participantId: string;
      included: boolean;
      shares: number;
      percentBps: number;
      exactPaisa: number;
    }>;
  }) {
    if (!input.paidById) throw new Error("Select who paid");
    const amountPaisa = parseRupeesToPaisa(input.amountRupees);
    const lines = input.recipients.filter(
      (d) => d.included && d.participantId !== input.paidById,
    );
    if (!lines.length) throw new Error("Select at least one friend who received");
    const alloc = allocateSplit(amountPaisa, input.splitMode, lines);
    if (alloc.error) throw new Error(alloc.error);
    const groupId = newId("adjg");
    for (const slice of alloc.slices) {
      if (slice.sharePaisa <= 0) continue;
      const row: AdjustmentRow = {
        id: newId("adj"),
        tripId: state.tripId.value,
        fromId: slice.participantId,
        toId: input.paidById,
        amountPaisa: slice.sharePaisa,
        reason: input.reason,
        createdAt: new Date().toISOString(),
        groupId,
      };
      await getWorkspaceRepo().addAdjustment(row);
      state.adjustments.value = [...state.adjustments.value, row];
    }
    await core.touch();
    core.recomputeSettlement();
    state.announce("Payment recorded");
  }

  async function updateAdjustment(
    id: string,
    input: {
      paidById: string;
      receivedById: string;
      amountRupees: number;
      reason: string;
    },
  ) {
    if (!input.paidById || !input.receivedById) {
      throw new Error("Select who paid and who received");
    }
    const amountPaisa = parseRupeesToPaisa(input.amountRupees);
    if (input.paidById === input.receivedById) {
      throw new Error("Paid by and Received by must differ");
    }
    const fromId = input.receivedById;
    const toId = input.paidById;
    await getWorkspaceRepo().updateAdjustment(id, {
      fromId,
      toId,
      amountPaisa,
      reason: input.reason,
    });
    state.adjustments.value = state.adjustments.value.map((a) =>
      a.id === id
        ? {
            ...a,
            fromId,
            toId,
            amountPaisa,
            reason: input.reason,
          }
        : a,
    );
    await core.touch();
    core.recomputeSettlement();
    state.announce("Payment updated");
  }

  async function removeAdjustment(id: string) {
    const target = state.adjustments.value.find((a) => a.id === id);
    const groupId = target?.groupId;
    const ids = groupId?.length
      ? state.adjustments.value.filter((a) => a.groupId === groupId).map((a) => a.id)
      : [id];
    await getWorkspaceRepo().removeAdjustments(ids);
    state.adjustments.value = state.adjustments.value.filter((a) => !ids.includes(a.id));
    await core.touch();
    core.recomputeSettlement();
    state.announce("Payment deleted");
  }

  return {
    addAdjustment,
    addSplitAdjustments,
    updateAdjustment,
    removeAdjustment,
  };
}
