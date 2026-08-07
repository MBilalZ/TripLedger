<script setup lang="ts">
import { usePwaInstall } from "@/composables/usePwaInstall";
import TlButton from "@/components/ui/TlButton.vue";
import TlIcon from "@/components/ui/TlIcon.vue";

const { showBanner, mode, dismiss, install } = usePwaInstall();
</script>

<template>
  <div
    v-if="showBanner"
    class="tl-install-banner"
    role="region"
    aria-label="Install TripLedger"
  >
    <div class="tl-install-banner__body">
      <img
        src="/favicon.svg"
        alt=""
        class="tl-brand-mark"
        width="32"
        height="32"
        aria-hidden="true"
      />
      <div class="tl-install-banner__copy">
        <p class="tl-install-banner__title">Install TripLedger</p>
        <p v-if="mode === 'ios'" class="tl-install-banner__hint">
          Tap Share, then Add to Home Screen
        </p>
        <p v-else class="tl-install-banner__hint">
          Add to your home screen for quick access
        </p>
      </div>
    </div>
    <div class="tl-install-banner__actions">
      <TlButton
        v-if="mode === 'chromium'"
        label="Install"
        @click="install"
      />
      <button
        type="button"
        class="tl-icon-btn tl-install-banner__dismiss"
        aria-label="Dismiss install prompt"
        @click="dismiss"
      >
        <TlIcon name="times" />
      </button>
    </div>
  </div>
</template>
