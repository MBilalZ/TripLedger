/**
 * Drain push_events and deliver Web Push to trip members.
 *
 * Auth: Authorization Bearer must equal PUSH_DRAIN_SECRET
 * (cron / ops only). Unverified JWT "role" claims are rejected.
 *
 * Secrets (supabase secrets set):
 *   PUSH_DRAIN_SECRET
 *   VAPID_PUBLIC_KEY
 *   VAPID_PRIVATE_KEY
 *   VAPID_SUBJECT  (e.g. mailto:you@example.com)
 *
 * Deploy: supabase functions deploy send-push
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import webpush from "npm:web-push@3.6.7";
import { reportError } from "./reportError.ts";

type PushEvent = {
  id: number;
  trip_id: string;
  event_type: string;
  actor_user_id: string | null;
  title: string;
  body: string;
};

type SubRow = {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

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
    const vapidPublic = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
    const vapidPrivate = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
    const vapidSubject = Deno.env.get("VAPID_SUBJECT") ?? "mailto:tripledger@localhost";
    if (!vapidPublic || !vapidPrivate) {
      return json({ error: "VAPID keys not configured" }, 500);
    }

    webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const drainSecret = Deno.env.get("PUSH_DRAIN_SECRET") ?? "";
    if (!supabaseUrl || !serviceKey) {
      return json({ error: "Missing Supabase service config" }, 500);
    }
    if (!drainSecret) {
      return json({ error: "PUSH_DRAIN_SECRET not configured" }, 500);
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token || !timingSafeEqualString(token, drainSecret)) {
      return json({ error: "Unauthorized" }, 401);
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: events, error: claimErr } = await supabase.rpc("claim_push_events", {
      p_limit: 50,
    });
    if (claimErr) return json({ error: claimErr.message }, 500);

    const claimed = (events ?? []) as PushEvent[];
    let sent = 0;
    let failed = 0;

    for (const event of claimed) {
      const { data: members, error: memErr } = await supabase
        .from("trip_members")
        .select("user_id")
        .eq("trip_id", event.trip_id);
      if (memErr) {
        failed += 1;
        continue;
      }

      const userIds = (members ?? [])
        .map((m: { user_id: string }) => m.user_id)
        .filter((id: string) => id && id !== event.actor_user_id);

      if (!userIds.length) continue;

      const { data: subs, error: subErr } = await supabase
        .from("push_subscriptions")
        .select("id, user_id, endpoint, p256dh, auth")
        .in("user_id", userIds);
      if (subErr) {
        failed += 1;
        continue;
      }

      const payload = JSON.stringify({
        title: event.title,
        body: event.body,
        tripId: event.trip_id,
        eventType: event.event_type,
      });

      for (const sub of (subs ?? []) as SubRow[]) {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            payload,
          );
          sent += 1;
        } catch (err) {
          failed += 1;
          const status =
            err && typeof err === "object" && "statusCode" in err
              ? Number((err as { statusCode: number }).statusCode)
              : 0;
          if (status === 404 || status === 410) {
            await supabase.from("push_subscriptions").delete().eq("id", sub.id);
          }
        }
      }
    }

    return json({ claimed: claimed.length, sent, failed });
  } catch (e) {
    reportError(e, { tag: "send-push" });
    const message = e instanceof Error ? e.message : "send-push failed";
    return json({ error: message }, 500);
  }
});

/** Constant-time-ish compare (length difference is observable). */
function timingSafeEqualString(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const aa = encoder.encode(a);
  const bb = encoder.encode(b);
  if (aa.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < aa.length; i++) diff |= aa[i]! ^ bb[i]!;
  return diff === 0;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
