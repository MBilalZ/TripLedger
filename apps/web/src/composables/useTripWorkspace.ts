import { computed, onUnmounted, ref, watch } from "vue";
import { allocateSplit, settleTrip } from "@tripledger/engine";
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
import { factsFromState } from "@/lib/factsFromState";
import { cloudLoadWorkspace, cloudTouchTrip } from "@/lib/cloud/tripsApi";
import { getSupabase } from "@/lib/supabase";
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
  const statusMessage = ref("");
  let realtimeChannel: ReturnType<ReturnType<typeof getSupabase>["channel"]> | null =
    null;

  const useCloud = () => trips.cloud;

  function recomputeSettlement() {
    if (!trip.value) {
      settlement.value = null;
      return;
    }
    settlement.value = settleTrip(
      factsFromState({
        trip: trip.value,
        participants: participants.value,
        pools: pools.value,
        poolMembers: poolMembers.value,
        expenses: expenses.value,
        expenseSplits: expenseSplits.value,
        adjustments: adjustments.value,
      }),
    );
  }

  function announce(msg: string) {
    statusMessage.value = msg;
  }

  async function touch() {
    const id = tripId();
    if (useCloud()) {
      await cloudTouchTrip(id);
      if (trip.value) {
        trip.value = {
          ...trip.value,
          updatedAt: new Date().toISOString(),
        };
      }
      return;
    }
    await trips.touch(id);
    if (trip.value) {
      trip.value = { ...trip.value, updatedAt: new Date().toISOString() };
    }
  }

  async function reload(opts: { quiet?: boolean } = {}) {
    if (!opts.quiet) loading.value = true;
    try {
      const id = tripId();
      if (useCloud()) {
        const data = await cloudLoadWorkspace(id);
        trip.value = data.trip;
        participants.value = data.participants;
        pools.value = data.pools;
        poolMembers.value = data.poolMembers;
        expenses.value = data.expenses;
        expenseSplits.value = data.expenseSplits;
        adjustments.value = data.adjustments;
      } else {
        trip.value = (await db.trips.get(id)) ?? null;
        participants.value = await db.participants
          .where("tripId")
          .equals(id)
          .toArray();
        pools.value = await db.pools.where("tripId").equals(id).toArray();
        poolMembers.value = await db.poolMembers
          .where("tripId")
          .equals(id)
          .toArray();
        expenses.value = await db.expenses
          .where("tripId")
          .equals(id)
          .filter((e) => !e.supersededById)
          .sortBy("createdAt");
        expenseSplits.value = await db.expenseSplits
          .where("tripId")
          .equals(id)
          .toArray();
        adjustments.value = await db.adjustments
          .where("tripId")
          .equals(id)
          .toArray();
      }
      recomputeSettlement();
    } finally {
      if (!opts.quiet) loading.value = false;
    }
  }

  function subscribeRealtime() {
    if (!useCloud()) return;
    const id = tripId();
    try {
      const sb = getSupabase();
      if (realtimeChannel) {
        void sb.removeChannel(realtimeChannel);
        realtimeChannel = null;
      }
      realtimeChannel = sb
        .channel(`trip:${id}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "participants", filter: `trip_id=eq.${id}` },
          () => void reload({ quiet: true }),
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "pools", filter: `trip_id=eq.${id}` },
          () => void reload({ quiet: true }),
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "pool_members", filter: `trip_id=eq.${id}` },
          () => void reload({ quiet: true }),
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "expenses", filter: `trip_id=eq.${id}` },
          () => void reload({ quiet: true }),
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "expense_splits", filter: `trip_id=eq.${id}` },
          () => void reload({ quiet: true }),
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "adjustments", filter: `trip_id=eq.${id}` },
          () => void reload({ quiet: true }),
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "trips", filter: `id=eq.${id}` },
          () => void reload({ quiet: true }),
        )
        .subscribe();
    } catch {
      /* ignore if client missing */
    }
  }

  watch(
    tripId,
    async () => {
      await reload();
      subscribeRealtime();
    },
    { immediate: true },
  );

  onUnmounted(() => {
    if (realtimeChannel && useCloud()) {
      void getSupabase().removeChannel(realtimeChannel);
    }
  });

  const participantName = computed(() => {
    const m = new Map(participants.value.map((p) => [p.id, p.displayName]));
    return (id: string) => m.get(id) ?? id;
  });

  const poolName = computed(() => {
    const m = new Map(pools.value.map((p) => [p.id, p.name]));
    return (id: string) => m.get(id) ?? id;
  });

  async function cloudInsert(table: string, row: Record<string, unknown>) {
    const { error } = await getSupabase().from(table).insert(row);
    if (error) throw error;
  }

  async function cloudUpdate(
    table: string,
    id: string,
    patch: Record<string, unknown>,
  ) {
    const { error } = await getSupabase().from(table).update(patch).eq("id", id);
    if (error) throw error;
  }

  async function cloudDelete(table: string, id: string) {
    const { error } = await getSupabase().from(table).delete().eq("id", id);
    if (error) throw error;
  }

  async function addParticipant(displayName: string) {
    const name = displayName.trim();
    if (!name) return;
    const pid = newId("p");
    const row: ParticipantRow = {
      id: pid,
      tripId: tripId(),
      displayName: name,
    };
    const memberRows: PoolMemberRow[] = pools.value.map((pool) => ({
      id: newId("pm"),
      tripId: tripId(),
      poolId: pool.id,
      participantId: pid,
      included: true,
      shares: 1,
      percentBps: 0,
      exactPaisa: 0,
    }));

    if (useCloud()) {
      await cloudInsert("participants", {
        id: pid,
        trip_id: tripId(),
        display_name: name,
        user_id: null,
      });
      for (const m of memberRows) {
        await cloudInsert("pool_members", {
          id: m.id,
          trip_id: m.tripId,
          pool_id: m.poolId,
          participant_id: m.participantId,
          included: m.included,
          shares: m.shares,
          percent_bps: m.percentBps,
          exact_paisa: m.exactPaisa,
        });
      }
    } else {
      await db.participants.add(row);
      if (memberRows.length) await db.poolMembers.bulkAdd(memberRows);
    }

    participants.value = [...participants.value, row];
    poolMembers.value = [...poolMembers.value, ...memberRows];
    await touch();
    recomputeSettlement();
    announce(`Added ${name}`);
  }

  function participantDeleteBlockers(id: string): string[] {
    const blockers: string[] = [];
    const asPayer = expenses.value.filter((e) => e.paidById === id).length;
    if (asPayer > 0) {
      blockers.push(`payer on ${asPayer} expense${asPayer === 1 ? "" : "s"}`);
    }
    const onAdj = adjustments.value.filter(
      (a) => a.fromId === id || a.toId === id,
    ).length;
    if (onAdj > 0) {
      blockers.push(`on ${onAdj} adjustment${onAdj === 1 ? "" : "s"}`);
    }
    if (trip.value?.settlementHubId === id) {
      blockers.push("settlement hub — pick another hub in Settle first");
    }
    return blockers;
  }

  async function removeParticipant(id: string) {
    const blockers = participantDeleteBlockers(id);
    if (blockers.length) {
      throw new Error(
        `Cannot delete this person (${blockers.join("; ")}). Remove or reassign those first.`,
      );
    }
    if (useCloud()) {
      await getSupabase()
        .from("pool_members")
        .delete()
        .eq("participant_id", id);
      await getSupabase()
        .from("expense_splits")
        .delete()
        .eq("participant_id", id);
      await cloudDelete("participants", id);
    } else {
      await db.transaction(
        "rw",
        [db.participants, db.poolMembers, db.expenseSplits],
        async () => {
          await db.participants.delete(id);
          await db.poolMembers.where("participantId").equals(id).delete();
          await db.expenseSplits.where("participantId").equals(id).delete();
        },
      );
    }
    participants.value = participants.value.filter((p) => p.id !== id);
    poolMembers.value = poolMembers.value.filter((m) => m.participantId !== id);
    expenseSplits.value = expenseSplits.value.filter(
      (s) => s.participantId !== id,
    );
    await touch();
    recomputeSettlement();
    announce("Person removed");
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
    if (patch.currency !== undefined) updates.currency = "PKR";

    if (useCloud()) {
      await cloudUpdate("trips", tripId(), {
        name: updates.name,
        currency: updates.currency,
        updated_at: updates.updatedAt,
      });
    } else {
      await db.trips.update(tripId(), updates);
    }
    if (trip.value) trip.value = { ...trip.value, ...updates };
    recomputeSettlement();
    announce("Trip updated");
  }

  async function updateParticipant(
    id: string,
    patch: { displayName: string },
  ) {
    const displayName = patch.displayName.trim();
    if (!displayName) throw new Error("Name is required");
    if (useCloud()) {
      await cloudUpdate("participants", id, { display_name: displayName });
    } else {
      await db.participants.update(id, { displayName });
    }
    participants.value = participants.value.map((p) =>
      p.id === id ? { ...p, displayName } : p,
    );
    await touch();
    recomputeSettlement();
    announce("Person updated");
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

    if (useCloud()) {
      await cloudUpdate("pools", id, {
        ...(updates.name !== undefined ? { name: updates.name } : {}),
        ...(updates.splitMode !== undefined
          ? { split_mode: updates.splitMode }
          : {}),
      });
    } else {
      await db.pools.update(id, updates);
    }
    pools.value = pools.value.map((p) =>
      p.id === id ? { ...p, ...updates } : p,
    );
    await touch();
    recomputeSettlement();
    announce("Pool updated");
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
    if (!participants.value.length) {
      throw new Error("Add at least one person before creating a pool");
    }
    const poolId = newId("pool");
    const pool: PoolRow = {
      id: poolId,
      tripId: tripId(),
      name: n,
      splitMode: "shares",
    };
    const members: PoolMemberRow[] = participants.value.map((p) => ({
      id: newId("pm"),
      tripId: tripId(),
      poolId,
      participantId: p.id,
      included: true,
      shares: 1,
      percentBps: 0,
      exactPaisa: 0,
    }));

    if (useCloud()) {
      await cloudInsert("pools", {
        id: poolId,
        trip_id: tripId(),
        name: n,
        split_mode: "shares",
      });
      for (const m of members) {
        await cloudInsert("pool_members", {
          id: m.id,
          trip_id: m.tripId,
          pool_id: m.poolId,
          participant_id: m.participantId,
          included: true,
          shares: 1,
          percent_bps: 0,
          exact_paisa: 0,
        });
      }
    } else {
      await db.pools.add(pool);
      if (members.length) await db.poolMembers.bulkAdd(members);
    }

    pools.value = [...pools.value, pool];
    poolMembers.value = [...poolMembers.value, ...members];
    await touch();
    recomputeSettlement();
    announce(`Pool “${n}” added`);
    return poolId;
  }

  async function ensureDefaultPool(): Promise<string> {
    if (pools.value.length > 0) return pools.value[0]!.id;
    if (!participants.value.length) {
      throw new Error("Add at least one person before adding expenses");
    }
    const poolId = await addPool("General");
    if (!poolId) throw new Error("Could not create default pool");
    return poolId;
  }

  function poolDeleteBlockers(id: string): string[] {
    const count = expenses.value.filter((e) => e.poolId === id).length;
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
    if (useCloud()) {
      await getSupabase().from("pool_members").delete().eq("pool_id", id);
      await cloudDelete("pools", id);
    } else {
      await db.transaction("rw", [db.pools, db.poolMembers], async () => {
        await db.pools.delete(id);
        await db.poolMembers.where("poolId").equals(id).delete();
      });
    }
    pools.value = pools.value.filter((p) => p.id !== id);
    poolMembers.value = poolMembers.value.filter((m) => m.poolId !== id);
    await touch();
    recomputeSettlement();
    announce("Pool deleted");
  }

  async function setPoolSplitMode(poolId: string, splitMode: SplitMode) {
    await updatePool(poolId, { splitMode });
  }

  async function upsertPoolMember(
    poolId: string,
    participantId: string,
    patch: Partial<
      Pick<PoolMemberRow, "included" | "shares" | "percentBps" | "exactPaisa">
    >,
  ) {
    const clean = Object.fromEntries(
      Object.entries(patch).filter(([, v]) => v !== undefined),
    ) as Partial<
      Pick<PoolMemberRow, "included" | "shares" | "percentBps" | "exactPaisa">
    >;
    const existing = poolMembers.value.find(
      (m) => m.poolId === poolId && m.participantId === participantId,
    );

    if (existing) {
      if (!Object.keys(clean).length) return;
      if (useCloud()) {
        await cloudUpdate("pool_members", existing.id, {
          ...(clean.included !== undefined ? { included: clean.included } : {}),
          ...(clean.shares !== undefined ? { shares: clean.shares } : {}),
          ...(clean.percentBps !== undefined
            ? { percent_bps: clean.percentBps }
            : {}),
          ...(clean.exactPaisa !== undefined
            ? { exact_paisa: clean.exactPaisa }
            : {}),
        });
      } else {
        await db.poolMembers.update(existing.id, clean);
      }
      poolMembers.value = poolMembers.value.map((m) =>
        m.id === existing.id ? { ...m, ...clean } : m,
      );
    } else {
      const row: PoolMemberRow = {
        id: newId("pm"),
        tripId: tripId(),
        poolId,
        participantId,
        included: clean.included ?? true,
        shares: clean.shares ?? 1,
        percentBps: clean.percentBps ?? 0,
        exactPaisa: clean.exactPaisa ?? 0,
      };
      if (useCloud()) {
        await cloudInsert("pool_members", {
          id: row.id,
          trip_id: row.tripId,
          pool_id: row.poolId,
          participant_id: row.participantId,
          included: row.included,
          shares: row.shares,
          percent_bps: row.percentBps,
          exact_paisa: row.exactPaisa,
        });
      } else {
        await db.poolMembers.add(row);
      }
      poolMembers.value = [...poolMembers.value, row];
    }
    await touch();
    recomputeSettlement();
  }

  async function resolveExpensePoolId(poolId: string): Promise<string> {
    if (poolId && pools.value.some((p) => p.id === poolId)) return poolId;
    if (pools.value.length > 0) throw new Error("Select a pool");
    return ensureDefaultPool();
  }

  function assertExpenseInput(input: ExpenseInput) {
    if (!input.description.trim()) throw new Error("Description is required");
    if (!input.paidById) throw new Error("Select who paid");
    if (!participants.value.some((p) => p.id === input.paidById)) {
      throw new Error("Select a valid payer");
    }
  }

  async function addExpense(input: ExpenseInput) {
    assertExpenseInput(input);
    const poolId = await resolveExpensePoolId(input.poolId);
    const amountPaisa = Math.round(input.amountRupees * 100);
    if (amountPaisa <= 0) throw new Error("Amount must be > 0");
    const expenseId = newId("exp");
    const row: ExpenseRow = {
      id: expenseId,
      tripId: tripId(),
      poolId,
      description: input.description.trim(),
      category: input.category,
      amountPaisa,
      paidById: input.paidById,
      date: input.date,
      notes: input.notes,
      supersededById: null,
      createdAt: new Date().toISOString(),
      splitMode: input.splitMode,
    };
    const splits: ExpenseSplitRow[] =
      input.splitMode && input.splits
        ? input.splits.map((s) => ({
            id: newId("es"),
            tripId: tripId(),
            expenseId,
            ...s,
          }))
        : [];

    if (useCloud()) {
      await cloudInsert("expenses", {
        id: row.id,
        trip_id: row.tripId,
        pool_id: row.poolId,
        description: row.description,
        category: row.category,
        amount_paisa: row.amountPaisa,
        paid_by_id: row.paidById,
        date: row.date,
        notes: row.notes,
        superseded_by_id: null,
        created_at: row.createdAt,
        split_mode: row.splitMode,
      });
      for (const s of splits) {
        await cloudInsert("expense_splits", {
          id: s.id,
          trip_id: s.tripId,
          expense_id: s.expenseId,
          participant_id: s.participantId,
          included: s.included,
          shares: s.shares,
          percent_bps: s.percentBps,
          exact_paisa: s.exactPaisa,
        });
      }
    } else {
      await db.transaction("rw", [db.expenses, db.expenseSplits], async () => {
        await db.expenses.add(row);
        if (splits.length) await db.expenseSplits.bulkAdd(splits);
      });
    }

    expenses.value = [...expenses.value, row];
    if (splits.length) {
      expenseSplits.value = [...expenseSplits.value, ...splits];
    }
    await touch();
    recomputeSettlement();
    announce("Expense added");
  }

  async function reviseExpense(expenseId: string, input: ExpenseInput) {
    const old = expenses.value.find((e) => e.id === expenseId);
    if (!old || old.supersededById) throw new Error("Expense not found");
    assertExpenseInput(input);
    const poolId = await resolveExpensePoolId(input.poolId);
    const amountPaisa = Math.round(input.amountRupees * 100);
    if (amountPaisa <= 0) throw new Error("Amount must be > 0");
    const newExpenseId = newId("exp");
    const row: ExpenseRow = {
      id: newExpenseId,
      tripId: tripId(),
      poolId,
      description: input.description.trim(),
      category: input.category,
      amountPaisa,
      paidById: input.paidById,
      date: input.date,
      notes: input.notes,
      supersededById: null,
      createdAt: new Date().toISOString(),
      splitMode: input.splitMode,
    };
    const splits: ExpenseSplitRow[] =
      input.splitMode && input.splits
        ? input.splits.map((s) => ({
            id: newId("es"),
            tripId: tripId(),
            expenseId: newExpenseId,
            ...s,
          }))
        : [];

    if (useCloud()) {
      await cloudInsert("expenses", {
        id: row.id,
        trip_id: row.tripId,
        pool_id: row.poolId,
        description: row.description,
        category: row.category,
        amount_paisa: row.amountPaisa,
        paid_by_id: row.paidById,
        date: row.date,
        notes: row.notes,
        superseded_by_id: null,
        created_at: row.createdAt,
        split_mode: row.splitMode,
      });
      await cloudUpdate("expenses", expenseId, {
        superseded_by_id: newExpenseId,
      });
      await getSupabase()
        .from("expense_splits")
        .delete()
        .eq("expense_id", expenseId);
      for (const s of splits) {
        await cloudInsert("expense_splits", {
          id: s.id,
          trip_id: s.tripId,
          expense_id: s.expenseId,
          participant_id: s.participantId,
          included: s.included,
          shares: s.shares,
          percent_bps: s.percentBps,
          exact_paisa: s.exactPaisa,
        });
      }
    } else {
      await db.transaction("rw", [db.expenses, db.expenseSplits], async () => {
        await db.expenses.add(row);
        await db.expenses.update(expenseId, { supersededById: newExpenseId });
        await db.expenseSplits.where("expenseId").equals(expenseId).delete();
        if (splits.length) await db.expenseSplits.bulkAdd(splits);
      });
    }

    expenses.value = [
      ...expenses.value.filter((e) => e.id !== expenseId),
      row,
    ];
    expenseSplits.value = [
      ...expenseSplits.value.filter((s) => s.expenseId !== expenseId),
      ...splits,
    ];
    await touch();
    recomputeSettlement();
    announce("Expense updated");
  }

  async function voidExpense(expenseId: string) {
    const old = expenses.value.find((e) => e.id === expenseId);
    if (!old || old.supersededById) return;
    const voidId = `voided_${expenseId}`;
    if (useCloud()) {
      await cloudUpdate("expenses", expenseId, { superseded_by_id: voidId });
      await getSupabase()
        .from("expense_splits")
        .delete()
        .eq("expense_id", expenseId);
    } else {
      await db.transaction("rw", [db.expenses, db.expenseSplits], async () => {
        await db.expenses.update(expenseId, { supersededById: voidId });
        await db.expenseSplits.where("expenseId").equals(expenseId).delete();
      });
    }
    expenses.value = expenses.value.filter((e) => e.id !== expenseId);
    expenseSplits.value = expenseSplits.value.filter(
      (s) => s.expenseId !== expenseId,
    );
    await touch();
    recomputeSettlement();
    announce("Expense voided");
  }

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
    const amountPaisa = Math.round(input.amountRupees * 100);
    if (amountPaisa <= 0) throw new Error("Amount must be > 0");
    if (input.fromId === input.toId) throw new Error("From and To must differ");
    const row: AdjustmentRow = {
      id: newId("adj"),
      tripId: tripId(),
      fromId: input.fromId,
      toId: input.toId,
      amountPaisa,
      reason: input.reason,
      createdAt: new Date().toISOString(),
      groupId: input.groupId ?? null,
    };
    if (useCloud()) {
      await cloudInsert("adjustments", {
        id: row.id,
        trip_id: row.tripId,
        from_id: row.fromId,
        to_id: row.toId,
        amount_paisa: row.amountPaisa,
        reason: row.reason,
        created_at: row.createdAt,
        adjustment_group_id: row.groupId ?? null,
      });
    } else {
      await db.adjustments.add(row);
    }
    adjustments.value = [...adjustments.value, row];
    await touch();
    recomputeSettlement();
    announce("Adjustment added");
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
    const amountPaisa = Math.round(input.amountRupees * 100);
    if (amountPaisa <= 0) throw new Error("Amount must be > 0");
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
    announce("Split adjustment added");
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
    const amountPaisa = Math.round(input.amountRupees * 100);
    if (amountPaisa <= 0) throw new Error("Amount must be > 0");
    if (input.fromId === input.toId) throw new Error("From and To must differ");
    if (useCloud()) {
      await cloudUpdate("adjustments", id, {
        from_id: input.fromId,
        to_id: input.toId,
        amount_paisa: amountPaisa,
        reason: input.reason,
      });
    } else {
      await db.adjustments.update(id, {
        fromId: input.fromId,
        toId: input.toId,
        amountPaisa,
        reason: input.reason,
      });
    }
    adjustments.value = adjustments.value.map((a) =>
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
    await touch();
    recomputeSettlement();
    announce("Adjustment updated");
  }

  async function removeAdjustment(id: string) {
    const target = adjustments.value.find((a) => a.id === id);
    const groupId = target?.groupId;
    const ids =
      groupId && groupId.length
        ? adjustments.value.filter((a) => a.groupId === groupId).map((a) => a.id)
        : [id];

    if (useCloud()) {
      for (const adjId of ids) await cloudDelete("adjustments", adjId);
    } else {
      for (const adjId of ids) await db.adjustments.delete(adjId);
    }
    adjustments.value = adjustments.value.filter((a) => !ids.includes(a.id));
    await touch();
    recomputeSettlement();
    announce("Adjustment deleted");
  }

  async function updateSettlementSettings(patch: {
    transferMode?: TransferMode;
    settlementRounding?: SettlementRounding;
    settlementHubId?: string | null;
  }) {
    const updatedAt = new Date().toISOString();
    if (useCloud()) {
      await cloudUpdate("trips", tripId(), {
        ...(patch.transferMode !== undefined
          ? { transfer_mode: patch.transferMode }
          : {}),
        ...(patch.settlementRounding !== undefined
          ? { settlement_rounding: patch.settlementRounding }
          : {}),
        ...(patch.settlementHubId !== undefined
          ? { settlement_hub_id: patch.settlementHubId }
          : {}),
        updated_at: updatedAt,
      });
    } else {
      await db.trips.update(tripId(), { ...patch, updatedAt });
    }
    if (trip.value) {
      trip.value = { ...trip.value, ...patch, updatedAt };
    }
    recomputeSettlement();
    announce("Settlement settings updated");
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
    statusMessage,
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
    addSplitAdjustments,
    updateAdjustment,
    removeAdjustment,
    updateSettlementSettings,
  };
}
