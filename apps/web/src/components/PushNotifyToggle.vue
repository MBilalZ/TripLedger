<script setup lang="ts">
import Button from "primevue/button";
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
  <div v-if="available || iosNeedsInstall" class="tl-push-toggle">
    <Button
      v-if="available"
      :label="enabled ? 'Alerts on' : 'Alerts'"
      :icon="enabled ? 'pi pi-bell' : 'pi pi-bell-slash'"
      size="small"
      severity="secondary"
      text
      :loading="busy"
      :aria-pressed="enabled"
      @click="enabled ? disable() : enable()"
    />
    <span v-else-if="iosNeedsInstall" class="tl-push-ios-hint" title="Install the app to enable alerts on iOS">
      Install for alerts
    </span>
    <span v-if="error" class="tl-push-error">{{ error }}</span>
  </div>
</template>
