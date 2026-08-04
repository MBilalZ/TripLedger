<script setup lang="ts">
import Button from "primevue/button";
import { usePwaInstall } from "@/composables/usePwaInstall";

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
      <span class="tl-brand-mark" aria-hidden="true">TL</span>
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
      <Button
        v-if="mode === 'android'"
        label="Install"
        size="small"
        @click="install"
      />
      <button
        type="button"
        class="tl-install-banner__dismiss"
        aria-label="Dismiss install prompt"
        @click="dismiss"
      >
        <i class="pi pi-times" />
      </button>
    </div>
  </div>
</template>
