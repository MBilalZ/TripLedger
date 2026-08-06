import { db, newId, type ParticipantRow, type TripRow } from "@/db/dexie";
import { requireUser } from "@/services/supabase";
import * as tripsApi from "@/services/trips";
import {
  deleteCachedTrip,
  listCachedCloudTrips,
  writeCachedWorkspace,
} from "@/sync/cache";
import { flushOutbox, syncAllCloudTrips } from "@/sync/engine";
import {
  enqueueOutbox,
  listOutbox,
  pendingDeleteTripIds,
  removeOutbox,
} from "@/sync/outbox";
import type { CreateTripOptions, LeaveTripResult, TripListRepo } from "../types";
import { cloudTripListRepo } from "./tripList";

function online(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

async function dropOps(tripId: string, op: string) {
  for (const row of await listOutbox(tripId)) {
    if (row.op === op) await removeOutbox(row.id);
  }
}

async function filterPendingDeletes(trips: TripRow[]): Promise<TripRow[]> {
  const deleted = await pendingDeleteTripIds();
  if (!deleted.size) return trips;
  return trips.filter((t) => !deleted.has(t.id));
}

async function enqueueAndRun(
  tripId: string,
  mode: "leave" | "delete",
  run: () => Promise<void>,
): Promise<void> {
  await enqueueOutbox(tripId, "deleteTrip", { mode });
  await deleteCachedTrip(tripId);
  // deleteCachedTrip clears outbox for trip — re-queue for server.
  await enqueueOutbox(tripId, "deleteTrip", { mode });
  if (online()) {
    try {
      await run();
      await dropOps(tripId, "deleteTrip");
    } catch {
      /* queued */
    }
  }
}

export const syncCloudTripListRepo: TripListRepo = {
  async list() {
    const user = await requireUser();
    if (online()) {
      try {
        await syncAllCloudTrips();
        return filterPendingDeletes(await tripsApi.listTrips());
      } catch {
        return filterPendingDeletes(await listCachedCloudTrips(user));
      }
    }
    return filterPendingDeletes(await listCachedCloudTrips(user));
  },

  async create(name, options: CreateTripOptions = {}) {
    const user = await requireUser();
    const trimmed = name.trim();
    if (!trimmed) throw new Error("Trip name is required");

    const tripId = newId("trip");
    const participantId = newId("p");
    const now = new Date().toISOString();
    const trip: TripRow = {
      id: tripId,
      name: trimmed,
      currency: "PKR",
      createdAt: now,
      updatedAt: now,
      transferMode: options.transferMode ?? "minimize",
      settlementRounding: options.settlementRounding ?? "rupee",
      settlementHubId: null,
      cloudUserId: user,
    };
    const participant: ParticipantRow = {
      id: participantId,
      tripId,
      displayName: "You",
    };

    await db.trips.put(trip);
    await db.participants.put(participant);
    await db.syncMeta.put({
      tripId,
      userId: user,
      lastPulledAt: null,
      serverUpdatedAt: now,
      myRole: "owner",
    });

    await enqueueOutbox(tripId, "createTrip", {
      trip,
      participantId,
      options,
    });

    if (online()) {
      try {
        await tripsApi.createTripWithIds(tripId, participantId, trimmed, options);
        await dropOps(tripId, "createTrip");
        await writeCachedWorkspace(user, {
          trip,
          participants: [participant],
          pools: [],
          poolMembers: [],
          expenses: [],
          expenseSplits: [],
          adjustments: [],
          myRole: "owner",
        });
      } catch {
        // Remains queued for flushOutbox.
      }
    }

    return tripId;
  },

  async delete(tripId) {
    await enqueueAndRun(tripId, "delete", () => tripsApi.deleteTrip(tripId));
  },

  async leave(tripId): Promise<LeaveTripResult> {
    let result: LeaveTripResult = { action: "left" };
    await enqueueAndRun(tripId, "leave", async () => {
      const r = await tripsApi.leaveTrip(tripId);
      result = {
        action: r.action,
        promotedUserId: r.promotedUserId,
      };
    });
    return result;
  },

  async touch(tripId) {
    await db.trips.update(tripId, { updatedAt: new Date().toISOString() });
    await enqueueOutbox(tripId, "touchTrip", {});
    if (online()) {
      try {
        await cloudTripListRepo.touch(tripId);
        await dropOps(tripId, "touchTrip");
      } catch {
        await flushOutbox(tripId);
      }
    }
  },
};
