import type { SettlementRounding, TransferMode } from "@tripledger/types";
import { newId, type TripRow } from "@/db/dexie";
import { tripFromDb, type DbTrip } from "./mappers";
import { apiCall, apiMutate } from "./client";
import { fetchUserProfile, requireUser } from "./supabase";

export type CreateTripOptions = {
  transferMode?: TransferMode;
  settlementRounding?: SettlementRounding;
};

export async function listTrips(): Promise<TripRow[]> {
  return apiCall(async (sb) => {
    const res = await sb
      .from("trips")
      .select("*")
      .order("updated_at", { ascending: false });
    if (res.error) return { data: [] as TripRow[], error: res.error };
    return {
      data: ((res.data ?? []) as DbTrip[]).map(tripFromDb),
      error: null,
    };
  });
}

export async function createTrip(
  name: string,
  options: CreateTripOptions = {},
): Promise<string> {
  const uid = await requireUser();
  const profile = await fetchUserProfile();
  const ownerName =
    profile?.displayName?.trim() ||
    profile?.email?.split("@")[0] ||
    "You";
  const tripId = newId("trip");
  const participantId = newId("p");
  const now = new Date().toISOString();
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Trip name is required");

  await apiMutate((sb) =>
    sb.from("trips").insert({
      id: tripId,
      name: trimmed,
      currency: "PKR",
      created_at: now,
      updated_at: now,
      transfer_mode: options.transferMode ?? "minimize",
      settlement_rounding: options.settlementRounding ?? "rupee",
      settlement_hub_id: null,
      created_by: uid,
    }),
  );

  await apiMutate(
    (sb) =>
      sb.from("participants").insert({
        id: participantId,
        trip_id: tripId,
        display_name: ownerName,
        user_id: uid,
      }),
    { requireAuth: false },
  );

  await apiMutate(
    (sb) =>
      sb.from("trip_members").insert({
        trip_id: tripId,
        user_id: uid,
        participant_id: participantId,
        role: "owner",
      }),
    { requireAuth: false },
  );

  return tripId;
}

export async function deleteTrip(tripId: string): Promise<void> {
  await apiMutate((sb) => sb.from("trips").delete().eq("id", tripId));
}

export async function touchTrip(tripId: string): Promise<void> {
  await apiMutate(
    (sb) =>
      sb
        .from("trips")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", tripId),
    { requireAuth: false },
  );
}

export async function updateTrip(
  tripId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  await apiMutate((sb) => sb.from("trips").update(patch).eq("id", tripId));
}
