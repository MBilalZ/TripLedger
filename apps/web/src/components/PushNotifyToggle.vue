<script setup lang="ts">
import { usePushNotifications } from "@/composables/usePushNotifications";

const {
  available,
  iosNeedsInstall,
  enabled,
  busy,
  error,
  enable,
  disable,
} = usePushNotifications();
</script>

<template>
  <div v-if="available || iosNeedsInstall" class="tl-sync-wrap">
    <button
      v-if="available"
      type="button"
      class="tl-icon-btn"
      :class="{ 'is-active': enabled }"
      :aria-label="enabled ? 'Alerts on' : 'Enable alerts'"
      :aria-pressed="enabled"
      :disabled="busy"
      :title="enabled ? 'Alerts on' : 'Alerts'"
      @click="enabled ? disable() : enable()"
    >
      <i :class="enabled ? 'pi pi-bell' : 'pi pi-bell-slash'" />
    </button>
    <button
      v-else-if="iosNeedsInstall"
      type="button"
      class="tl-icon-btn"
      title="Install the app to enable alerts on iOS"
      aria-label="Install for alerts"
      disabled
    >
      <i class="pi pi-bell-slash" />
    </button>
    <span v-if="error" class="tl-push-error">{{ error }}</span>
  </div>
</template>
