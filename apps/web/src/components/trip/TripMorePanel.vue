<script setup lang="ts">
import { storeToRefs } from "pinia";
import Button from "primevue/button";
import type { MenuItem } from "primevue/menuitem";
import type { MoreSection } from "@/composables/useTripTabs";
import { isEnabled } from "@/lib/features";
import { useWorkspaceStore } from "@/stores/workspace";
import TripPeopleSection from "./TripPeopleSection.vue";

defineProps<{
  visible: boolean;
  moreSection: MoreSection;
  moreTitle: string;
  exportItems: MenuItem[];
  showInvite: boolean;
  inviting: boolean;
  canDeleteTrip: boolean;
}>();

const emit = defineEmits<{
  "update:moreSection": [section: MoreSection];
  openMore: [section: MoreSection];
  invite: [];
  delete: [];
  exportCommand: [item: MenuItem];
}>();

const store = useWorkspaceStore();
const { participants } = storeToRefs(store);

function runExport(item: MenuItem) {
  if (typeof item.command === "function") {
    item.command({ originalEvent: new Event("click"), item });
  }
  emit("exportCommand", item);
}
</script>

<template>
  <div v-show="visible" class="space-y-4">
    <template v-if="moreSection === 'menu'">
      <div class="tl-card space-y-1">
        <h2 class="tl-section-title">People</h2>
        <button
          type="button"
          class="tl-list-row w-full text-left"
          @click="emit('openMore', 'people')"
        >
          <div>
            <div class="font-medium">Friends</div>
            <div class="text-xs text-tl-muted">
              {{ participants.length }} friend(s) in this group
            </div>
          </div>
          <i class="pi pi-chevron-right text-tl-muted" />
        </button>
      </div>

      <div v-if="isEnabled('exports')" class="tl-card space-y-1">
        <h2 class="tl-section-title">Exports & reports</h2>
        <p class="mb-2 text-xs text-tl-muted">
          Share when the group is balanced. WhatsApp, Excel, PDF, and JSON backup.
        </p>
        <button
          v-for="item in exportItems"
          :key="String(item.label)"
          type="button"
          class="tl-list-row w-full text-left"
          @click="runExport(item)"
        >
          <div class="flex items-center gap-3">
            <i v-if="item.icon" :class="item.icon" class="text-tl-muted" />
            <div class="font-medium">{{ item.label }}</div>
          </div>
          <i class="pi pi-chevron-right text-tl-muted" />
        </button>
      </div>

      <div class="tl-card space-y-1">
        <h2 class="tl-section-title">Group tools</h2>
        <button
          v-if="showInvite"
          type="button"
          class="tl-list-row w-full text-left"
          :disabled="inviting"
          @click="emit('invite')"
        >
          <div>
            <div class="font-medium">Copy invite link</div>
            <div class="text-xs text-tl-muted">Share so friends can join</div>
          </div>
          <i class="pi pi-link text-tl-muted" />
        </button>
        <button
          v-if="canDeleteTrip"
          type="button"
          class="tl-list-row w-full text-left"
          @click="emit('delete')"
        >
          <div>
            <div class="font-medium money-neg">Delete group</div>
            <div class="text-xs text-tl-muted">Owner only · cannot be undone</div>
          </div>
          <i class="pi pi-trash money-neg" />
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
    </template>
  </div>
</template>
