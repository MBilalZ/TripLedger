<script setup lang="ts">
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { useToast } from "primevue/usetoast";
import TlButton from "@/components/ui/TlButton.vue";
import TlInput from "@/components/ui/TlInput.vue";
import TlLabel from "@/components/ui/TlLabel.vue";
import { toApiError } from "@/services/errors";
import { useTripsStore } from "@/stores/trips";

const store = useTripsStore();
const router = useRouter();
const toast = useToast();

const name = ref("");
const saving = ref(false);

const canSave = computed(() => name.value.trim().length > 0 && !saving.value);

function discard() {
  router.push("/");
}

async function save() {
  const trimmed = name.value.trim();
  if (!trimmed) {
    toast.add({
      severity: "warn",
      summary: "Name required",
      detail: "Enter a group name before saving.",
      life: 3000,
    });
    return;
  }
  saving.value = true;
  try {
    const id = await store.createTrip(trimmed);
    await router.replace(`/trips/${id}`);
  } catch (e) {
    toast.add({
      severity: "error",
      summary: "Could not create group",
      detail: toApiError(e).message,
      life: 4000,
    });
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="space-y-4">
    <section class="tl-card space-y-4">
      <div>
        <router-link to="/" class="text-xs text-tl-accent no-underline"
          >← All groups</router-link
        >
        <h1 class="mt-1 text-2xl font-semibold text-tl">New group</h1>
        <p class="mt-1 text-sm text-tl-muted">
          Nothing is saved until you tap Save. Back discards this draft.
          After saving, invite friends with a share link so everyone can manage
          expenses together (when Supabase is configured).
        </p>
      </div>

      <div>
        <TlLabel>Group name</TlLabel>
        <TlInput
          v-model="name"
          placeholder="e.g. Abbottabad weekend"
          autofocus
          @keyup.enter="save"
        />
      </div>

      <p class="text-xs text-tl-muted">Amounts are in Pakistani rupees (Rs.).</p>

      <div class="flex flex-wrap gap-2">
        <TlButton
          label="Save group"
          icon="check"
          :disabled="!canSave"
          :loading="saving"
          @click="save"
        />
        <TlButton
          label="Cancel"
          variant="outlined"
          :disabled="saving"
          @click="discard"
        />
      </div>
    </section>
  </div>
</template>
