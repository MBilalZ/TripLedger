<script setup lang="ts">
import { storeToRefs } from "pinia";
import Button from "primevue/button";
import InputText from "primevue/inputtext";
import { useInviteLink } from "@/composables/useInviteLink";
import { usePeoplePoolsUi } from "@/composables/usePeoplePoolsUi";
import { useAuthStore } from "@/stores/auth";
import { useWorkspaceStore } from "@/stores/workspace";

const auth = useAuthStore();
const store = useWorkspaceStore();
const { participants } = storeToRefs(store);
const { inviting, copyInviteLink } = useInviteLink(() => store.tripId);
const {
  editingParticipantId,
  newParticipant,
  startEditParticipant,
  cancelEditParticipant,
  saveParticipant,
  confirmRemoveParticipant,
} = usePeoplePoolsUi();
</script>

<template>
  <div class="tl-card space-y-3">
    <div v-if="auth.cloud" class="space-y-2">
      <p class="text-sm text-tl-muted">
        Prefer inviting friends — they enter their own name and can edit
        expenses with you.
      </p>
      <Button
        label="Copy invite link"
        icon="pi pi-link"
        size="small"
        :loading="inviting"
        @click="copyInviteLink"
      />
    </div>
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
  </div>
</template>
