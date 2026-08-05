import type { SettlementRounding, TransferMode } from "@tripledger/types";
import { newId, type TripRow } from "@/db/dexie";
import { apiCall, apiMutate } from "./client";
import { ApiError, toApiError } from "./errors";
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
      p_settlement_rounding: options.settlementRounding ?? "rupee",
    }),
  );

  void uid;
  return tripId;
}

/** Owner delete; throws if RLS/no-op leaves the trip still visible. Idempotent if already gone. */
export async function deleteTrip(tripId: string): Promise<void> {
  await requireUser();
  const sb = getSupabase();
  const del = await sb.from("trips").delete().eq("id", tripId).select("id");
  if (del.error) throw toApiError(del.error);
  if ((del.data?.length ?? 0) > 0) return;

  const still = await sb.from("trips").select("id").eq("id", tripId).maybeSingle();
  if (still.error) throw toApiError(still.error);
  if (still.data) {
    throw new ApiError("Could not delete group (only the owner can delete)", {
      code: "DELETE_DENIED",
    });
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

/** Leave membership; throws if no row removed while membership still exists. */
export async function leaveTrip(tripId: string): Promise<void> {
  const uid = await requireUser();
  const sb = getSupabase();
  const del = await sb
    .from("trip_members")
    .delete()
    .eq("trip_id", tripId)
    .eq("user_id", uid)
    .select("trip_id");
  if (del.error) throw toApiError(del.error);
  if ((del.data?.length ?? 0) > 0) return;

  const still = await sb
    .from("trip_members")
    .select("trip_id")
    .eq("trip_id", tripId)
    .eq("user_id", uid)
    .maybeSingle();
  if (still.error) throw toApiError(still.error);
  if (still.data) {
    throw new ApiError("Could not leave group", { code: "LEAVE_DENIED" });
  }
}
