<script setup lang="ts">
import Button from "primevue/button";
import InputText from "primevue/inputtext";
import Tag from "primevue/tag";
import { formatPkr } from "@tripledger/engine";
import type { TripRow } from "@/db/dexie";

defineProps<{
  trip: TripRow;
  balanced: boolean;
  tripTotalPaisa: number;
  memberCount: number;
  editingTrip: boolean;
  tripNameDraft: string;
  canEditTrip: boolean;
}>();

const emit = defineEmits<{
  "update:tripNameDraft": [value: string];
  startEdit: [];
  cancelEdit: [];
  save: [];
}>();
</script>

<template>
  <div class="tl-card space-y-3">
    <div class="min-w-0">
      <router-link to="/" class="text-xs text-tl-accent no-underline"
        >← All groups</router-link
      >
      <div v-if="!editingTrip" class="mt-1 flex flex-wrap items-center gap-2">
        <h1 class="text-2xl font-semibold text-tl">{{ trip.name }}</h1>
        <Button
          v-if="canEditTrip"
          icon="pi pi-pencil"
          text
          rounded
          size="small"
          v-tooltip="'Edit group'"
          @click="emit('startEdit')"
        />
      </div>
      <div v-else class="mt-2 flex flex-col gap-2">
        <div>
          <label class="tl-input-label">Group name</label>
          <InputText
            :model-value="tripNameDraft"
            class="w-full"
            @update:model-value="emit('update:tripNameDraft', String($event))"
          />
        </div>
        <div class="flex flex-wrap gap-2">
          <Button label="Save" size="small" @click="emit('save')" />
          <Button
            label="Cancel"
            size="small"
            severity="secondary"
            outlined
            @click="emit('cancelEdit')"
          />
        </div>
      </div>
      <div class="mt-2 flex flex-wrap items-center gap-2">
        <span class="tl-member-chip">
          <i class="pi pi-users" aria-hidden="true" />
          {{ memberCount }} {{ memberCount === 1 ? "person" : "people" }}
        </span>
        <Tag
          :severity="balanced ? 'success' : 'danger'"
          :value="balanced ? 'Balanced' : 'Consistency error'"
        />
        <span class="text-sm text-tl-muted">
          Total {{ formatPkr(tripTotalPaisa, 0) }} · PKR
        </span>
      </div>
    </div>
  </div>
</template>
