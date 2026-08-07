<script setup lang="ts">
import { storeToRefs } from "pinia";
import { useRoute, useRouter } from "vue-router";
import { usePeoplePoolsUi } from "@/composables/usePeoplePoolsUi";
import { useWorkspaceStore } from "@/stores/workspace";
import TlButton from "@/components/ui/TlButton.vue";
import TlIcon from "@/components/ui/TlIcon.vue";
import TlIconButton from "@/components/ui/TlIconButton.vue";

const emit = defineEmits<{ openFriends: [] }>();

const route = useRoute();
const router = useRouter();
const store = useWorkspaceStore();
const { pools } = storeToRefs(store);
const { canAddPools, confirmRemovePool } = usePeoplePoolsUi();

function currentTripId() {
  return store.tripId || String(route.params.tripId ?? "");
}

function goAdd() {
  void router.push({
    name: "pool-new",
    params: { tripId: currentTripId() },
  });
}

function goEdit(poolId: string) {
  void router.push({
    name: "pool-edit",
    params: { tripId: currentTripId(), poolId },
  });
}
</script>

<template>
  <div class="space-y-4">
    <div v-if="!canAddPools" class="tl-card space-y-3">
      <h3 class="tl-section-title mb-0">Add friends first</h3>
      <p class="text-sm text-tl-muted">
        Add at least one friend before creating a pool.
      </p>
      <TlButton
        label="Add friends"
        icon="users"
        @click="emit('openFriends')"
      />
    </div>

    <template v-else>
      <div class="tl-card">
        <p v-if="!pools.length" class="text-sm text-tl-muted">
          No pools yet. Optional — saving an expense will create a “General” pool
          automatically.
        </p>
        <div
          v-for="pool in pools"
          :key="pool.id"
          class="tl-list-row"
        >
          <div class="min-w-0">
            <div class="font-medium text-tl">{{ pool.name }}</div>
            <div class="text-xs text-tl-muted">{{ pool.splitMode }}</div>
          </div>
          <div class="flex gap-1">
            <TlIconButton
              icon="pencil"
              aria-label="Edit pool"
              @click="goEdit(pool.id)"
            />
            <TlIconButton
              icon="trash"
              variant="danger"
              aria-label="Delete pool"
              @click="confirmRemovePool(pool.id, pool.name)"
            />
          </div>
        </div>
      </div>

      <button type="button" class="tl-fab" @click="goAdd">
        <TlIcon name="th-large" />
        Add pool
      </button>
    </template>
  </div>
</template>
