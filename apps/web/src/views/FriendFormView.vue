<script setup lang="ts">
import { onMounted, watch } from "vue";
import { useRouter } from "vue-router";
import AppLoading from "@/components/AppLoading.vue";
import TlButton from "@/components/ui/TlButton.vue";
import TlInput from "@/components/ui/TlInput.vue";
import TlLabel from "@/components/ui/TlLabel.vue";
import { usePeoplePoolsUi } from "@/composables/usePeoplePoolsUi";
import { useTripWorkspace } from "@/composables/useTripWorkspace";
import { storeToRefs } from "pinia";
import { useWorkspaceStore } from "@/stores/workspace";

const props = defineProps<{ tripId: string; participantId?: string }>();
const router = useRouter();

useTripWorkspace(() => props.tripId);
const store = useWorkspaceStore();
const { loading, trip } = storeToRefs(store);

const {
  editingParticipantId,
  friendName,
  friendFormTitle,
  clearFriendForm,
  openAddFriend,
  startEditFriend,
  onSaveFriend,
} = usePeoplePoolsUi({
  onClose: () => {
    void router.push({ name: "trip", params: { tripId: props.tripId } });
  },
});

function cancel() {
  clearFriendForm();
  void router.push({ name: "trip", params: { tripId: props.tripId } });
}

function boot() {
  if (loading.value || !trip.value) return;
  if (props.participantId) {
    startEditFriend(props.participantId);
    if (!editingParticipantId.value) {
      void router.replace({ name: "trip", params: { tripId: props.tripId } });
    }
  } else {
    openAddFriend();
  }
}

onMounted(() => {
  boot();
});

watch(
  () => [props.participantId, loading.value, trip.value?.id] as const,
  () => {
    boot();
  },
);
</script>

<template>
  <AppLoading v-if="loading && (!trip || trip.id !== tripId)" />
  <div v-else-if="!trip || trip.id !== tripId" class="tl-card">Group not found.</div>
  <div v-else class="space-y-4">
    <div class="tl-card grid gap-3">
      <div class="flex items-center justify-between gap-2">
        <h3 class="tl-section-title mb-0">{{ friendFormTitle }}</h3>
        <TlButton label="Cancel" variant="text" @click="cancel" />
      </div>

      <div>
        <TlLabel>Name</TlLabel>
        <TlInput
          v-model="friendName"
          placeholder="Friend name"
          aria-label="Friend name"
          :maxlength="80"
          @keyup.enter="onSaveFriend"
        />
      </div>

      <div class="flex flex-wrap gap-2">
        <TlButton
          :label="editingParticipantId ? 'Save friend' : 'Add friend'"
          :icon="editingParticipantId ? 'check' : 'plus'"
          type="button"
          @click="onSaveFriend"
        />
      </div>
    </div>
  </div>
</template>
