import type { SettlementRounding, TransferMode } from "@tripledger/types";
import { newId, type TripRow } from "@/db/dexie";
import { ensureAuthSession, getSupabase } from "@/lib/supabase";
import {
  adjustmentFromDb,
  expenseFromDb,
  expenseSplitFromDb,
  participantFromDb,
  poolFromDb,
  poolMemberFromDb,
  tripFromDb,
  type DbTrip,
} from "./mappers";

export type CreateTripOptions = {
  transferMode?: TransferMode;
  settlementRounding?: SettlementRounding;
};

export async function cloudListTrips(): Promise<TripRow[]> {
  await ensureAuthSession();
  const sb = getSupabase();
  const { data, error } = await sb
    .from("trips")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data as DbTrip[]).map(tripFromDb);
}

export async function cloudCreateTrip(
  name: string,
  options: CreateTripOptions = {},
): Promise<string> {
  const uid = await ensureAuthSession();
  const sb = getSupabase();
  const tripId = newId("trip");
  const participantId = newId("p");
  const now = new Date().toISOString();
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Trip name is required");

  const { error: tripErr } = await sb.from("trips").insert({
    id: tripId,
    name: trimmed,
    currency: "PKR",
    created_at: now,
    updated_at: now,
    transfer_mode: options.transferMode ?? "minimize",
    settlement_rounding: options.settlementRounding ?? "rupee",
    settlement_hub_id: null,
    created_by: uid,
  });
  if (tripErr) throw tripErr;

  // Owner as first participant (can rename later)
  const { error: pErr } = await sb.from("participants").insert({
    id: participantId,
    trip_id: tripId,
    display_name: "You",
    user_id: uid,
  });
  if (pErr) throw pErr;

  const { error: mErr } = await sb.from("trip_members").insert({
    trip_id: tripId,
    user_id: uid,
    participant_id: participantId,
    role: "owner",
  });
  if (mErr) throw mErr;

  return tripId;
}

export async function cloudDeleteTrip(tripId: string): Promise<void> {
  await ensureAuthSession();
  const sb = getSupabase();
  const { error } = await sb.from("trips").delete().eq("id", tripId);
  if (error) throw error;
}

export async function cloudTouchTrip(tripId: string): Promise<void> {
  const sb = getSupabase();
  await sb
    .from("trips")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", tripId);
}

export async function cloudLoadWorkspace(tripId: string) {
  await ensureAuthSession();
  const sb = getSupabase();
  const [
    tripRes,
    partsRes,
    poolsRes,
    membersRes,
    expRes,
    splitsRes,
    adjRes,
  ] = await Promise.all([
    sb.from("trips").select("*").eq("id", tripId).maybeSingle(),
    sb.from("participants").select("*").eq("trip_id", tripId),
    sb.from("pools").select("*").eq("trip_id", tripId),
    sb.from("pool_members").select("*").eq("trip_id", tripId),
    sb.from("expenses").select("*").eq("trip_id", tripId),
    sb.from("expense_splits").select("*").eq("trip_id", tripId),
    sb.from("adjustments").select("*").eq("trip_id", tripId),
  ]);

  for (const res of [
    tripRes,
    partsRes,
    poolsRes,
    membersRes,
    expRes,
    splitsRes,
    adjRes,
  ]) {
    if (res.error) throw res.error;
  }

  const expenses = (expRes.data ?? [])
    .map(expenseFromDb)
    .filter((e) => !e.supersededById)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  return {
    trip: tripRes.data ? tripFromDb(tripRes.data as DbTrip) : null,
    participants: (partsRes.data ?? []).map(participantFromDb),
    pools: (poolsRes.data ?? []).map(poolFromDb),
    poolMembers: (membersRes.data ?? []).map(poolMemberFromDb),
    expenses,
    expenseSplits: (splitsRes.data ?? []).map(expenseSplitFromDb),
    adjustments: (adjRes.data ?? []).map(adjustmentFromDb),
  };
}

export async function cloudCreateInvite(tripId: string): Promise<string> {
  const uid = await ensureAuthSession();
  const sb = getSupabase();
  const token = crypto.randomUUID().replace(/-/g, "");
  const { error } = await sb.from("trip_invites").insert({
    token,
    trip_id: tripId,
    created_by: uid,
    expires_at: null,
    revoked_at: null,
  });
  if (error) throw error;
  return token;
}

export async function cloudRevokeInvite(token: string): Promise<void> {
  await ensureAuthSession();
  const sb = getSupabase();
  const { error } = await sb
    .from("trip_invites")
    .update({ revoked_at: new Date().toISOString() })
    .eq("token", token);
  if (error) throw error;
}

export async function cloudListInvites(tripId: string) {
  await ensureAuthSession();
  const sb = getSupabase();
  const { data, error } = await sb
    .from("trip_invites")
    .select("token, created_at, expires_at, revoked_at")
    .eq("trip_id", tripId)
    .is("revoked_at", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function cloudJoinWithToken(token: string, displayName: string) {
  await ensureAuthSession();
  const sb = getSupabase();
  const { data, error } = await sb.rpc("join_trip_with_token", {
    p_token: token,
    p_display_name: displayName,
  });
  if (error) throw error;
  return data as {
    trip_id: string;
    participant_id?: string;
    already_member: boolean;
  };
}
