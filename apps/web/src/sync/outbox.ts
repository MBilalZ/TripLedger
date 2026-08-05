import { db, newId, type OutboxOpType, type OutboxRow } from "@/db/dexie";
import { setPendingCount } from "./status";

export async function refreshPendingCount(): Promise<number> {
  const count = await db.outbox.count();
  setPendingCount(count);
  return count;
}

export async function enqueueOutbox(
  tripId: string,
  op: OutboxOpType,
  payload: unknown,
  id = newId("op"),
): Promise<string> {
  const row: OutboxRow = {
    id,
    tripId,
    op,
    payload,
    createdAt: new Date().toISOString(),
    retries: 0,
    lastError: null,
  };
  await db.outbox.add(row);
  await refreshPendingCount();
  return id;
}

export async function listOutbox(tripId?: string): Promise<OutboxRow[]> {
  if (tripId) {
    return db.outbox.where("tripId").equals(tripId).sortBy("createdAt");
  }
  return db.outbox.orderBy("createdAt").toArray();
}

/** Trip ids with a pending delete/leave that must not be resurrected by pull/list. */
export async function pendingDeleteTripIds(): Promise<Set<string>> {
  const rows = await db.outbox.toArray();
  const ids = new Set<string>();
  for (const row of rows) {
    if (row.op === "deleteTrip" && row.tripId) ids.add(row.tripId);
  }
  return ids;
}

/** Prefer the oldest outbox row's lastError for UI when flush leaves failures queued. */
export async function headOutboxError(): Promise<string | null> {
  const rows = await db.outbox.orderBy("createdAt").toArray();
  for (const row of rows) {
    if (row.lastError) return row.lastError;
  }
  return null;
}

export async function removeOutbox(id: string): Promise<void> {
  await db.outbox.delete(id);
  await refreshPendingCount();
}

export async function markOutboxError(id: string, message: string): Promise<void> {
  const row = await db.outbox.get(id);
  if (!row) return;
  await db.outbox.update(id, {
    retries: row.retries + 1,
    lastError: message,
  });
}
