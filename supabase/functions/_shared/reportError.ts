/**
 * Structured Edge logging. Optionally posts to Sentry if SENTRY_DSN is set
 * (supabase secrets set SENTRY_DSN=...).
 */
export function reportError(
  error: unknown,
  context: Record<string, unknown> & { tag?: string } = {},
): void {
  const tag = context.tag ?? "edge.error";
  const message = error instanceof Error ? error.message : String(error);
  console.error(JSON.stringify({ tag, message, ...context }));

  const dsn = Deno.env.get("SENTRY_DSN")?.trim();
  if (!dsn) return;

  // Fire-and-forget Sentry envelope (no SDK dependency in Deno edge).
  const ts = Date.now() / 1000;
  const event = {
    event_id: crypto.randomUUID().replaceAll("-", ""),
    timestamp: ts,
    platform: "javascript",
    level: "error",
    environment: Deno.env.get("SENTRY_ENVIRONMENT") ?? "edge",
    exception: {
      values: [
        {
          type: error instanceof Error ? error.name : "Error",
          value: message,
        },
      ],
    },
    tags: { tag },
    extra: context,
  };

  try {
    const url = new URL(dsn);
    const publicKey = url.username;
    const projectId = url.pathname.replace(/^\//, "");
    const ingest = `${url.protocol}//${url.host}/api/${projectId}/store/`;
    void fetch(ingest, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Sentry-Auth": `Sentry sentry_version=7, sentry_key=${publicKey}, sentry_client=tripledger-edge/1.0`,
      },
      body: JSON.stringify(event),
    }).catch(() => {
      /* ignore telemetry failures */
    });
  } catch {
    /* ignore malformed DSN */
  }
}
