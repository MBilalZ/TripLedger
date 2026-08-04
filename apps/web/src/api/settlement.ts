import type { SettleTripResult } from "@tripledger/types";
import { apiCall, apiMutate } from "./client";

const ENGINE_VERSION = "1";

/** Stable hash of trip facts for snapshot invalidation. */
export async function hashTripFacts(payload: unknown): Promise<string> {
  const json = JSON.stringify(payload);
  const data = new TextEncoder().encode(json);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export type SettlementSnapshotRow = {
  trip_id: string;
  facts_hash: string;
  result: SettleTripResult;
  consistency_ok: boolean;
  computed_at: string;
  engine_version: string;
};

export async function fetchSettlementSnapshot(
  tripId: string,
): Promise<SettlementSnapshotRow | null> {
  return apiCall(async (sb) => {
    const res = await sb
      .from("trip_settlement_snapshots")
      .select("*")
      .eq("trip_id", tripId)
      .maybeSingle();
    if (res.error) return { data: null as never, error: res.error };
    // apiCall rejects null — wrap in a sentinel object
    return {
      data: { row: (res.data as SettlementSnapshotRow | null) ?? null },
      error: null,
    };
  }).then((r) => r.row);
}

export async function upsertSettlementSnapshot(
  tripId: string,
  factsHash: string,
  result: SettleTripResult,
): Promise<void> {
  await apiMutate((sb) =>
    sb.rpc("upsert_settlement_snapshot", {
      p_trip_id: tripId,
      p_facts_hash: factsHash,
      p_result: result,
      p_consistency_ok: result.consistency.ok,
      p_engine_version: ENGINE_VERSION,
    }),
  );
}

/** Prefer Edge Function when deployed; falls back to local compute + RPC upsert. */
export async function recomputeSettlementRemote(
  tripId: string,
): Promise<SettleTripResult | null> {
  return apiCall(async (sb) => {
    const { data, error } = await sb.functions.invoke("recompute-settlement", {
      body: { trip_id: tripId },
    });
    if (error) return { data: null, error };
    const result = (data as { result?: SettleTripResult } | null)?.result;
    return { data: result ?? null, error: null };
  }).catch(() => null);
}
