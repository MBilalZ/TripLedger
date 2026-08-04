import { getWorkspaceRepo } from "@/repositories";
import type { CoreActions } from "./core";
import type { WorkspaceState } from "./state";

export function createParticipantActions(state: WorkspaceState, core: CoreActions) {
  async function addParticipant(displayName: string) {
    const name = displayName.trim();
    if (!name) return;
    const { participant, members } = await getWorkspaceRepo().addParticipant(
      state.tripId.value,
      name,
      state.pools.value,
    );
    state.participants.value = [...state.participants.value, participant];
    state.poolMembers.value = [...state.poolMembers.value, ...members];
    await core.touch();
    core.recomputeSettlement();
    state.announce(`Added ${name}`);
  }

  function participantDeleteBlockers(id: string): string[] {
    const blockers: string[] = [];
    const asPayer = state.expenses.value.filter((e) => e.paidById === id).length;
    if (asPayer > 0) {
      blockers.push(`payer on ${asPayer} expense${asPayer === 1 ? "" : "s"}`);
    }
    const onAdj = state.adjustments.value.filter(
      (a) => a.fromId === id || a.toId === id,
    ).length;
    if (onAdj > 0) {
      blockers.push(`on ${onAdj} adjustment${onAdj === 1 ? "" : "s"}`);
    }
    if (state.trip.value?.settlementHubId === id) {
      blockers.push("settlement hub — pick another hub in Settle first");
    }
    return blockers;
  }

  async function removeParticipant(id: string) {
    if (state.myRole.value === "member") {
      throw new Error("Only the trip owner can remove people");
    }
    const blockers = participantDeleteBlockers(id);
    if (blockers.length) {
      throw new Error(
        `Cannot delete this person (${blockers.join("; ")}). Remove or reassign those first.`,
      );
    }
    await getWorkspaceRepo().removeParticipant(id);
    state.participants.value = state.participants.value.filter((p) => p.id !== id);
    state.poolMembers.value = state.poolMembers.value.filter(
      (m) => m.participantId !== id,
    );
    state.expenseSplits.value = state.expenseSplits.value.filter(
      (s) => s.participantId !== id,
    );
    await core.touch();
    core.recomputeSettlement();
    state.announce("Person removed");
  }

  async function updateParticipant(id: string, patch: { displayName: string }) {
    await getWorkspaceRepo().updateParticipant(id, patch.displayName);
    state.participants.value = state.participants.value.map((p) =>
      p.id === id ? { ...p, displayName: patch.displayName.trim() } : p,
    );
    await core.touch();
    core.recomputeSettlement();
    state.announce("Person updated");
  }

  return { addParticipant, removeParticipant, updateParticipant };
}
