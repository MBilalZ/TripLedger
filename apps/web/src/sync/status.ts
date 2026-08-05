import { computed, ref } from "vue";
import type { SyncStatusKind } from "./types";

const online = ref(typeof navigator !== "undefined" ? navigator.onLine : true);
const syncDepth = ref(0);
const syncing = computed(() => syncDepth.value > 0);
const pendingCount = ref(0);
const lastError = ref<string | null>(null);
const keepBothHint = ref(false);

export function setOnline(value: boolean) {
  online.value = value;
}

/** Nested-safe: begin a sync unit of work. */
export function beginSyncing() {
  syncDepth.value += 1;
}

/** Nested-safe: end a sync unit of work. */
export function endSyncing() {
  syncDepth.value = Math.max(0, syncDepth.value - 1);
}

/** @deprecated Prefer beginSyncing/endSyncing for nested work. */
export function setSyncing(value: boolean) {
  if (value) beginSyncing();
  else endSyncing();
}

export function setPendingCount(count: number) {
  pendingCount.value = count;
}

export function setSyncError(message: string | null) {
  lastError.value = message;
}

export function getSyncError(): string | null {
  return lastError.value;
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
