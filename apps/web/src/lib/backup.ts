import { assertBackupPayload } from "@tripledger/validation";
import { saveAs } from "file-saver";
import {
  type AdjustmentRow,
  db,
  type ExpenseRow,
  type ExpenseSplitRow,
  type ParticipantRow,
  type PoolMemberRow,
  type PoolRow,
  type TripRow,
} from "@/db/dexie";

export interface TripExportPayload {
  version: 2;
  exportedAt: string;
  trip: TripRow;
  participants: ParticipantRow[];
  pools: PoolRow[];
  poolMembers: PoolMemberRow[];
  expenses: ExpenseRow[];
  expenseSplits: ExpenseSplitRow[];
  adjustments: AdjustmentRow[];
}

export interface FullBackupPayload {
  version: 2;
  exportedAt: string;
  trips: TripExportPayload[];
}

function normalizeTrip(trip: TripRow): TripRow {
  return {
    ...trip,
    transferMode: trip.transferMode ?? "minimize",
    settlementRounding: trip.settlementRounding ?? "rupee",
    settlementHubId: trip.settlementHubId ?? null,
  };
}

function normalizePool(p: PoolRow): PoolRow {
  return { ...p, splitMode: p.splitMode ?? "shares" };
}

function normalizeMember(m: PoolMemberRow): PoolMemberRow {
  const shares = Math.max(1, m.shares ?? m.headCount ?? 1);
  return {
    ...m,
    included: m.included ?? true,
    shares,
    percentBps: m.percentBps ?? 0,
    exactPaisa: m.exactPaisa ?? 0,
  };
}

function normalizeExpense(e: ExpenseRow): ExpenseRow {
  return { ...e, splitMode: e.splitMode ?? null };
}

export async function exportTripJson(tripId: string): Promise<TripExportPayload> {
  const trip = await db.trips.get(tripId);
  if (!trip) throw new Error("Trip not found");

  const [participants, pools, poolMembers, expenses, expenseSplits, adjustments] =
    await Promise.all([
      db.participants.where("tripId").equals(tripId).toArray(),
      db.pools.where("tripId").equals(tripId).toArray(),
      db.poolMembers.where("tripId").equals(tripId).toArray(),
      db.expenses.where("tripId").equals(tripId).toArray(),
      db.expenseSplits.where("tripId").equals(tripId).toArray(),
      db.adjustments.where("tripId").equals(tripId).toArray(),
    ]);

  return {
    version: 2,
    exportedAt: new Date().toISOString(),
    trip: normalizeTrip(trip),
    participants,
    pools: pools.map(normalizePool),
    poolMembers: poolMembers.map(normalizeMember),
    expenses: expenses.map(normalizeExpense),
    expenseSplits,
    adjustments,
  };
}

export async function downloadTripJson(tripId: string): Promise<void> {
  const payload = await exportTripJson(tripId);
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const safe = payload.trip.name.replace(/[^\w-]+/g, "_");
  saveAs(blob, `tripledger-${safe}.json`);
}

export async function downloadFullBackup(): Promise<void> {
  const trips = await db.trips.toArray();
  const payloads: TripExportPayload[] = [];
  for (const t of trips) {
    payloads.push(await exportTripJson(t.id));
  }
  const backup: FullBackupPayload = {
    version: 2,
    exportedAt: new Date().toISOString(),
    trips: payloads,
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: "application/json",
  });
  saveAs(blob, `tripledger-backup-${new Date().toISOString().slice(0, 10)}.json`);
}

