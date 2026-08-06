import type { SettlementRounding, TransferMode } from "@tripledger/types";
import { newId, type TripRow } from "@/db/dexie";
import { apiCall, apiMutate } from "./client";
import { toApiError } from "./errors";
import { type DbTrip, tripFromDb } from "./mappers";
import { fetchUserProfile, getSupabase, requireUser } from "./supabase";

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
  const tripId = newId("trip");
  const participantId = newId("p");
  await createTripWithIds(tripId, participantId, name, options);
  return tripId;
}

/** Offline-safe create using client-generated ids. */
export async function createTripWithIds(
  tripId: string,
  participantId: string,
  name: string,
  options: CreateTripOptions = {},
): Promise<string> {
  const uid = await requireUser();
  const profile = await fetchUserProfile();
  const ownerName =
    profile?.displayName?.trim() || profile?.email?.split("@")[0] || "You";
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Trip name is required");

  await apiMutate((sb) =>
    sb.rpc("create_trip_with_owner", {
      p_trip_id: tripId,
      p_name: trimmed,
      p_participant_id: participantId,
      p_owner_display_name: ownerName,
      p_transfer_mode: options.transferMode ?? "minimize",
      p_settlement_rounding: options.settlementRounding ?? "none",
    }),
  );

  void uid;
  return tripId;
}

/** Owner delete via RPC (bypasses cascade triggers that block owner teardown). Idempotent if gone. */
export async function deleteTrip(tripId: string): Promise<void> {
  await requireUser();
  const sb = getSupabase();
  const { error } = await sb.rpc("delete_trip_as_owner", { p_trip_id: tripId });
  if (error) {
    // Idempotent retry: trip already absent for this user.
    const still = await sb.from("trips").select("id").eq("id", tripId).maybeSingle();
    if (still.error) throw toApiError(still.error);
    if (!still.data) return;
    throw toApiError(error);
  }
}

export async function touchTrip(tripId: string): Promise<void> {
  await apiMutate(
    (sb) =>
      sb.from("trips").update({ updated_at: new Date().toISOString() }).eq("id", tripId),
    { requireAuth: false },
  );
}

export async function updateTrip(
  tripId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  await apiMutate((sb) => sb.from("trips").update(patch).eq("id", tripId));
}

export async function fetchMyTripRole(
  tripId: string,
): Promise<"owner" | "member" | null> {
  return apiCall(async (sb) => {
    const uid = await requireUser();
    const res = await sb
      .from("trip_members")
      .select("role")
      .eq("trip_id", tripId)
      .eq("user_id", uid)
      .maybeSingle();
    if (res.error) return { data: null, error: res.error };
    const role = res.data?.role;
    if (role === "owner" || role === "member") {
      return { data: role, error: null };
    }
    return { data: null, error: null };
  });
}

export type LeaveTripAction = {
  action: "left" | "deleted";
  promotedUserId?: string;
};

/** Leave via RPC (promote another owner, or delete trip if last member). */
export async function leaveTrip(tripId: string): Promise<LeaveTripAction> {
  const uid = await requireUser();
  const sb = getSupabase();
  const { data, error } = await sb.rpc("leave_trip", { p_trip_id: tripId });
  if (error) {
    const still = await sb
      .from("trip_members")
      .select("trip_id")
      .eq("trip_id", tripId)
      .eq("user_id", uid)
      .maybeSingle();
    if (still.error) throw toApiError(still.error);
    if (!still.data) {
      const trip = await sb.from("trips").select("id").eq("id", tripId).maybeSingle();
      if (trip.error) throw toApiError(trip.error);
      return { action: trip.data ? "left" : "deleted" };
    }
    throw toApiError(error);
  }
  const row = (data ?? {}) as { action?: string; promoted_user_id?: string };
  const action = row.action === "deleted" ? "deleted" : "left";
  return {
    action,
    promotedUserId: row.promoted_user_id,
  };
}
