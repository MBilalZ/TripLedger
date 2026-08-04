import { computed, ref, watch } from "vue";
import { settleTrip } from "@tripledger/engine";
import type {
  SettlementRounding,
  SettleTripResult,
  SplitMode,
  TransferMode,
} from "@tripledger/types";
import {
  db,
  newId,
  type AdjustmentRow,
  type ExpenseRow,
  type ExpenseSplitRow,
  type ParticipantRow,
  type PoolMemberRow,
  type PoolRow,
  type TripRow,
} from "@/db/dexie";
import { loadTripFacts } from "@/lib/tripFacts";
import { useTripsStore } from "@/stores/trips";

export function useTripWorkspace(tripId: () => string) {
  const trips = useTripsStore();
  const trip = ref<TripRow | null>(null);
  const participants = ref<ParticipantRow[]>([]);
  const pools = ref<PoolRow[]>([]);
  const poolMembers = ref<PoolMemberRow[]>([]);
  const expenses = ref<ExpenseRow[]>([]);
  const expenseSplits = ref<ExpenseSplitRow[]>([]);
  const adjustments = ref<AdjustmentRow[]>([]);
  const settlement = ref<SettleTripResult | null>(null);
  const loading = ref(true);

  async function reload() {
    loading.value = true;
    try {
      const id = tripId();
      trip.value = (await db.trips.get(id)) ?? null;
      participants.value = await db.participants.where("tripId").equals(id).toArray();
      pools.value = await db.pools.where("tripId").equals(id).toArray();
      poolMembers.value = await db.poolMembers.where("tripId").equals(id).toArray();
      expenses.value = await db.expenses
        .where("tripId")
        .equals(id)
        .filter((e) => !e.supersededById)
        .sortBy("createdAt");
      expenseSplits.value = await db.expenseSplits.where("tripId").equals(id).toArray();
      adjustments.value = await db.adjustments.where("tripId").equals(id).toArray();
      if (trip.value) {
        settlement.value = settleTrip(await loadTripFacts(id));
      } else {
        settlement.value = null;
      }
    } finally {
      loading.value = false;
    }
  }

  watch(tripId, () => reload(), { immediate: true });

  const participantName = computed(() => {
    const m = new Map(participants.value.map((p) => [p.id, p.displayName]));
    return (id: string) => m.get(id) ?? id;
  });

  const poolName = computed(() => {
    const m = new Map(pools.value.map((p) => [p.id, p.name]));
    return (id: string) => m.get(id) ?? id;
  });

  async function touch() {
    await trips.touch(tripId());
  }

  async function addParticipant(displayName: string) {
    const name = displayName.trim();
    if (!name) return;
    const pid = newId("p");
    await db.participants.add({
      id: pid,
      tripId: tripId(),
      displayName: name,
    });
    // Add to existing pools as excluded by default
    for (const pool of pools.value) {
      await db.poolMembers.add({
        id: newId("pm"),
        tripId: tripId(),
        poolId: pool.id,
        participantId: pid,
        included: false,
        shares: 1,
        percentBps: 0,
        exactPaisa: 0,
      });
    }
    await touch();
    await reload();
  }

  async function removeParticipant(id: string) {
    await db.transaction(
      "rw",
      [db.participants, db.poolMembers, db.expenseSplits],
      async () => {
        await db.participants.delete(id);
        await db.poolMembers.where("participantId").equals(id).delete();
        await db.expenseSplits.where("participantId").equals(id).delete();
      },
    );
    await touch();
    await reload();
  }

  async function updateTrip(patch: { name?: string; currency?: string }) {
    const updates: Partial<TripRow> = {
      updatedAt: new Date().toISOString(),
    };
    if (patch.name !== undefined) {
      const name = patch.name.trim();
      if (!name) throw new Error("Trip name is required");
      updates.name = name;
    }
    if (patch.currency !== undefined) {
      const currency = patch.currency.trim().toUpperCase() || "PKR";
      updates.currency = currency;
    }
    await db.trips.update(tripId(), updates);
    await reload();
  }

  async function updateParticipant(
    id: string,
    patch: { displayName: string },
  ) {
    const displayName = patch.displayName.trim();
    if (!displayName) throw new Error("Name is required");
    await db.participants.update(id, { displayName });
    await touch();
    await reload();
  }

  async function updatePool(
    id: string,
    patch: { name?: string; splitMode?: SplitMode },
  ) {
    const updates: Partial<PoolRow> = {};
    if (patch.name !== undefined) {
      const name = patch.name.trim();
      if (!name) throw new Error("Pool name is required");
      updates.name = name;
    }
    if (patch.splitMode !== undefined) updates.splitMode = patch.splitMode;
    await db.pools.update(id, updates);
    await touch();
    await reload();
  }

  type ExpenseInput = {
    poolId: string;
    description: string;
    category: string;
    amountRupees: number;
    paidById: string;
    date: string;
    notes: string;
    splitMode: SplitMode | null;
    splits?: Array<{
      participantId: string;
      included: boolean;
      shares: number;
      percentBps: number;
      exactPaisa: number;
    }>;
  };

  async function addPool(name: string) {
    const n = name.trim();
    if (!n) return;
    const poolId = newId("pool");
    await db.pools.add({
      id: poolId,
      tripId: tripId(),
      name: n,
      splitMode: "shares",
    });
    for (const p of participants.value) {
      await db.poolMembers.add({
        id: newId("pm"),
        tripId: tripId(),
        poolId,
        participantId: p.id,
        included: true,
        shares: 1,
        percentBps: 0,
        exactPaisa: 0,
      });
    }
    await touch();
    await reload();
  }

  async function removePool(id: string) {
    await db.transaction("rw", [db.pools, db.poolMembers], async () => {
      await db.pools.delete(id);
      await db.poolMembers.where("poolId").equals(id).delete();
    });
    await touch();
    await reload();
  }

  async function setPoolSplitMode(poolId: string, splitMode: SplitMode) {
    await db.pools.update(poolId, { splitMode });
    await touch();
    await reload();
  }

  async function upsertPoolMember(
    poolId: string,
    participantId: string,
    patch: Partial<
      Pick<PoolMemberRow, "included" | "shares" | "percentBps" | "exactPaisa">
    >,
  ) {
    const existing = poolMembers.value.find(
      (m) => m.poolId === poolId && m.participantId === participantId,
    );
    if (existing) {
      await db.poolMembers.update(existing.id, patch);
    } else {
      await db.poolMembers.add({
        id: newId("pm"),
        tripId: tripId(),
        poolId,
        participantId,
        included: patch.included ?? true,
        shares: patch.shares ?? 1,
        percentBps: patch.percentBps ?? 0,
        exactPaisa: patch.exactPaisa ?? 0,
      });
    }
    await touch();
    await reload();
  }

  async function addExpense(input: ExpenseInput) {
    const amountPaisa = Math.round(input.amountRupees * 100);
    if (amountPaisa <= 0) throw new Error("Amount must be > 0");
    const expenseId = newId("exp");
    await db.transaction("rw", [db.expenses, db.expenseSplits], async () => {
      await db.expenses.add({
        id: expenseId,
        tripId: tripId(),
        poolId: input.poolId,
        description: input.description.trim(),
        category: input.category,
        amountPaisa,
        paidById: input.paidById,
        date: input.date,
        notes: input.notes,
        supersededById: null,
        createdAt: new Date().toISOString(),
        splitMode: input.splitMode,
      });
      if (input.splitMode && input.splits) {
        await db.expenseSplits.bulkAdd(
          input.splits.map((s) => ({
            id: newId("es"),
            tripId: tripId(),
            expenseId,
            ...s,
          })),
        );
      }
    });
    await touch();
    await reload();
  }

  /** Immutable edit: supersede old expense with a new revision. */
  async function reviseExpense(expenseId: string, input: ExpenseInput) {
    const old = await db.expenses.get(expenseId);
    if (!old || old.supersededById) throw new Error("Expense not found");
    const amountPaisa = Math.round(input.amountRupees * 100);
    if (amountPaisa <= 0) throw new Error("Amount must be > 0");
    const newExpenseId = newId("exp");
    await db.transaction("rw", [db.expenses, db.expenseSplits], async () => {
      await db.expenses.add({
        id: newExpenseId,
        tripId: tripId(),
        poolId: input.poolId,
        description: input.description.trim(),
        category: input.category,
        amountPaisa,
        paidById: input.paidById,
        date: input.date,
        notes: input.notes,
        supersededById: null,
        createdAt: new Date().toISOString(),
        splitMode: input.splitMode,
      });
      await db.expenses.update(expenseId, { supersededById: newExpenseId });
      await db.expenseSplits.where("expenseId").equals(expenseId).delete();
      if (input.splitMode && input.splits) {
        await db.expenseSplits.bulkAdd(
          input.splits.map((s) => ({
            id: newId("es"),
            tripId: tripId(),
            expenseId: newExpenseId,
            ...s,
          })),
        );
      }
    });
    await touch();
    await reload();
  }

  async function voidExpense(expenseId: string) {
    const old = await db.expenses.get(expenseId);
    if (!old || old.supersededById) return;
    await db.transaction("rw", [db.expenses, db.expenseSplits], async () => {
      await db.expenses.update(expenseId, {
        supersededById: `voided_${expenseId}`,
      });
      await db.expenseSplits.where("expenseId").equals(expenseId).delete();
    });
    await touch();
    await reload();
  }

  async function addAdjustment(input: {
    fromId: string;
    toId: string;
    amountRupees: number;
    reason: string;
  }) {
    const amountPaisa = Math.round(input.amountRupees * 100);
    if (amountPaisa <= 0) throw new Error("Amount must be > 0");
    if (input.fromId === input.toId) throw new Error("From and To must differ");
    await db.adjustments.add({
      id: newId("adj"),
      tripId: tripId(),
      fromId: input.fromId,
      toId: input.toId,
      amountPaisa,
      reason: input.reason,
      createdAt: new Date().toISOString(),
    });
    await touch();
    await reload();
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
    const amountPaisa = Math.round(input.amountRupees * 100);
    if (amountPaisa <= 0) throw new Error("Amount must be > 0");
    if (input.fromId === input.toId) throw new Error("From and To must differ");
    await db.adjustments.update(id, {
      fromId: input.fromId,
      toId: input.toId,
      amountPaisa,
      reason: input.reason,
    });
    await touch();
    await reload();
  }

  async function removeAdjustment(id: string) {
    await db.adjustments.delete(id);
    await touch();
    await reload();
  }

  async function updateSettlementSettings(patch: {
    transferMode?: TransferMode;
    settlementRounding?: SettlementRounding;
    settlementHubId?: string | null;
  }) {
    await db.trips.update(tripId(), {
      ...patch,
      updatedAt: new Date().toISOString(),
    });
    await reload();
  }

  function poolMember(
    poolId: string,
    participantId: string,
  ): PoolMemberRow | undefined {
    return poolMembers.value.find(
      (m) => m.poolId === poolId && m.participantId === participantId,
    );
  }

  return {
    trip,
    participants,
    pools,
    poolMembers,
    expenses,
    expenseSplits,
    adjustments,
    settlement,
    loading,
    participantName,
    poolName,
    reload,
    addParticipant,
    removeParticipant,
    updateParticipant,
    updateTrip,
    addPool,
    removePool,
    updatePool,
    setPoolSplitMode,
    upsertPoolMember,
    poolMember,
    addExpense,
    reviseExpense,
    voidExpense,
    addAdjustment,
    updateAdjustment,
    removeAdjustment,
    updateSettlementSettings,
  };
}
