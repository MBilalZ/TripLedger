import { computed, onMounted, onUnmounted, ref } from "vue";
import {
  clearDeferredInstallPrompt,
  getDeferredInstallPrompt,
  isIosDevice,
  isPwaStandalone,
  persistInstallDismiss,
  subscribeInstallPrompt,
  wasInstallDismissed,
} from "@/pwa";

export function usePwaInstall() {
  const visible = ref(false);
  /** chromium = deferred beforeinstallprompt; ios = Add to Home Screen tips */
  const mode = ref<"chromium" | "ios" | null>(null);
  let unsubscribe: (() => void) | null = null;

  function refresh() {
    if (isPwaStandalone() || wasInstallDismissed()) {
      visible.value = false;
      mode.value = null;
      return;
    }

    if (getDeferredInstallPrompt()) {
      mode.value = "chromium";
      visible.value = true;
      return;
    }

    if (isIosDevice()) {
      mode.value = "ios";
      visible.value = true;
      return;
    }

    visible.value = false;
    mode.value = null;
  }

  onMounted(() => {
    refresh();
    unsubscribe = subscribeInstallPrompt(refresh);
  });

  onUnmounted(() => {
    unsubscribe?.();
    unsubscribe = null;
  });

  const showBanner = computed(() => visible.value && mode.value !== null);

  function dismiss() {
    visible.value = false;
    mode.value = null;
    persistInstallDismiss();
  }

  async function install() {
    const promptEvent = getDeferredInstallPrompt();
    if (!promptEvent) return;
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    clearDeferredInstallPrompt();
    if (choice.outcome === "accepted") {
      visible.value = false;
      mode.value = null;
    } else {
      dismiss();
    }
  }

  return {
    showBanner,
    mode,
    dismiss,
    install,
  };
}
