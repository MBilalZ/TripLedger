import { requireUser } from "@/api/supabase";
import * as tripsApi from "@/api/trips";
import { db, newId, type ParticipantRow, type TripRow } from "@/db/dexie";
import {
  deleteCachedTrip,
  listCachedCloudTrips,
  writeCachedWorkspace,
} from "@/sync/cache";
import { flushOutbox, syncAllCloudTrips } from "@/sync/engine";
import { enqueueOutbox, listOutbox, removeOutbox } from "@/sync/outbox";
import type { CreateTripOptions, TripListRepo } from "../types";
import { cloudTripListRepo } from "./tripList";

function online(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

async function dropOps(tripId: string, op: string) {
  for (const row of await listOutbox(tripId)) {
    if (row.op === op) await removeOutbox(row.id);
  }
}

export const syncCloudTripListRepo: TripListRepo = {
  async list() {
    const user = await requireUser();
    if (online()) {
      try {
        await syncAllCloudTrips();
        return tripsApi.listTrips();
      } catch {
        return listCachedCloudTrips(user);
      }
    }
    return listCachedCloudTrips(user);
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
    await enqueueOutbox(tripId, "deleteTrip", {});
    await deleteCachedTrip(tripId);
    // deleteCachedTrip clears outbox for trip — re-queue delete for server.
    await enqueueOutbox(tripId, "deleteTrip", {});
    if (online()) {
      try {
        await cloudTripListRepo.delete(tripId);
        await dropOps(tripId, "deleteTrip");
      } catch {
        /* queued */
      }
    }
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
