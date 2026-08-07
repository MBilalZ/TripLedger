<script setup lang="ts">
import { storeToRefs } from "pinia";
import type { MenuItem } from "primevue/menuitem";
import type { MoreSection } from "@/composables/useTripTabs";
import { isEnabled } from "@/lib/features";
import { useWorkspaceStore } from "@/stores/workspace";
import TlIcon from "@/components/ui/TlIcon.vue";
import TlIconButton from "@/components/ui/TlIconButton.vue";
import TripPeopleSection from "./TripPeopleSection.vue";
import TripPoolsSection from "./TripPoolsSection.vue";

defineProps<{
  visible: boolean;
  moreSection: MoreSection;
  moreTitle: string;
  exportItems: MenuItem[];
  showInvite: boolean;
  inviting: boolean;
  canLeaveTrip: boolean;
  canDeleteTrip: boolean;
}>();

const emit = defineEmits<{
  "update:moreSection": [section: MoreSection];
  openMore: [section: MoreSection];
  invite: [];
  leave: [];
  delete: [];
  exportCommand: [item: MenuItem];
}>();

const store = useWorkspaceStore();
const { participants, pools } = storeToRefs(store);

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
        <h2 class="tl-section-title">People & pools</h2>
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
          <TlIcon name="chevron-right" class="text-tl-muted" />
        </button>
        <button
          type="button"
          class="tl-list-row w-full text-left"
          @click="emit('openMore', 'pools')"
        >
          <div>
            <div class="font-medium">Pools</div>
            <div class="text-xs text-tl-muted">
              {{ pools.length }} pool(s) · sharing groups
            </div>
          </div>
          <TlIcon name="chevron-right" class="text-tl-muted" />
        </button>
      </div>

      <div v-if="isEnabled('exports')" class="tl-card space-y-1">
        <h2 class="tl-section-title">Exports & reports</h2>
        <p class="mb-2 text-xs text-tl-muted">
          Full settlement breakdown (expenses, shares, transfers) when the group
          is balanced.
        </p>
        <button
          v-for="item in exportItems"
          :key="String(item.label)"
          type="button"
          class="tl-list-row w-full text-left"
          @click="runExport(item)"
        >
          <div class="flex items-center gap-3">
            <i v-if="item.icon" :class="item.icon" class="tl-icon text-tl-muted" />
            <div class="font-medium">{{ item.label }}</div>
          </div>
          <TlIcon name="chevron-right" class="text-tl-muted" />
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
          <TlIcon name="link" class="text-tl-muted" />
        </button>
        <button
          v-if="canLeaveTrip"
          type="button"
          class="tl-list-row w-full text-left"
          @click="emit('leave')"
        >
          <div>
            <div class="font-medium money-neg">Leave group</div>
            <div class="text-xs text-tl-muted">You’ll lose access until invited again</div>
          </div>
          <TlIcon name="sign-out" class="money-neg" />
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
          <TlIcon name="trash" class="money-neg" />
        </button>
      </div>
    </template>

    <template v-else>
      <div class="flex items-center gap-2">
        <TlIconButton
          icon="arrow-left"
          aria-label="Back to more menu"
          @click="emit('update:moreSection', 'menu')"
        />
        <h2 class="text-lg font-semibold text-tl">{{ moreTitle }}</h2>
      </div>
      <TripPeopleSection v-if="moreSection === 'people'" />
      <TripPoolsSection
        v-else-if="moreSection === 'pools'"
        @open-friends="emit('openMore', 'people')"
      />
    </template>
  </div>
</template>
