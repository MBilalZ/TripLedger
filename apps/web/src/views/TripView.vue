<script setup lang="ts">
import { computed } from "vue";
import { useTripWorkspace } from "@/composables/useTripWorkspace";
import { useInviteLink } from "@/composables/useInviteLink";
import { usePeoplePoolsUi } from "@/composables/usePeoplePoolsUi";
import { useTripExports } from "@/composables/useTripExports";
import { useTripTabs } from "@/composables/useTripTabs";
import { useAuthStore } from "@/stores/auth";
import TripBalancesPanel from "@/components/trip/TripBalancesPanel.vue";
import TripBottomNav from "@/components/trip/TripBottomNav.vue";
import TripExpensesPanel from "@/components/trip/TripExpensesPanel.vue";
import TripHeader from "@/components/trip/TripHeader.vue";
import TripMorePanel from "@/components/trip/TripMorePanel.vue";
import TripSettlePanel from "@/components/trip/TripSettlePanel.vue";

const props = defineProps<{ tripId: string }>();
const auth = useAuthStore();

const { trip, settlement, loading, statusMessage, isOwner } = useTripWorkspace(
  () => props.tripId,
);

const { activeTab, moreSection, moreTitle, setTab, openMore } = useTripTabs();
const {
  editingTrip,
  tripNameDraft,
  startEditTrip,
  cancelEditTrip,
  saveTrip,
} = usePeoplePoolsUi();
const { inviting, copyInviteLink } = useInviteLink(() => props.tripId);
const { exportItems, deleteTrip, formatTransferAmount } = useTripExports({
  tripId: () => props.tripId,
  trip,
  settlement,
});

const balanced = computed(() => settlement.value?.consistency.ok ?? false);
</script>

<template>
  <div v-if="loading" class="text-tl-muted" role="status">Loading…</div>
  <div v-else-if="!trip" class="tl-card">Trip not found.</div>
  <div v-else class="tl-has-bottom-nav space-y-4">
    <div class="sr-only" aria-live="polite" aria-atomic="true">
      {{ statusMessage }}
    </div>

    <TripHeader
      :trip="trip"
      :balanced="balanced"
      :trip-total-paisa="settlement?.summary.tripTotalPaisa ?? 0"
      :editing-trip="editingTrip"
      v-model:trip-name-draft="tripNameDraft"
      :show-invite="auth.cloud && isOwner"
      :can-edit-trip="isOwner"
      :can-delete-trip="isOwner"
      :inviting="inviting"
      :export-items="exportItems"
      @start-edit="startEditTrip"
      @cancel-edit="cancelEditTrip"
      @save="saveTrip"
      @invite="copyInviteLink"
      @delete="deleteTrip"
    />

    <TripExpensesPanel
      :visible="activeTab === 'expenses'"
      @open-more="openMore"
    />
    <TripBalancesPanel
      :visible="activeTab === 'balances'"
      :format-transfer-amount="formatTransferAmount"
    />
    <TripSettlePanel :visible="activeTab === 'settle'" />
    <TripMorePanel
      :visible="activeTab === 'more'"
      :more-section="moreSection"
      :more-title="moreTitle"
      @update:more-section="moreSection = $event"
      @open-more="openMore"
    />

    <TripBottomNav :active-tab="activeTab" @set-tab="setTab" />
  </div>
</template>
