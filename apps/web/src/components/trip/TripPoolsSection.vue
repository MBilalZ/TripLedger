<script setup lang="ts">
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
</script>

<template>
  <div class="space-y-4">
    <div v-if="!participants.length" class="tl-card text-sm text-tl-muted">
      Add people first before creating a pool.
    </div>
    <div v-else class="tl-card flex flex-col gap-2 sm:flex-row">
      <InputText
        v-model="newPool"
        placeholder="Pool name (e.g. Part A)"
        class="w-full"
        @keyup.enter="onAddPool"
      />
      <Button label="Add pool" @click="onAddPool" />
    </div>
    <div
      v-if="participants.length && !pools.length"
      class="tl-card text-sm text-tl-muted"
    >
      No pools yet. Optional — saving an expense will create a “General” pool
      automatically.
    </div>
    <div v-for="pool in pools" :key="pool.id" class="tl-card">
      <div class="mb-3 flex flex-col gap-2">
        <div class="flex min-w-0 flex-wrap items-center gap-2">
          <template v-if="editingPoolId === pool.id">
            <InputText v-model="poolNameDraft" class="w-full" />
            <Button icon="pi pi-check" size="small" @click="savePoolName" />
            <Button
              icon="pi pi-times"
              size="small"
              severity="secondary"
              outlined
              @click="cancelEditPoolName"
            />
          </template>
          <template v-else>
            <h3 class="font-medium text-tl-accent-bright">{{ pool.name }}</h3>
            <Button
              icon="pi pi-pencil"
              text
              rounded
              size="small"
              @click="startEditPoolName(pool.id, pool.name)"
            />
            <Button
              icon="pi pi-trash"
              severity="danger"
              text
              class="ml-auto"
              aria-label="Delete pool"
              @click="confirmRemovePool(pool.id, pool.name)"
            />
          </template>
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
      </div>
      <SplitMatrix
        :mode="pool.splitMode"
        :people="peopleForPool(pool.id)"
        :total-paisa="poolTotal(pool.id)"
        @change="(pid, patch) => onPoolMemberChange(pool.id, pid, patch)"
      />
    </div>
  </div>
</template>
