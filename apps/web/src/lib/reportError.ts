type ErrorContext = Record<string, unknown> & { tag?: string };

type SentryLike = {
  captureException: (error: unknown, hint?: { extra?: Record<string, unknown> }) => void;
};

declare global {
  interface Window {
    __TRIPLEDGER_SENTRY__?: SentryLike;
  }
}

let sentryInit: Promise<SentryLike | null> | null = null;

async function getSentry(): Promise<SentryLike | null> {
  if (typeof window === "undefined") return null;
  if (window.__TRIPLEDGER_SENTRY__) return window.__TRIPLEDGER_SENTRY__;
  const dsn = (import.meta.env.VITE_SENTRY_DSN as string | undefined)?.trim();
  if (!dsn) return null;
  if (!sentryInit) {
    sentryInit = (async () => {
      try {
        const Sentry = await import("@sentry/vue");
        Sentry.init({
          dsn,
          environment: import.meta.env.MODE,
          tracesSampleRate: 0,
        });
        const api: SentryLike = {
          captureException: (error, hint) => Sentry.captureException(error, hint),
        };
        window.__TRIPLEDGER_SENTRY__ = api;
        return api;
      } catch {
        return null;
      }
    })();
  }
  return sentryInit;
}

/** Log + optionally report to Sentry when VITE_SENTRY_DSN is set. */
export function reportError(error: unknown, context: ErrorContext = {}): void {
  const tag = context.tag ?? "error";
  const { tag: _tag, ...extra } = context;
  console.error(`[${tag}]`, error, extra);
  void getSentry().then((sentry) => {
    sentry?.captureException(error, { extra: { tag, ...extra } });
  });
}
