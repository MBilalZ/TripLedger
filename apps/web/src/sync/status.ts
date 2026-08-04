import { computed, ref } from "vue";
import type { SyncStatusKind } from "./types";

const online = ref(typeof navigator !== "undefined" ? navigator.onLine : true);
const syncing = ref(false);
const pendingCount = ref(0);
const lastError = ref<string | null>(null);
const keepBothHint = ref(false);

export function setOnline(value: boolean) {
  online.value = value;
}

export function setSyncing(value: boolean) {
  syncing.value = value;
}

export function setPendingCount(count: number) {
  pendingCount.value = count;
}

export function setSyncError(message: string | null) {
  lastError.value = message;
}

export function noteKeepBothMerge() {
  keepBothHint.value = true;
}

export function dismissKeepBothHint() {
  keepBothHint.value = false;
}

export function useSyncStatus() {
  const kind = computed<SyncStatusKind>(() => {
    if (!online.value) return "offline";
    if (syncing.value) return "syncing";
    if (lastError.value) return "error";
    if (pendingCount.value > 0) return "pending";
    return "idle";
  });

  const label = computed(() => {
    switch (kind.value) {
      case "offline":
        return pendingCount.value > 0
          ? `Offline · ${pendingCount.value} pending`
          : "Offline";
      case "syncing":
        return "Syncing…";
      case "pending":
        return `${pendingCount.value} pending`;
      case "error":
        return lastError.value ?? "Sync error";
      default:
        return "Synced";
    }
  });

  return {
    online,
    syncing,
    pendingCount,
    lastError,
    keepBothHint,
    kind,
    label,
    dismissKeepBothHint,
  };
}
