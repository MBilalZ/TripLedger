import {
  createClient,
  type Session,
  type SupabaseClient,
  type User,
} from "@supabase/supabase-js";
import { toApiError } from "./errors";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export function isSupabaseConfigured(): boolean {
  return Boolean(url?.trim() && anonKey?.trim());
}

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!isSupabaseConfigured()) {
    throw toApiError(
      new Error(
        "Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.",
      ),
    );
  }
  if (!client) {
    client = createClient(url!.trim(), anonKey!.trim(), {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return client;
}

export type UserProfile = {
  userId: string;
  email: string | null;
  displayName: string | null;
};

/** Require an existing signed-in session. Does not create anonymous users. */
export async function requireUser(): Promise<string> {
  const sb = getSupabase();
  const { data, error } = await sb.auth.getSession();
  if (error) throw toApiError(error);
  const id = data.session?.user?.id;
  if (!id) {
    throw toApiError(new Error("Sign in required"));
  }
  return id;
}

/** @deprecated Use requireUser — no longer signs in anonymously. */
export const ensureAuthSession = requireUser;

export async function getSession(): Promise<Session | null> {
  if (!isSupabaseConfigured()) return null;
  const sb = getSupabase();
  const { data, error } = await sb.auth.getSession();
  if (error) throw toApiError(error);
  return data.session;
}

export async function currentUserId(): Promise<string | null> {
  const session = await getSession();
  return session?.user?.id ?? null;
}

export async function signUpWithPassword(
  email: string,
  password: string,
  displayName?: string,
): Promise<User> {
  const sb = getSupabase();
  const trimmedEmail = email.trim().toLowerCase();
  const name = displayName?.trim() || null;
  const { data, error } = await sb.auth.signUp({
    email: trimmedEmail,
    password,
    options: {
      data: name ? { display_name: name } : undefined,
    },
  });
  if (error) throw toApiError(error);
  if (!data.user) throw toApiError(new Error("Sign up failed"));

  if (name && data.session) {
    await upsertProfileDisplayName(data.user.id, name);
  }
  return data.user;
}

export async function signInWithPassword(email: string, password: string): Promise<User> {
  const sb = getSupabase();
  const { data, error } = await sb.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });
  if (error) throw toApiError(error);
  if (!data.user) throw toApiError(new Error("Sign in failed"));
  return data.user;
}

export async function signOut(): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const sb = getSupabase();
  const { error } = await sb.auth.signOut();
  if (error) throw toApiError(error);
}

export async function upsertProfileDisplayName(
  userId: string,
  displayName: string,
): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb.from("profiles").upsert({
    user_id: userId,
    display_name: displayName.trim(),
  });
  if (error) throw toApiError(error);
}

export async function updateProfileDisplayName(displayName: string): Promise<void> {
  const uid = await requireUser();
  await upsertProfileDisplayName(uid, displayName);
}

export async function fetchUserProfile(user?: User | null): Promise<UserProfile | null> {
  if (!isSupabaseConfigured()) return null;
  const sb = getSupabase();
  const sessionUser = user ?? (await sb.auth.getSession()).data.session?.user ?? null;
  if (!sessionUser) return null;

  let displayName: string | null =
    (sessionUser.user_metadata?.display_name as string | undefined)?.trim() || null;

  const { data } = await sb
    .from("profiles")
    .select("display_name")
    .eq("user_id", sessionUser.id)
    .maybeSingle();

  if (data?.display_name?.trim()) {
    displayName = data.display_name.trim();
  }

  return {
    userId: sessionUser.id,
    email: sessionUser.email ?? null,
    displayName,
  };
}

export function onAuthStateChange(
  callback: (session: Session | null) => void,
): () => void {
  if (!isSupabaseConfigured()) return () => {};
  const sb = getSupabase();
  const { data } = sb.auth.onAuthStateChange((_event, session) => {
    callback(session);
  });
  return () => data.subscription.unsubscribe();
}
