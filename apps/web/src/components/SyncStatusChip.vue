<script setup lang="ts">
import { useSyncStatus } from "@/sync/status";
import { flushOutbox, syncAllCloudTrips } from "@/sync/engine";
import { useAuthStore } from "@/stores/auth";

const auth = useAuthStore();
const { kind, label, keepBothHint, dismissKeepBothHint, pendingCount } =
  useSyncStatus();

async function onRetry() {
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
      :title="label"
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
      <span>{{ label }}</span>
      <span v-if="pendingCount > 0 && kind !== 'pending'" class="tl-sync-count">{{
        pendingCount
      }}</span>
    </button>
    <p v-if="keepBothHint" class="tl-sync-hint">
      Some changes from another device were kept — remove anything you don’t
      need.
      <button type="button" class="tl-sync-hint__dismiss" @click="dismissKeepBothHint">
        Dismiss
      </button>
    </p>
  </div>
</template>
