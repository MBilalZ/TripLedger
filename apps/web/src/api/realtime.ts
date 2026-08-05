import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabase, isSupabaseConfigured } from "./supabase";

const TABLES = [
  "participants",
  "pools",
  "pool_members",
  "expenses",
  "expense_splits",
  "adjustments",
  "trip_members",
  "expense_receipts",
] as const;

export function subscribeTripChanges(
  tripId: string,
  onChange: () => void,
): RealtimeChannel | null {
  if (!isSupabaseConfigured()) return null;
  try {
    const sb = getSupabase();
    let channel = sb.channel(`trip:${tripId}`);
    for (const table of TABLES) {
      channel = channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table,
          filter: `trip_id=eq.${tripId}`,
        },
        () => onChange(),
      );
    }
    channel = channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "trips", filter: `id=eq.${tripId}` },
      () => onChange(),
    );
    return channel.subscribe();
  } catch {
    return null;
  }
}

export function unsubscribeChannel(channel: RealtimeChannel | null): void {
  if (!channel || !isSupabaseConfigured()) return;
  void getSupabase().removeChannel(channel);
}
