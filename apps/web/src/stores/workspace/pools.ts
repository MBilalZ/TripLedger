import type { SplitMode } from "@tripledger/types";
import { getWorkspaceRepo, type PoolMemberPatch } from "@/repositories";
import type { CoreActions } from "./core";
import type { WorkspaceState } from "./state";

export function createPoolActions(state: WorkspaceState, core: CoreActions) {
  async function addPool(name: string) {
    const { pool, members } = await getWorkspaceRepo().addPool(
      state.tripId.value,
      name,
      state.participants.value,
    );
    state.pools.value = [...state.pools.value, pool];
    state.poolMembers.value = [...state.poolMembers.value, ...members];
    await core.touch();
    core.recomputeSettlement();
    state.announce(`Pool “${pool.name}” added`);
    return pool.id;
  }

  async function ensureDefaultPool(): Promise<string> {
    if (state.pools.value.length > 0) return state.pools.value[0]!.id;
    if (!state.participants.value.length) {
      throw new Error("Add at least one person before adding expenses");
    }
    return addPool("General");
  }

  function poolDeleteBlockers(id: string): string[] {
    const count = state.expenses.value.filter((e) => e.poolId === id).length;
    if (count > 0) {
      return [
        `used by ${count} expense${count === 1 ? "" : "s"} — void or move those first`,
      ];
    }
    return [];
  }

  async function removePool(id: string) {
    const blockers = poolDeleteBlockers(id);
    if (blockers.length) {
      throw new Error(`Cannot delete this pool (${blockers.join("; ")}).`);
    }
    await getWorkspaceRepo().removePool(id);
    state.pools.value = state.pools.value.filter((p) => p.id !== id);
    state.poolMembers.value = state.poolMembers.value.filter(
      (m) => m.poolId !== id,
    );
    await core.touch();
    core.recomputeSettlement();
    state.announce("Pool deleted");
  }

  async function updatePool(
    id: string,
    patch: { name?: string; splitMode?: SplitMode },
  ) {
    const updates = await getWorkspaceRepo().updatePool(id, patch);
    state.pools.value = state.pools.value.map((p) =>
      p.id === id ? { ...p, ...updates } : p,
    );
    await core.touch();
    core.recomputeSettlement();
    state.announce("Pool updated");
  }

  async function setPoolSplitMode(poolId: string, splitMode: SplitMode) {
    await updatePool(poolId, { splitMode });
  }

  async function upsertPoolMember(
    poolId: string,
    participantId: string,
    patch: PoolMemberPatch,
  ) {
    const existing = state.poolMembers.value.find(
      (m) => m.poolId === poolId && m.participantId === participantId,
    );
    const row = await getWorkspaceRepo().upsertPoolMember(
      state.tripId.value,
      poolId,
      participantId,
      existing,
      patch,
    );
    if (existing) {
      state.poolMembers.value = state.poolMembers.value.map((m) =>
        m.id === existing.id ? row : m,
      );
    } else {
      state.poolMembers.value = [...state.poolMembers.value, row];
    }
    await core.touch();
    core.recomputeSettlement();
  }

  function poolMember(poolId: string, participantId: string) {
    return state.poolMembers.value.find(
      (m) => m.poolId === poolId && m.participantId === participantId,
    );
  }

  return {
    addPool,
    ensureDefaultPool,
    removePool,
    updatePool,
    setPoolSplitMode,
    upsertPoolMember,
    poolMember,
  };
}

export type PoolActions = ReturnType<typeof createPoolActions>;