export async function importTripJson(
  data: TripExportPayload & { version?: number },
  mode: "replace" | "as-new" = "as-new",
): Promise<string> {
  assertBackupPayload(JSON.stringify(data));

  let trip = normalizeTrip(data.trip);
  let participants = data.participants;
  let pools = (data.pools ?? []).map(normalizePool);
  let poolMembers = (data.poolMembers ?? []).map(normalizeMember);
  let expenses = (data.expenses ?? []).map(normalizeExpense);
  let expenseSplits = data.expenseSplits ?? [];
  let adjustments = data.adjustments ?? [];

  if (mode === "as-new") {
    const idMap = new Map<string, string>();
    const mapId = (old: string) => {
      if (!idMap.has(old)) idMap.set(old, crypto.randomUUID());
      return idMap.get(old)!;
    };
    const remap = (old: string, prefix: string) => `${prefix}_${mapId(old)}`;

    const tripId = remap(trip.id, "trip");
    const pMap = new Map(participants.map((p) => [p.id, remap(p.id, "p")]));
    const poolMap = new Map(pools.map((p) => [p.id, remap(p.id, "pool")]));
    const expMap = new Map(expenses.map((e) => [e.id, remap(e.id, "exp")]));

    trip = {
      ...trip,
      id: tripId,
      name: `${trip.name} (imported)`,
      updatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      settlementHubId: trip.settlementHubId
        ? (pMap.get(trip.settlementHubId) ?? null)
        : null,
    };
    participants = participants.map((p) => ({
      ...p,
      id: pMap.get(p.id)!,
      tripId,
    }));
    pools = pools.map((p) => ({
      ...p,
      id: poolMap.get(p.id)!,
      tripId,
    }));
    poolMembers = poolMembers.map((m) => ({
      ...normalizeMember(m),
      id: remap(m.id, "pm"),
      tripId,
      poolId: poolMap.get(m.poolId)!,
      participantId: pMap.get(m.participantId)!,
    }));
    expenses = expenses.map((e) => ({
      ...normalizeExpense(e),
      id: expMap.get(e.id)!,
      tripId,
      poolId: poolMap.get(e.poolId)!,
      paidById: pMap.get(e.paidById)!,
      supersededById: e.supersededById
        ? (expMap.get(e.supersededById) ?? remap(e.supersededById, "exp"))
        : null,
    }));
    expenseSplits = expenseSplits.map((s) => ({
      ...s,
      id: remap(s.id, "es"),
      tripId,
      expenseId: expMap.get(s.expenseId) ?? remap(s.expenseId, "exp"),
      participantId: pMap.get(s.participantId)!,
    }));
    adjustments = adjustments.map((a) => ({
      ...a,
      id: remap(a.id, "adj"),
      tripId,
      fromId: pMap.get(a.fromId)!,
      toId: pMap.get(a.toId)!,
    }));
  } else {
    await db.transaction(
      "rw",
      [
        db.participants,
        db.pools,
        db.poolMembers,
        db.expenses,
        db.expenseSplits,
        db.adjustments,
        db.trips,
      ],
      async () => {
        await db.participants.where("tripId").equals(trip.id).delete();
        await db.pools.where("tripId").equals(trip.id).delete();
        await db.poolMembers.where("tripId").equals(trip.id).delete();
        await db.expenses.where("tripId").equals(trip.id).delete();
        await db.expenseSplits.where("tripId").equals(trip.id).delete();
        await db.adjustments.where("tripId").equals(trip.id).delete();
        await db.trips.delete(trip.id);
      },
    );
  }

  await db.transaction(
    "rw",
    [
      db.trips,
      db.participants,
      db.pools,
      db.poolMembers,
      db.expenses,
      db.expenseSplits,
      db.adjustments,
    ],
    async () => {
      await db.trips.put(trip);
      await db.participants.bulkPut(participants);
      await db.pools.bulkPut(pools);
      await db.poolMembers.bulkPut(poolMembers);
      await db.expenses.bulkPut(expenses);
      if (expenseSplits.length) await db.expenseSplits.bulkPut(expenseSplits);
      await db.adjustments.bulkPut(adjustments);
    },
  );

  return trip.id;
}

export async function importBackupFile(text: string): Promise<string[]> {
  const parsed = assertBackupPayload(text) as unknown as
    | FullBackupPayload
    | TripExportPayload;
  if ("trips" in parsed && Array.isArray(parsed.trips)) {
    const ids: string[] = [];
    for (const t of parsed.trips) {
      ids.push(await importTripJson(t, "as-new"));
    }
    return ids;
  }
  return [await importTripJson(parsed as TripExportPayload, "as-new")];
}
