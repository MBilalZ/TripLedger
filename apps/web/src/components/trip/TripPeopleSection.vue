<script setup lang="ts">
import { onMounted, ref } from "vue";
import { storeToRefs } from "pinia";
import Button from "primevue/button";
import InputText from "primevue/inputtext";
import { useInviteLink } from "@/composables/useInviteLink";
import { usePeoplePoolsUi } from "@/composables/usePeoplePoolsUi";
import { useAuthStore } from "@/stores/auth";
import { useTripsStore } from "@/stores/trips";
import { useWorkspaceStore } from "@/stores/workspace";
import { useRouter } from "vue-router";
import { useFeedback } from "@/composables/useFeedback";

const auth = useAuthStore();
const store = useWorkspaceStore();
const trips = useTripsStore();
const router = useRouter();
const { error: showError, success, confirmDanger } = useFeedback();
const { participants, isOwner, myRole } = storeToRefs(store);
const {
  inviting,
  invites,
  loadingInvites,
  copyInviteLink,
  copyExisting,
  revoke,
  refreshInvites,
} = useInviteLink(() => store.tripId);
const {
  editingParticipantId,
  newParticipant,
  startEditParticipant,
  cancelEditParticipant,
  saveParticipant,
  confirmRemoveParticipant,
} = usePeoplePoolsUi();

/** Only one friend row expanded for edit at a time. */
const expandedId = ref<string | null>(null);
const showAdd = ref(false);

onMounted(() => {
  if (auth.cloud && isOwner.value) void refreshInvites();
});

function formatExpiry(iso: string | null) {
  if (!iso) return "No expiry";
  const d = new Date(iso);
  return `Expires ${d.toLocaleDateString()}`;
}

function toggleExpand(id: string, name: string) {
  if (expandedId.value === id) {
    expandedId.value = null;
    cancelEditParticipant();
    return;
  }
  expandedId.value = id;
  showAdd.value = false;
  startEditParticipant(id, name);
}

function cancelExpand() {
  expandedId.value = null;
  cancelEditParticipant();
}

async function saveExpanded() {
  await saveParticipant();
  expandedId.value = null;
}

function openAdd() {
  showAdd.value = true;
  expandedId.value = null;
  cancelEditParticipant();
  newParticipant.value = "";
}

function cancelAdd() {
  showAdd.value = false;
  newParticipant.value = "";
}

async function saveAdd() {
  await saveParticipant();
  showAdd.value = false;
}

function confirmLeave() {
  const ownerLeave =
    myRole.value === "owner"
      ? "Leave this group? If you’re the last member the group is deleted for everyone. Otherwise another member becomes the owner."
      : "Leave this group? You will lose access until invited again.";
  confirmDanger({
    message: ownerLeave,
    header: "Leave group",
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
      <div v-if="loadingInvites" class="text-xs text-tl-muted">Loading invites…</div>
      <ul
        v-else-if="invites.length"
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
              @click="revoke(inv.token)"
            />
          </div>
        </li>
      </ul>
    </div>
    <p v-else-if="auth.cloud" class="text-xs text-tl-muted">
      Ask the group owner for an invite link to add more members.
    </p>

    <ul class="m-0 list-none divide-y p-0" aria-label="Friends in this group">
      <li v-for="p in participants" :key="p.id" class="py-2">
        <button
          type="button"
          class="tl-list-row w-full text-left"
          :aria-expanded="expandedId === p.id"
          @click="toggleExpand(p.id, p.displayName)"
        >
          <span>{{ p.displayName }}</span>
          <i
            class="pi text-tl-muted"
            :class="expandedId === p.id ? 'pi-chevron-up' : 'pi-chevron-down'"
            aria-hidden="true"
          />
        </button>
        <div v-if="expandedId === p.id" class="mt-2 space-y-2 pl-1">
          <form class="flex flex-col gap-2 sm:flex-row" @submit.prevent="saveExpanded">
            <InputText
              v-model="newParticipant"
              class="w-full"
              aria-label="Friend name"
              maxlength="80"
            />
            <div class="flex gap-2">
              <Button type="submit" label="Save" icon="pi pi-check" />
              <Button
                type="button"
                label="Cancel"
                severity="secondary"
                outlined
                @click="cancelExpand"
              />
            </div>
          </form>
          <Button
            v-if="isOwner"
            label="Remove"
            icon="pi pi-times"
            severity="danger"
            size="small"
            text
            @click="confirmRemoveParticipant(p.id, p.displayName)"
          />
        </div>
      </li>
      <li v-if="!participants.length" class="py-2 text-sm text-tl-muted">
        No friends yet.
      </li>
    </ul>

    <div v-if="showAdd" class="space-y-2 border-t border-tl-hairline pt-3">
      <form class="flex flex-col gap-2 sm:flex-row" @submit.prevent="saveAdd">
        <InputText
          v-model="newParticipant"
          placeholder="Name"
          class="w-full"
          aria-label="Friend name"
          maxlength="80"
        />
        <div class="flex gap-2">
          <Button type="submit" label="Add" icon="pi pi-plus" />
          <Button
            type="button"
            label="Cancel"
            severity="secondary"
            outlined
            @click="cancelAdd"
          />
        </div>
      </form>
    </div>
    <Button
      v-else
      label="Add friend"
      icon="pi pi-plus"
      size="small"
      outlined
      @click="openAdd"
    />

    <div v-if="auth.cloud && myRole" class="border-t border-tl-hairline pt-3">
      <Button
        label="Leave group"
        icon="pi pi-sign-out"
        severity="danger"
        size="small"
        text
        @click="confirmLeave"
      />
    </div>
  </div>
</template>
