<script setup lang="ts">
import { onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { storeToRefs } from "pinia";
import { useInviteLink } from "@/composables/useInviteLink";
import { usePeoplePoolsUi } from "@/composables/usePeoplePoolsUi";
import { useFeedback } from "@/composables/useFeedback";
import { useAuthStore } from "@/stores/auth";
import { useWorkspaceStore } from "@/stores/workspace";
import TlButton from "@/components/ui/TlButton.vue";
import TlIcon from "@/components/ui/TlIcon.vue";
import TlIconButton from "@/components/ui/TlIconButton.vue";

const auth = useAuthStore();
const store = useWorkspaceStore();
const route = useRoute();
const router = useRouter();
const { confirmAction } = useFeedback();
const { participants, isOwner } = storeToRefs(store);
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
</script>

<template>
  <div class="space-y-4">
    <div class="tl-card space-y-3">
      <div v-if="auth.cloud && isOwner" class="space-y-2">
        <p class="text-sm text-tl-muted">
          Prefer inviting friends — they enter their own name and can edit
          expenses with you. Links expire after 7 days.
        </p>
        <TlButton
          label="Copy invite link"
          icon="link"
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
              <TlButton
                label="Copy"
                variant="text"
                @click="copyExisting(inv.token)"
              />
              <TlButton
                label="Revoke"
                variant="danger"
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
          class="tl-list-row"
        >
          <span>{{ p.displayName }}</span>
          <div class="flex gap-1">
            <TlIconButton
              icon="pencil"
              aria-label="Edit friend"
              @click="goEdit(p.id)"
            />
            <TlIconButton
              v-if="isOwner"
              icon="trash"
              variant="danger"
              aria-label="Remove friend"
              @click="confirmRemoveParticipant(p.id, p.displayName)"
            />
          </div>
        </li>
        <li v-if="!participants.length" class="py-2 text-sm text-tl-muted">
          No friends yet.
        </li>
      </ul>
    </div>

    <button type="button" class="tl-fab" @click="goAdd">
      <TlIcon name="user-plus" />
      Add friend
    </button>
  </div>
</template>
