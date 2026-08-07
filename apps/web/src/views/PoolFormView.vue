<script setup lang="ts">
import { onMounted, watch } from "vue";
import { useRouter } from "vue-router";
import Button from "primevue/button";
import InputText from "primevue/inputtext";
import Select from "primevue/select";
import type { SplitMode } from "@tripledger/types";
import AppLoading from "@/components/AppLoading.vue";
import SplitMatrix from "@/components/SplitMatrix.vue";
import { SPLIT_MODES } from "@/constants/tripOptions";
import { usePeoplePoolsUi } from "@/composables/usePeoplePoolsUi";
import { useTripWorkspace } from "@/composables/useTripWorkspace";
import { storeToRefs } from "pinia";
import { useWorkspaceStore } from "@/stores/workspace";

const props = defineProps<{ tripId: string; poolId?: string }>();
const router = useRouter();

useTripWorkspace(() => props.tripId);
const store = useWorkspaceStore();
const { loading, trip } = storeToRefs(store);

const {
  editingPoolId,
  editingPool,
  poolName,
  poolFormTitle,
  canAddPools,
  clearPoolForm,
  openAddPool,
  startEditPool,
  onSavePool,
  peopleForPool,
  poolTotal,
  onPoolMemberChange,
} = usePeoplePoolsUi({
  onClose: () => {
    void router.push({ name: "trip", params: { tripId: props.tripId } });
  },
});

function cancel() {
  clearPoolForm();
  void router.push({ name: "trip", params: { tripId: props.tripId } });
}

function boot() {
  if (loading.value || !trip.value) return;
  if (props.poolId) {
    startEditPool(props.poolId);
    if (!editingPoolId.value) {
      void router.replace({ name: "trip", params: { tripId: props.tripId } });
    }
  } else {
    openAddPool();
  }
}

onMounted(() => {
  boot();
});

watch(
  () => [props.poolId, loading.value, trip.value?.id] as const,
  () => {
    boot();
  },
);
</script>

<template>
  <AppLoading v-if="loading && (!trip || trip.id !== tripId)" />
  <div v-else-if="!trip || trip.id !== tripId" class="tl-card">Group not found.</div>
  <div v-else-if="!canAddPools" class="tl-card space-y-3">
    <h3 class="tl-section-title mb-0">Add friends first</h3>
    <p class="text-sm text-tl-muted">
      Add at least one friend before creating a pool.
    </p>
    <Button label="Back" severity="secondary" @click="cancel" />
  </div>
  <div v-else class="space-y-4">
    <div class="tl-card grid gap-3">
      <div class="flex items-center justify-between gap-2">
        <h3 class="tl-section-title mb-0">{{ poolFormTitle }}</h3>
        <Button
          label="Cancel"
          size="small"
          severity="secondary"
          text
          @click="cancel"
        />
      </div>

      <div>
        <label class="tl-input-label">Name</label>
        <InputText
          v-model="poolName"
          class="w-full tl-control"
          placeholder="Pool name (e.g. Part A)"
          aria-label="Pool name"
          maxlength="80"
          @keyup.enter="onSavePool"
        />
      </div>

      <template v-if="editingPoolId && editingPool">
        <div>
          <label class="tl-input-label">Split mode</label>
          <Select
            :model-value="editingPool.splitMode"
            :options="SPLIT_MODES"
            option-label="label"
            option-value="value"
            class="w-full tl-control"
            @update:model-value="
              (v) => store.setPoolSplitMode(editingPoolId!, v as SplitMode)
            "
          />
        </div>
        <SplitMatrix
          :mode="editingPool.splitMode"
          :people="peopleForPool(editingPoolId)"
          :total-paisa="poolTotal(editingPoolId)"
          @change="(pid, patch) => onPoolMemberChange(editingPoolId!, pid, patch)"
        />
      </template>

      <div class="flex flex-wrap gap-2">
        <Button
          :label="editingPoolId ? 'Save pool' : 'Add pool'"
          :icon="editingPoolId ? 'pi pi-check' : 'pi pi-plus'"
          type="button"
          @click="onSavePool"
        />
        <Button label="Cancel" severity="secondary" outlined @click="cancel" />
      </div>
    </div>
  </div>
</template>
