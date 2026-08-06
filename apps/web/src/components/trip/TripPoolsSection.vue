<script setup lang="ts">
import { ref } from "vue";
import { storeToRefs } from "pinia";
import Button from "primevue/button";
import InputText from "primevue/inputtext";
import Select from "primevue/select";
import type { SplitMode } from "@tripledger/types";
import SplitMatrix from "@/components/SplitMatrix.vue";
import { SPLIT_MODES } from "@/constants/tripOptions";
import { usePeoplePoolsUi } from "@/composables/usePeoplePoolsUi";
import { useWorkspaceStore } from "@/stores/workspace";

const store = useWorkspaceStore();
const { participants, pools } = storeToRefs(store);
const {
  editingPoolId,
  newPool,
  poolNameDraft,
  onAddPool,
  startEditPoolName,
  cancelEditPoolName,
  savePoolName,
  confirmRemovePool,
  peopleForPool,
  poolTotal,
  onPoolMemberChange,
} = usePeoplePoolsUi();

const expandedId = ref<string | null>(null);
const showAdd = ref(false);

function togglePool(id: string, name: string) {
  if (expandedId.value === id) {
    expandedId.value = null;
    cancelEditPoolName();
    return;
  }
  expandedId.value = id;
  showAdd.value = false;
  startEditPoolName(id, name);
}

function cancelExpand() {
  expandedId.value = null;
  cancelEditPoolName();
}

async function saveName() {
  await savePoolName();
}

function openAdd() {
  showAdd.value = true;
  expandedId.value = null;
  cancelEditPoolName();
  newPool.value = "";
}

async function addPool() {
  await onAddPool();
  showAdd.value = false;
}
</script>

<template>
  <div class="space-y-4">
    <div v-if="!participants.length" class="tl-card text-sm text-tl-muted">
      Add friends first before creating a pool.
    </div>
    <template v-else>
      <div
        v-if="!pools.length"
        class="tl-card text-sm text-tl-muted"
      >
        No pools yet. Optional — saving an expense will create a “General” pool
        automatically.
      </div>

      <div v-for="pool in pools" :key="pool.id" class="tl-card">
        <button
          type="button"
          class="flex w-full items-center justify-between gap-2 text-left"
          :aria-expanded="expandedId === pool.id"
          @click="togglePool(pool.id, pool.name)"
        >
          <div class="min-w-0">
            <h3 class="font-medium text-tl">{{ pool.name }}</h3>
            <p class="text-xs text-tl-muted">
              {{ pool.splitMode }} · tap to
              {{ expandedId === pool.id ? "collapse" : "edit" }}
            </p>
          </div>
          <i
            class="pi text-tl-muted"
            :class="expandedId === pool.id ? 'pi-chevron-up' : 'pi-chevron-down'"
            aria-hidden="true"
          />
        </button>

        <div v-if="expandedId === pool.id" class="mt-3 space-y-3 border-t border-tl-hairline pt-3">
          <div class="flex flex-col gap-2 sm:flex-row sm:items-center">
            <InputText v-model="poolNameDraft" class="w-full" aria-label="Pool name" />
            <div class="flex gap-2">
              <Button
                v-if="editingPoolId === pool.id"
                icon="pi pi-check"
                size="small"
                aria-label="Save name"
                @click="saveName"
              />
              <Button
                icon="pi pi-times"
                size="small"
                severity="secondary"
                outlined
                aria-label="Collapse"
                @click="cancelExpand"
              />
            </div>
          </div>
          <Select
            :model-value="pool.splitMode"
            :options="SPLIT_MODES"
            option-label="label"
            option-value="value"
            class="w-full"
            @update:model-value="
              (v) => store.setPoolSplitMode(pool.id, v as SplitMode)
            "
          />
          <SplitMatrix
            :mode="pool.splitMode"
            :people="peopleForPool(pool.id)"
            :total-paisa="poolTotal(pool.id)"
            @change="(pid, patch) => onPoolMemberChange(pool.id, pid, patch)"
          />
          <Button
            label="Delete pool"
            icon="pi pi-trash"
            severity="danger"
            size="small"
            text
            @click="confirmRemovePool(pool.id, pool.name)"
          />
        </div>
      </div>

      <div v-if="showAdd" class="tl-card flex flex-col gap-3 sm:flex-row sm:items-center">
        <InputText
          v-model="newPool"
          placeholder="Pool name (e.g. Part A)"
          class="w-full"
          maxlength="80"
          @keyup.enter="addPool"
        />
        <div class="flex gap-2">
          <Button label="Add" class="shrink-0" @click="addPool" />
          <Button
            label="Cancel"
            severity="secondary"
            outlined
            @click="showAdd = false"
          />
        </div>
      </div>
      <Button
        v-else
        label="Add pool"
        icon="pi pi-plus"
        size="small"
        outlined
        @click="openAdd"
      />
    </template>
  </div>
</template>
