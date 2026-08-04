<script setup lang="ts">
import { onMounted } from "vue";
import { storeToRefs } from "pinia";
import Button from "primevue/button";
import InputText from "primevue/inputtext";
import { useInviteLink } from "@/composables/useInviteLink";
import { usePeoplePoolsUi } from "@/composables/usePeoplePoolsUi";
import { leaveTrip } from "@/api/trips";
import { useAuthStore } from "@/stores/auth";
import { useWorkspaceStore } from "@/stores/workspace";
import { useRouter } from "vue-router";
import { useFeedback } from "@/composables/useFeedback";

const auth = useAuthStore();
const store = useWorkspaceStore();
const router = useRouter();
const { error: showError, success, confirmDanger } = useFeedback();
const { participants, isOwner } = storeToRefs(store);
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

onMounted(() => {
  if (auth.cloud && isOwner.value) void refreshInvites();
});

function formatExpiry(iso: string | null) {
  if (!iso) return "No expiry";
  const d = new Date(iso);
  return `Expires ${d.toLocaleDateString()}`;
}

function confirmLeave() {
  confirmDanger({
    message: "Leave this trip? You will lose access until invited again.",
    header: "Leave trip",
    onAccept: async () => {
      try {
        await leaveTrip(store.tripId);
        success("Left trip");
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
      Ask the trip owner for an invite link to add more members.
    </p>
    <p class="text-xs text-tl-muted">
      {{
        auth.cloud
          ? "Or add a placeholder name (secondary)."
          : "Add everyone who paid or shares costs."
      }}
    </p>
    <form
      class="flex flex-col gap-2 sm:flex-row"
      @submit.prevent="saveParticipant"
    >
      <InputText
        v-model="newParticipant"
        :placeholder="editingParticipantId ? 'Edit name' : 'Name'"
        class="w-full"
        aria-label="Person name"
        maxlength="80"
      />
      <div class="flex gap-2">
        <Button
          type="submit"
          :label="editingParticipantId ? 'Save' : 'Add'"
          :icon="editingParticipantId ? 'pi pi-check' : 'pi pi-plus'"
        />
        <Button
          v-if="editingParticipantId"
          type="button"
          label="Cancel"
          severity="secondary"
          outlined
          @click="cancelEditParticipant"
        />
      </div>
    </form>
    <ul class="m-0 list-none divide-y p-0" aria-label="People on this trip">
      <li v-for="p in participants" :key="p.id" class="tl-list-row">
        <span>{{ p.displayName }}</span>
        <div class="flex gap-1">
          <Button
            icon="pi pi-pencil"
            text
            rounded
            :aria-label="`Edit ${p.displayName}`"
            @click="startEditParticipant(p.id, p.displayName)"
          />
          <Button
            v-if="isOwner"
            icon="pi pi-times"
            severity="danger"
            text
            rounded
            :aria-label="`Remove ${p.displayName}`"
            @click="confirmRemoveParticipant(p.id, p.displayName)"
          />
        </div>
      </li>
      <li v-if="!participants.length" class="py-2 text-sm text-tl-muted">
        No people yet.
      </li>
    </ul>
    <Button
      v-if="auth.cloud && !isOwner"
      label="Leave trip"
      icon="pi pi-sign-out"
      severity="secondary"
      outlined
      size="small"
      @click="confirmLeave"
    />
  </div>
</template>
