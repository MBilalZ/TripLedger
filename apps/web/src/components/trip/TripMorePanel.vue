<script setup lang="ts">
import { storeToRefs } from "pinia";
import Button from "primevue/button";
import type { MoreSection } from "@/composables/useTripTabs";
import { useWorkspaceStore } from "@/stores/workspace";
import TripAdjustmentsSection from "./TripAdjustmentsSection.vue";
import TripPeopleSection from "./TripPeopleSection.vue";
import TripPoolsSection from "./TripPoolsSection.vue";

defineProps<{
  visible: boolean;
  moreSection: MoreSection;
  moreTitle: string;
}>();

const emit = defineEmits<{
  "update:moreSection": [section: MoreSection];
  openMore: [section: MoreSection];
}>();

const store = useWorkspaceStore();
const { participants, pools, adjustments } = storeToRefs(store);
</script>

<template>
  <div v-show="visible" class="space-y-4">
    <template v-if="moreSection === 'menu'">
      <div class="tl-card space-y-1">
        <h2 class="tl-section-title">Manage trip</h2>
        <button
          type="button"
          class="tl-list-row w-full text-left"
          @click="emit('openMore', 'people')"
        >
          <div>
            <div class="font-medium">People</div>
            <div class="text-xs text-tl-muted">
              {{ participants.length }} participant(s)
            </div>
          </div>
          <i class="pi pi-chevron-right text-tl-muted" />
        </button>
        <button
          type="button"
          class="tl-list-row w-full text-left"
          @click="emit('openMore', 'pools')"
        >
          <div>
            <div class="font-medium">Pools</div>
            <div class="text-xs text-tl-muted">{{ pools.length }} pool(s)</div>
          </div>
          <i class="pi pi-chevron-right text-tl-muted" />
        </button>
        <button
          type="button"
          class="tl-list-row w-full text-left"
          @click="emit('openMore', 'adjustments')"
        >
          <div>
            <div class="font-medium">Adjustments</div>
            <div class="text-xs text-tl-muted">
              {{ adjustments.length }} adjustment(s)
            </div>
          </div>
          <i class="pi pi-chevron-right text-tl-muted" />
        </button>
      </div>
    </template>

    <template v-else>
      <div class="flex items-center gap-2">
        <Button
          icon="pi pi-arrow-left"
          text
          rounded
          @click="emit('update:moreSection', 'menu')"
        />
        <h2 class="text-lg font-semibold text-tl">{{ moreTitle }}</h2>
      </div>
      <TripPeopleSection v-if="moreSection === 'people'" />
      <TripPoolsSection v-else-if="moreSection === 'pools'" />
      <TripAdjustmentsSection v-else />
    </template>
  </div>
</template>
