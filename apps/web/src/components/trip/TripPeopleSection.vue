<script setup lang="ts">
import { onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { storeToRefs } from "pinia";
import Button from "primevue/button";
import { useInviteLink } from "@/composables/useInviteLink";
import { usePeoplePoolsUi } from "@/composables/usePeoplePoolsUi";
import { useFeedback } from "@/composables/useFeedback";
import { useAuthStore } from "@/stores/auth";
import { useTripsStore } from "@/stores/trips";
import { useWorkspaceStore } from "@/stores/workspace";

const auth = useAuthStore();
const store = useWorkspaceStore();
const trips = useTripsStore();
const route = useRoute();
const router = useRouter();
const { error: showError, success, confirmDanger, confirmAction } = useFeedback();
const { participants, isOwner, myRole } = storeToRefs(store);
const {
  inviting,
  invites,
  copyInviteLink,
  copyExisting,
  revoke,
  refreshInvites,
} = useInviteLink(() => store.tripId);
const { confirmRemoveParticipant } = usePeoplePoolsUi();

onMounted(() => {
  if (auth.cloud && isOwner.value) void refreshInvites();
});

function currentTripId() {
  return store.tripId || String(route.params.tripId ?? "");
}

function goAdd() {
  void router.push({
    name: "friend-new",
    params: { tripId: currentTripId() },
  });
}

function goEdit(participantId: string) {
  void router.push({
    name: "friend-edit",
    params: { tripId: currentTripId(), participantId },
  });
}

function formatExpiry(iso: string | null) {
  if (!iso) return "No expiry";
  const d = new Date(iso);
  return `Expires ${d.toLocaleDateString()}`;
}

function confirmRevokeInvite(token: string) {
  confirmAction({
    header: "Revoke invite?",
    message: "People with this link won’t be able to join.",
    onAccept: () => {
      void revoke(token);
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
        const result = await trips.leaveTrip(store.tripId);
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
  <div class="space-y-4">
    <div class="tl-card space-y-3">
      <div v-if="auth.cloud && isOwner" class="space-y-2">
        <p class="text-sm text-tl-muted">
          Prefer inviting friends — they enter their own name and can edit
          expenses with you. Links expire after 7 days.
        </p>
        <Button
          label="Copy invite link"
          icon="pi pi-link"
          size="small"
          :loading="inviting"
          @click="copyInviteLink"
        />
        <ul
          v-if="invites.length"
          class="m-0 list-none space-y-2 p-0"
          aria-label="Active invites"
        >
          <li
            v-for="inv in invites"
            :key="inv.token"
            class="flex flex-wrap items-center justify-between gap-2 text-sm"
          >
            <span class="text-tl-muted">{{ formatExpiry(inv.expires_at) }}</span>
            <div class="flex gap-1">
              <Button
                label="Copy"
                size="small"
                text
                @click="copyExisting(inv.token)"
              />
              <Button
                label="Revoke"
                size="small"
                severity="danger"
                text
                @click="confirmRevokeInvite(inv.token)"
              />
            </div>
          </li>
        </ul>
      </div>
      <p v-else-if="auth.cloud" class="text-xs text-tl-muted">
        Ask the group owner for an invite link to add more members.
      </p>

      <ul class="m-0 list-none divide-y p-0" aria-label="Friends in this group">
        <li
          v-for="p in participants"
          :key="p.id"
          class="tl-list-row py-2"
        >
          <span>{{ p.displayName }}</span>
          <div class="flex gap-1">
            <Button
              icon="pi pi-pencil"
              text
              rounded
              size="small"
              aria-label="Edit friend"
              @click="goEdit(p.id)"
            />
            <Button
              v-if="isOwner"
              icon="pi pi-trash"
              text
              severity="danger"
              rounded
              size="small"
              aria-label="Remove friend"
              @click="confirmRemoveParticipant(p.id, p.displayName)"
            />
          </div>
        </li>
        <li v-if="!participants.length" class="py-2 text-sm text-tl-muted">
          No friends yet.
        </li>
      </ul>

      <div v-if="auth.cloud && myRole" class="mt-0 border-t border-tl-hairline p-0">
        <Button
          class="pt-3"
          label="Leave group"
          icon="pi pi-sign-out"
          severity="danger"
          size="small"
          text
          @click="confirmLeave"
        />
      </div>
    </div>

    <button type="button" class="tl-fab" @click="goAdd">
      <i class="pi pi-user-plus" aria-hidden="true" />
      Add friend
    </button>
  </div>
</template>
