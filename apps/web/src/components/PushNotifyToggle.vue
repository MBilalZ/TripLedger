<script setup lang="ts">
import { usePushNotifications } from "@/composables/usePushNotifications";
import TlIconButton from "@/components/ui/TlIconButton.vue";

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
    <TlIconButton
      v-if="available"
      variant="bordered"
      :icon="enabled ? 'bell' : 'bell-slash'"
      :aria-label="enabled ? 'Alerts on' : 'Enable alerts'"
      :class="{ 'is-active': enabled }"
      :disabled="busy"
      :title="enabled ? 'Alerts on' : 'Alerts'"
      :aria-pressed="enabled"
      @click="enabled ? disable() : enable()"
    />
    <TlIconButton
      v-else-if="iosNeedsInstall"
      variant="bordered"
      icon="bell-slash"
      aria-label="Install for alerts"
      title="Install the app to enable alerts on iOS"
      disabled
    />
    <span v-if="error" class="tl-push-error">{{ error }}</span>
  </div>
</template>
