<script setup lang="ts">
import { computed } from "vue";
import { useRouter } from "vue-router";
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
import TripPaymentsPanel from "@/components/trip/TripPaymentsPanel.vue";
import TripPoolsPanel from "@/components/trip/TripPoolsPanel.vue";
import TripSettlePanel from "@/components/trip/TripSettlePanel.vue";

const props = defineProps<{ tripId: string }>();
const auth = useAuthStore();
const router = useRouter();

const { trip, settlement, loading, statusMessage, isOwner } = useTripWorkspace(
  () => props.tripId,
);

const {
  activeTab,
  moreSection,
  moreTitle,
  setTab,
  openMore,
} = useTripTabs();
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
const memberCount = computed(
  () => settlement.value?.summary.participantCount ?? 0,
);

function onRecordPayment(payload: {
  paidById: string;
  receivedById: string;
  amountRupees: number;
}) {
  void router.push({
    name: "payment-new",
    params: { tripId: props.tripId },
    query: {
      paidById: payload.paidById,
      receivedById: payload.receivedById,
      amountRupees: String(payload.amountRupees),
      reason: "Settle up",
    },
  });
}
</script>

<template>
  <div v-if="loading" class="text-tl-muted" role="status">Loading…</div>
  <div v-else-if="!trip" class="tl-card">Group not found.</div>
  <div v-else class="tl-has-bottom-nav space-y-4">
    <div class="sr-only" aria-live="polite" aria-atomic="true">
      {{ statusMessage }}
    </div>

    <TripHeader
      :trip="trip"
      :balanced="balanced"
      :trip-total-paisa="settlement?.summary.tripTotalPaisa ?? 0"
      :member-count="memberCount"
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
      @go-settle="setTab('settle')"
      @go-charts="setTab('balances')"
    />

    <TripExpensesPanel
      :visible="activeTab === 'expenses'"
      @open-friends="openMore('people')"
    />
    <TripBalancesPanel
      :visible="activeTab === 'balances'"
      :format-transfer-amount="formatTransferAmount"
      @record-payment="onRecordPayment"
    />
    <TripSettlePanel
      :visible="activeTab === 'settle'"
      @record-payment="onRecordPayment"
    />
    <TripPoolsPanel :visible="activeTab === 'pools'" />
    <TripPaymentsPanel :visible="activeTab === 'payments'" />
    <TripMorePanel
      :visible="activeTab === 'more'"
      :more-section="moreSection"
      :more-title="moreTitle"
      :export-items="exportItems"
      :show-invite="auth.cloud && isOwner"
      :inviting="inviting"
      :can-delete-trip="isOwner"
      @update:more-section="moreSection = $event"
      @open-more="openMore"
      @invite="copyInviteLink"
      @delete="deleteTrip"
    />

    <TripBottomNav :active-tab="activeTab" @set-tab="setTab" />
  </div>
</template>
