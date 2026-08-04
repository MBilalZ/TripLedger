<script setup lang="ts">
import { ref } from "vue";
import Button from "primevue/button";
import InputText from "primevue/inputtext";
import Menu from "primevue/menu";
import Tag from "primevue/tag";
import type { MenuItem } from "primevue/menuitem";
import { formatPkr } from "@tripledger/engine";
import type { TripRow } from "@/db/dexie";

defineProps<{
  trip: TripRow;
  balanced: boolean;
  tripTotalPaisa: number;
  editingTrip: boolean;
  tripNameDraft: string;
  showInvite: boolean;
  canEditTrip: boolean;
  canDeleteTrip: boolean;
  inviting: boolean;
  exportItems: MenuItem[];
}>();

const emit = defineEmits<{
  "update:tripNameDraft": [value: string];
  startEdit: [];
  cancelEdit: [];
  save: [];
  invite: [];
  delete: [];
}>();

const exportMenu = ref<InstanceType<typeof Menu> | null>(null);

function toggleExport(event: Event) {
  exportMenu.value?.toggle(event);
}
</script>

<template>
  <div class="tl-card space-y-3">
    <div class="flex items-start justify-between gap-2">
      <div class="min-w-0 flex-1">
        <router-link to="/" class="text-xs text-tl-accent no-underline"
          >← All trips</router-link
        >
        <div v-if="!editingTrip" class="mt-1 flex flex-wrap items-center gap-2">
          <h1 class="text-2xl font-semibold text-tl">{{ trip.name }}</h1>
          <Button
            v-if="canEditTrip"
            icon="pi pi-pencil"
            text
            rounded
            size="small"
            v-tooltip="'Edit trip'"
            @click="emit('startEdit')"
          />
          <span class="text-sm text-tl-muted">Rs. (PKR)</span>
        </div>
        <div v-else class="mt-2 flex flex-col gap-2">
          <div>
            <label class="tl-input-label">Trip name</label>
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
          <Tag
            :severity="balanced ? 'success' : 'danger'"
            :value="balanced ? 'Balanced' : 'Consistency error'"
          />
          <span class="text-sm text-tl-muted">
            Total {{ formatPkr(tripTotalPaisa, 0) }}
          </span>
        </div>
      </div>
      <div class="flex shrink-0 flex-wrap justify-end gap-1">
        <Button
          v-if="showInvite"
          icon="pi pi-user-plus"
          severity="secondary"
          outlined
          rounded
          aria-label="Copy invite link"
          v-tooltip="'Copy invite link'"
          :loading="inviting"
          @click="emit('invite')"
        />
        <Button
          v-if="canDeleteTrip"
          icon="pi pi-trash"
          severity="danger"
          outlined
          rounded
          aria-label="Delete trip"
          v-tooltip="'Delete trip'"
          @click="emit('delete')"
        />
        <Button
          icon="pi pi-share-alt"
          severity="secondary"
          outlined
          rounded
          aria-haspopup="true"
          aria-controls="trip_export_menu"
          aria-label="Share and export"
          v-tooltip="'Share & export'"
          @click="toggleExport"
        />
        <Menu
          id="trip_export_menu"
          ref="exportMenu"
          :model="exportItems"
          popup
        />
      </div>
    </div>
  </div>
</template>
