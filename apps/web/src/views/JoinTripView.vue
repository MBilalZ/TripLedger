<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useToast } from "primevue/usetoast";
import Button from "primevue/button";
import InputText from "primevue/inputtext";
import { cloudJoinWithToken } from "@/lib/cloud/tripsApi";
import { ensureAuthSession, isSupabaseConfigured } from "@/lib/supabase";
import { useTripsStore } from "@/stores/trips";

const props = defineProps<{ token: string }>();
const route = useRoute();
const router = useRouter();
const toast = useToast();
const trips = useTripsStore();

const displayName = ref("");
const joining = ref(false);
const error = ref<string | null>(null);

const token = () => props.token || String(route.params.token ?? "");

onMounted(async () => {
  if (!isSupabaseConfigured()) {
    error.value =
      "Shared invites require Supabase. Configure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.";
    return;
  }
  try {
    await ensureAuthSession();
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  }
});

async function join() {
  const name = displayName.value.trim();
  if (!name) {
    toast.add({
      severity: "warn",
      summary: "Name required",
      detail: "Enter how others should see you on this trip.",
      life: 3000,
    });
    return;
  }
  joining.value = true;
  try {
    const result = await cloudJoinWithToken(token(), name);
    await trips.refresh();
    toast.add({
      severity: "success",
      summary: result.already_member ? "Already a member" : "Joined trip",
      life: 2500,
    });
    await router.replace(`/trips/${result.trip_id}`);
  } catch (e) {
    toast.add({
      severity: "error",
      summary: "Could not join",
      detail: e instanceof Error ? e.message : String(e),
      life: 5000,
    });
  } finally {
    joining.value = false;
  }
}
</script>

<template>
  <section class="tl-card mx-auto max-w-md space-y-4" aria-labelledby="join-title">
    <router-link to="/" class="text-xs text-tl-accent no-underline"
      >← All trips</router-link
    >
    <h1 id="join-title" class="text-2xl font-semibold text-tl">Join trip</h1>
    <p class="text-sm text-tl-muted">
      Enter your name so everyone on the trip can recognize you. You’ll be able
      to add and manage expenses with the group.
    </p>
    <div v-if="error" class="tl-alert" role="alert">{{ error }}</div>
    <div v-else>
      <label class="tl-input-label" for="join-name">Your display name</label>
      <InputText
        id="join-name"
        v-model="displayName"
        class="w-full"
        placeholder="e.g. Bilal"
        autofocus
        @keyup.enter="join"
      />
      <div class="mt-3 flex flex-wrap gap-2">
        <Button
          label="Join trip"
          icon="pi pi-sign-in"
          :loading="joining"
          @click="join"
        />
      </div>
    </div>
  </section>
</template>
