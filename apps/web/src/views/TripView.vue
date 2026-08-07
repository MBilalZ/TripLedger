<script setup lang="ts">
import { computed } from "vue";
import { useRouter } from "vue-router";
import { useFeedback } from "@/composables/useFeedback";
import { useTripWorkspace } from "@/composables/useTripWorkspace";
import { useInviteLink } from "@/composables/useInviteLink";
import { usePeoplePoolsUi } from "@/composables/usePeoplePoolsUi";
import { useTripExports } from "@/composables/useTripExports";
import { useTripTabs } from "@/composables/useTripTabs";
import { useAuthStore } from "@/stores/auth";
import { useTripsStore } from "@/stores/trips";
import AppLoading from "@/components/AppLoading.vue";
import TripBalancesPanel from "@/components/trip/TripBalancesPanel.vue";
import TripBottomNav from "@/components/trip/TripBottomNav.vue";
import TripExpensesPanel from "@/components/trip/TripExpensesPanel.vue";
import TripHeader from "@/components/trip/TripHeader.vue";
import TripMorePanel from "@/components/trip/TripMorePanel.vue";
import TripPaymentsPanel from "@/components/trip/TripPaymentsPanel.vue";
import TripSettlePanel from "@/components/trip/TripSettlePanel.vue";

const props = defineProps<{ tripId: string }>();
const auth = useAuthStore();
const trips = useTripsStore();
const router = useRouter();
const { error: showError, success, confirmDanger } = useFeedback();

const { trip, settlement, loading, statusMessage, isOwner, myRole } =
  useTripWorkspace(() => props.tripId);

const {
  activeTab,
  moreSection,
  moreTitle,
  setTab,
  openMore,
  setMoreSection,
} = useTripTabs(() => props.tripId);
const {
  editingTrip,
  tripNameDraft,
  startEditTrip,
  cancelEditTrip,
  saveTrip,
} = usePeoplePoolsUi();
const { inviting, copyInviteLink } = useInviteLink(() => props.tripId);
const { exportItems, deleteTrip } = useTripExports({
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

function confirmLeave() {
  const message =
    myRole.value === "owner"
      ? "If you’re the last member, the group is deleted for everyone. Otherwise another member becomes the owner."
      : "You’ll lose access until you’re invited again.";
  confirmDanger({
    header: "Leave group?",
    message,
    onAccept: async () => {
      try {
        const result = await trips.leaveTrip(props.tripId);
        if (result.action === "deleted") {
          success("Group deleted");
        } else {
          success(
            result.promotedUserId
              ? "Left — another member is now the owner"
              : "Left group",
          );
        }
        await router.push("/");
      } catch (e) {
        showError("Could not leave", e, 5000);
      }
    },
  });
}
</script>

<template>
  <AppLoading v-if="loading && (!trip || trip.id !== tripId)" />
  <div v-else-if="!trip || trip.id !== tripId" class="tl-card">Group not found.</div>
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
      :can-edit-trip="isOwner"
      @start-edit="startEditTrip"
      @cancel-edit="cancelEditTrip"
      @save="saveTrip"
    />

    <TripExpensesPanel
      :visible="activeTab === 'expenses'"
      @open-friends="openMore('people')"
    />
    <TripBalancesPanel :visible="activeTab === 'balances'" />
    <TripSettlePanel
      :visible="activeTab === 'settle'"
      @record-payment="onRecordPayment"
    />
    <TripPaymentsPanel :visible="activeTab === 'payments'" />
    <TripMorePanel
      :visible="activeTab === 'more'"
      :more-section="moreSection"
      :more-title="moreTitle"
      :export-items="exportItems"
      :show-invite="auth.cloud && isOwner"
      :inviting="inviting"
      :can-leave-trip="Boolean(auth.cloud && myRole)"
      :can-delete-trip="isOwner"
      @update:more-section="setMoreSection"
      @open-more="openMore"
      @invite="copyInviteLink"
      @leave="confirmLeave"
      @delete="deleteTrip"
    />

    <TripBottomNav :active-tab="activeTab" @set-tab="setTab" />
  </div>
</template>
