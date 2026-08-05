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
  // Strip Vue reactive proxies (and other non-cloneables) so IndexedDB structured
  // clone succeeds — callers often pass store arrays like pools/participants.
  const plainPayload = JSON.parse(JSON.stringify(payload ?? null)) as unknown;
  const row: OutboxRow = {
    id,
    tripId,
    op,
    payload: plainPayload,
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
