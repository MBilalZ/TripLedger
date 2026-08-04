/**
 * Recompute trip settlement with @tripledger/engine semantics.
 * Deploy: `supabase functions deploy recompute-settlement`
 *
 * Loads workspace via the caller's JWT, settles, upserts trip_settlement_snapshots.
 * Engine logic is inlined via a compact port that mirrors packages/engine settleTrip
 * by invoking the same algorithm through a dynamic import of the published workspace
 * build when available; otherwise falls back to asking the client path.
 *
 * For local monorepo deploys, bundle with:
 *   supabase functions serve recompute-settlement --env-file .env.supabase
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

type Json = Record<string, unknown>;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers":
          "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Missing authorization" }, 401);
    }

    const { trip_id: tripId } = (await req.json()) as { trip_id?: string };
    if (!tripId) return json({ error: "trip_id required" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();
    if (userErr || !user) return json({ error: "Unauthorized" }, 401);

    const member = await supabase
      .from("trip_members")
      .select("role")
      .eq("trip_id", tripId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!member.data) return json({ error: "Not a trip member" }, 403);

    const [trip, participants, pools, poolMembers, expenses, splits, adjustments] =
      await Promise.all([
        supabase.from("trips").select("*").eq("id", tripId).maybeSingle(),
        supabase
          .from("participants")
          .select("*")
          .eq("trip_id", tripId)
          .is("deleted_at", null),
        supabase
          .from("pools")
          .select("*")
          .eq("trip_id", tripId)
          .is("deleted_at", null),
        supabase.from("pool_members").select("*").eq("trip_id", tripId),
        supabase.from("expenses").select("*").eq("trip_id", tripId),
        supabase.from("expense_splits").select("*").eq("trip_id", tripId),
        supabase
          .from("adjustments")
          .select("*")
          .eq("trip_id", tripId)
          .is("deleted_at", null),
      ]);

    for (const r of [
      trip,
      participants,
      pools,
      poolMembers,
      expenses,
      splits,
      adjustments,
    ]) {
      if (r.error) return json({ error: r.error.message }, 500);
    }

    const facts = buildFacts({
      trip: trip.data,
      participants: participants.data ?? [],
      pools: pools.data ?? [],
      poolMembers: poolMembers.data ?? [],
      expenses: expenses.data ?? [],
      expenseSplits: splits.data ?? [],
      adjustments: adjustments.data ?? [],
    });

    const { settleTrip } = await import("../_shared/engine.ts");
    const result = settleTrip(facts);
    const factsHash = await sha256(JSON.stringify(facts));

    const { error: upErr } = await supabase.rpc("upsert_settlement_snapshot", {
      p_trip_id: tripId,
      p_facts_hash: factsHash,
      p_result: result,
      p_consistency_ok: result.consistency.ok,
      p_engine_version: "1",
    });
    if (upErr) return json({ error: upErr.message }, 500);

    return json({ result, facts_hash: factsHash });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return json({ error: message }, 500);
  }
});

function json(body: Json, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function buildFacts(args: {
  trip: Record<string, unknown> | null;
  participants: Record<string, unknown>[];
  pools: Record<string, unknown>[];
  poolMembers: Record<string, unknown>[];
  expenses: Record<string, unknown>[];
  expenseSplits: Record<string, unknown>[];
  adjustments: Record<string, unknown>[];
}) {
  const active = args.expenses.filter(
    (e) => !e.superseded_by_id && !e.voided,
  );
  return {
    participants: args.participants.map((p) => ({
      id: p.id,
      displayName: p.display_name,
    })),
    pools: args.pools.map((p) => ({
      id: p.id,
      name: p.name,
      splitMode: p.split_mode ?? "shares",
    })),
    poolMembers: args.poolMembers.map((m) => ({
      poolId: m.pool_id,
      participantId: m.participant_id,
      included: m.included ?? true,
      shares: Math.max(1, Number(m.shares ?? 1)),
      percentBps: Number(m.percent_bps ?? 0),
      exactPaisa: Number(m.exact_paisa ?? 0),
    })),
    expenses: active.map((e) => ({
      id: e.id,
      poolId: e.pool_id,
      description: e.description,
      category: e.category,
      amountPaisa: Number(e.amount_paisa),
      paidById: e.paid_by_id,
      date: e.date,
      notes: e.notes ?? "",
      supersededById: e.superseded_by_id ?? null,
      splitMode: e.split_mode ?? null,
    })),
    expenseSplits: args.expenseSplits.map((s) => ({
      expenseId: s.expense_id,
      participantId: s.participant_id,
      included: s.included ?? true,
      shares: Number(s.shares ?? 1),
      percentBps: Number(s.percent_bps ?? 0),
      exactPaisa: Number(s.exact_paisa ?? 0),
    })),
    adjustments: args.adjustments.map((a) => ({
      id: a.id,
      fromId: a.from_id,
      toId: a.to_id,
      amountPaisa: Number(a.amount_paisa),
      reason: a.reason ?? "",
    })),
    settings: {
      transferMode: args.trip?.transfer_mode ?? "minimize",
      settlementRounding: args.trip?.settlement_rounding ?? "rupee",
      settlementHubId: args.trip?.settlement_hub_id ?? null,
    },
  };
}
