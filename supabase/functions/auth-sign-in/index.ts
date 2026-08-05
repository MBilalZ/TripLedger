/**
 * Sign-in with distinct error intents for unknown email vs bad password.
 *
 * Deploy: supabase functions deploy auth-sign-in
 *
 * Accepts JSON { email, password }. Uses service role + auth_email_exists RPC
 * to look up the user, then verifies the password via GoTrue.
 * Returns session tokens on success.
 *
 * Note: distinguishing USER_NOT_FOUND enables email enumeration by design;
 * rate limiting mitigates abuse.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { reportError } from "../_shared/reportError.ts";

type Json = Record<string, unknown>;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/** Simple in-memory rate limit: email → timestamps */
const attempts = new Map<string, number[]>();
const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 12;

function rateLimited(key: string): boolean {
  const now = Date.now();
  const prev = (attempts.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  prev.push(now);
  attempts.set(key, prev);
  return prev.length > MAX_ATTEMPTS;
}

function json(body: Json, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS });
  }

  try {
    if (req.method !== "POST") {
      return json({ code: "METHOD", message: "POST required" }, 405);
    }

    const body = (await req.json()) as { email?: string; password?: string };
    const email = String(body.email ?? "")
      .trim()
      .toLowerCase();
    const password = String(body.password ?? "");

    if (!email || !password) {
      return json(
        { code: "VALIDATION", message: "Email and password are required." },
        400,
      );
    }

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    if (rateLimited(`${email}|${ip}`)) {
      return json(
        { code: "RATE_LIMIT", message: "Too many attempts. Please wait and try again." },
        429,
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    if (!supabaseUrl || !serviceKey || !anonKey) {
      return json({ code: "CONFIG", message: "Auth is not configured." }, 500);
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: exists, error: lookupError } = await admin.rpc("auth_email_exists", {
      p_email: email,
    });

    if (lookupError) {
      await reportError(lookupError, { tag: "auth-sign-in.lookup" });
      return json({ code: "LOOKUP_FAILED", message: "Sign in failed." }, 500);
    }

    if (!exists) {
      return json(
        {
          code: "USER_NOT_FOUND",
          message:
            "Couldn’t sign in. Create an account if you’re new, or go back if you already have one.",
        },
        404,
      );
    }

    const anon = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await anon.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.session || !data.user) {
      return json(
        {
          code: "BAD_PASSWORD",
          message: "Incorrect password.",
        },
        401,
      );
    }

    return json({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_in: data.session.expires_in,
      token_type: data.session.token_type,
      user: data.user,
    });
  } catch (e) {
    await reportError(e, { tag: "auth-sign-in" });
    return json({ code: "SERVER", message: "Sign in failed." }, 500);
  }
});
