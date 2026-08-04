import { apiMutate } from "./client";
import { getSupabase, requireUser } from "./supabase";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export function getVapidPublicKey(): string | null {
  const key = (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined)
    ?.trim();
  return key || null;
}

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export async function upsertPushSubscription(
  subscription: PushSubscription,
): Promise<void> {
  const user = await requireUser();
  const json = subscription.toJSON();
  const endpoint = json.endpoint;
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (!endpoint || !p256dh || !auth) {
    throw new Error("Invalid push subscription");
  }

  await apiMutate((sb) =>
    sb.from("push_subscriptions").upsert(
      {
        user_id: user,
        endpoint,
        p256dh,
        auth,
        user_agent: navigator.userAgent.slice(0, 240),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,endpoint" },
    ),
  );
}

export async function deletePushSubscription(endpoint: string): Promise<void> {
  const user = await requireUser();
  await apiMutate((sb) =>
    sb
      .from("push_subscriptions")
      .delete()
      .eq("user_id", user)
      .eq("endpoint", endpoint),
  );
}

export async function subscribeToPush(): Promise<PushSubscription | null> {
  const vapid = getVapidPublicKey();
  if (!vapid || !pushSupported()) return null;

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Notification permission denied");
  }

  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapid) as BufferSource,
    });
  }
  await upsertPushSubscription(sub);
  return sub;
}

export async function unsubscribeFromPush(): Promise<void> {
  if (!pushSupported()) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  const endpoint = sub.endpoint;
  await sub.unsubscribe();
  try {
    await deletePushSubscription(endpoint);
  } catch {
    /* best-effort */
  }
}

export async function drainPushEvents(): Promise<void> {
  try {
    const sb = getSupabase();
    await sb.functions.invoke("send-push", { body: { drain: true } });
  } catch {
    // Push drain is best-effort.
  }
}
