<script setup lang="ts">
import { useSyncStatus } from "@/sync/status";
import { flushOutbox, syncAllCloudTrips } from "@/sync/engine";
import { useAuthStore } from "@/stores/auth";

const auth = useAuthStore();
const { kind, label, detail, pendingCount, syncing } = useSyncStatus();

async function onRetry() {
  if (syncing.value) return;
  await flushOutbox();
  await syncAllCloudTrips();
}
</script>

<template>
  <div v-if="auth.cloud" class="tl-sync-wrap">
    <button
      type="button"
      class="tl-sync-chip"
      :class="`is-${kind}`"
      :title="detail"
      :aria-label="detail"
      :disabled="syncing"
      @click="onRetry"
    >
      <i
        :class="{
          'pi pi-wifi': kind === 'idle' || kind === 'pending',
          'pi pi-cloud-download': kind === 'syncing',
          'pi pi-ban': kind === 'offline',
          'pi pi-exclamation-circle': kind === 'error',
        }"
      />
      <span class="tl-sync-chip__label">{{ label }}</span>
      <span v-if="pendingCount > 0 && kind !== 'pending'" class="tl-sync-count">{{
        pendingCount
      }}</span>
    </button>
  </div>
</template>
