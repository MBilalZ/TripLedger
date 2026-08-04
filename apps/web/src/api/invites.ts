import { ApiError } from "./errors";
import { apiCall, apiMutate } from "./client";
import { requireUser } from "./supabase";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type InviteRow = {
  token: string;
  created_at: string;
  expires_at: string | null;
  revoked_at: string | null;
};

export async function createInvite(tripId: string): Promise<string> {
  const uid = await requireUser();
  const token = crypto.randomUUID().replace(/-/g, "");
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS).toISOString();
  await apiMutate(
    (sb) =>
      sb.from("trip_invites").insert({
        token,
        trip_id: tripId,
        created_by: uid,
        expires_at: expiresAt,
        revoked_at: null,
      }),
    { requireAuth: false },
  );
  return token;
}

export async function revokeInvite(token: string): Promise<void> {
  await apiMutate((sb) =>
    sb
      .from("trip_invites")
      .update({ revoked_at: new Date().toISOString() })
      .eq("token", token),
  );
}

export async function listInvites(tripId: string): Promise<InviteRow[]> {
  return apiCall(async (sb) => {
    const res = await sb
      .from("trip_invites")
      .select("token, created_at, expires_at, revoked_at")
      .eq("trip_id", tripId)
      .is("revoked_at", null)
      .order("created_at", { ascending: false });
    if (res.error) return { data: [] as InviteRow[], error: res.error };
    return { data: (res.data ?? []) as InviteRow[], error: null };
  });
}

export type JoinTripResult = {
  trip_id: string;
  participant_id?: string;
  already_member: boolean;
};

export async function joinWithToken(
  token: string,
  displayName: string,
): Promise<JoinTripResult> {
  return apiCall(async (sb) => {
    const res = await sb.rpc("join_trip_with_token", {
      p_token: token,
      p_display_name: displayName,
    });
    if (res.error) {
      return { data: undefined as unknown as JoinTripResult, error: res.error };
    }
    if (!res.data) {
      throw new ApiError("Join returned empty result", { code: "JOIN_EMPTY" });
    }
    return {
      data: res.data as JoinTripResult,
      error: null,
    };
  });
}
