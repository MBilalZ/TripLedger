import { computed, onMounted, ref } from "vue";
import {
  drainPushEvents,
  getVapidPublicKey,
  pushSupported,
  subscribeToPush,
  unsubscribeFromPush,
} from "@/api/push";
import { useAuthStore } from "@/stores/auth";
import { isIosDevice, isPwaStandalone } from "@/pwa";

export function usePushNotifications() {
  const auth = useAuthStore();
  const enabled = ref(false);
  const busy = ref(false);
  const error = ref<string | null>(null);

  const available = computed(
    () =>
      auth.cloud &&
      pushSupported() &&
      !!getVapidPublicKey() &&
      // iOS requires installed PWA for Web Push.
      (isPwaStandalone() || !isIosDevice()),
  );

  const iosNeedsInstall = computed(
    () =>
      auth.cloud &&
      !!getVapidPublicKey() &&
      isIosDevice() &&
      !isPwaStandalone(),
  );

  async function refresh() {
    if (!pushSupported()) {
      enabled.value = false;
      return;
    }
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      enabled.value = !!sub;
    } catch {
      enabled.value = false;
    }
  }

  async function enable() {
    busy.value = true;
    error.value = null;
    try {
      await subscribeToPush();
      enabled.value = true;
      void drainPushEvents();
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Could not enable push";
      enabled.value = false;
    } finally {
      busy.value = false;
    }
  }

  async function disable() {
    busy.value = true;
    error.value = null;
    try {
      await unsubscribeFromPush();
      enabled.value = false;
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Could not disable push";
    } finally {
      busy.value = false;
    }
  }

  onMounted(() => {
    void refresh();
  });

  return {
    available,
    iosNeedsInstall,
    enabled,
    busy,
    error,
    enable,
    disable,
    refresh,
  };
}
