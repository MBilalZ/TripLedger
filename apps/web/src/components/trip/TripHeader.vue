<script setup lang="ts">
import Tag from "primevue/tag";
import { formatPkr } from "@tripledger/engine";
import type { TripRow } from "@/db/dexie";
import TlButton from "@/components/ui/TlButton.vue";
import TlIcon from "@/components/ui/TlIcon.vue";
import TlIconButton from "@/components/ui/TlIconButton.vue";
import TlInput from "@/components/ui/TlInput.vue";
import TlLabel from "@/components/ui/TlLabel.vue";

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
        <TlIconButton
          v-if="canEditTrip"
          icon="pencil"
          aria-label="Edit group"
          v-tooltip="'Edit group'"
          @click="emit('startEdit')"
        />
      </div>
      <div v-else class="mt-2 flex flex-col gap-2">
        <div>
          <TlLabel>Group name</TlLabel>
          <TlInput
            :model-value="tripNameDraft"
            @update:model-value="emit('update:tripNameDraft', String($event))"
          />
        </div>
        <div class="flex flex-wrap gap-2">
          <TlButton label="Save" @click="emit('save')" />
          <TlButton
            label="Cancel"
            variant="outlined"
            @click="emit('cancelEdit')"
          />
        </div>
      </div>
      <div class="mt-2 flex flex-wrap items-center gap-2">
        <span class="tl-member-chip">
          <TlIcon name="users" />
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
