import { registerSW } from "virtual:pwa-register";

const UPDATE_CHECK_MS = 5 * 60 * 1000;

/** Check for a new service worker and reload once it takes control. */
export function registerPwaUpdates(): void {
  registerSW({
    immediate: true,
    onRegisteredSW(swUrl, registration) {
      if (!registration) return;

      const checkForUpdate = async () => {
        if (registration.installing || !navigator.onLine) return;

        try {
          const resp = await fetch(swUrl, {
            cache: "no-store",
            headers: { "cache-control": "no-cache" },
          });
          if (resp?.status === 200) await registration.update();
        } catch {
          // Offline or transient network error — try again later.
        }
      };

      setInterval(checkForUpdate, UPDATE_CHECK_MS);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") void checkForUpdate();
      });
    },
  });
}
