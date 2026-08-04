<script setup lang="ts">
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { useToast } from "primevue/usetoast";
import Button from "primevue/button";
import InputText from "primevue/inputtext";
import Select from "primevue/select";
import type { SettlementRounding, TransferMode } from "@tripledger/types";
import { useTripsStore } from "@/stores/trips";

const store = useTripsStore();
const router = useRouter();
const toast = useToast();

const name = ref("");
const transferMode = ref<TransferMode>("minimize");
const settlementRounding = ref<SettlementRounding>("rupee");
const saving = ref(false);

const TRANSFER_MODES: { label: string; value: TransferMode }[] = [
  { label: "Minimize transactions", value: "minimize" },
  { label: "Settle to one person", value: "settle_to_one" },
  { label: "Pairwise (proportional)", value: "pairwise" },
];

const ROUNDING_MODES: { label: string; value: SettlementRounding }[] = [
  { label: "Whole rupees", value: "rupee" },
  { label: "Exact paisa", value: "none" },
];

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
      detail: "Enter a trip name before saving.",
      life: 3000,
    });
    return;
  }
  saving.value = true;
  try {
    const id = await store.createTrip(trimmed, {
      transferMode: transferMode.value,
      settlementRounding: settlementRounding.value,
    });
    await router.replace(`/trips/${id}`);
  } catch (e) {
    toast.add({
      severity: "error",
      summary: "Could not create trip",
      detail: e instanceof Error ? e.message : String(e),
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
          >← All trips</router-link
        >
        <h1 class="mt-1 text-2xl font-semibold text-tl">New trip</h1>
        <p class="mt-1 text-sm text-tl-muted">
          Nothing is saved until you tap Save. Back discards this draft.
          After saving, invite friends with a share link so everyone can manage
          expenses together (when Supabase is configured).
        </p>
      </div>

      <div>
        <label class="tl-input-label">Trip name</label>
        <InputText
          v-model="name"
          class="w-full"
          placeholder="e.g. Abbottabad weekend"
          autofocus
          @keyup.enter="save"
        />
      </div>

      <div>
        <label class="tl-input-label">Currency</label>
        <InputText model-value="PKR" class="w-24" disabled />
        <p class="mt-1 text-xs text-tl-muted">Amounts are shown as Rs. (PKR).</p>
      </div>

      <div>
        <label class="tl-input-label">Transfer mode</label>
        <Select
          v-model="transferMode"
          :options="TRANSFER_MODES"
          option-label="label"
          option-value="value"
          class="w-full"
        />
      </div>

      <div>
        <label class="tl-input-label">Settlement rounding</label>
        <Select
          v-model="settlementRounding"
          :options="ROUNDING_MODES"
          option-label="label"
          option-value="value"
          class="w-full"
        />
      </div>

      <div class="flex flex-wrap gap-2">
        <Button
          label="Save trip"
          icon="pi pi-check"
          :disabled="!canSave"
          :loading="saving"
          @click="save"
        />
        <Button
          label="Cancel"
          severity="secondary"
          outlined
          :disabled="saving"
          @click="discard"
        />
      </div>
    </section>
  </div>
</template>
