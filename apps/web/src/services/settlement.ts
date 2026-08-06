import type { SettleTripResult } from "@tripledger/types";
import { apiMutate } from "./client";

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

/** Persist client-computed settlement (facts remain source of truth). */
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
