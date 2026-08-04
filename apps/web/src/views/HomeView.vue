<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { useToast } from "primevue/usetoast";
import { useConfirm } from "primevue/useconfirm";
import Button from "primevue/button";
import Menu from "primevue/menu";
import type { MenuItem } from "primevue/menuitem";
import { useTripsStore } from "@/stores/trips";
import { downloadFullBackup, importBackupFile } from "@/lib/backup";

const store = useTripsStore();
const router = useRouter();
const toast = useToast();
const confirm = useConfirm();
const fileInput = ref<HTMLInputElement | null>(null);
const toolsMenu = ref<InstanceType<typeof Menu> | null>(null);
const isDev = import.meta.env.DEV;

onMounted(() => store.refresh());

async function seed() {
  const id = await store.seedSample();
  toast.add({
    severity: "success",
    summary: "Sample trip ready",
    detail: "Expected: Mamo→Bilal 19488, Salman→Bilal 656, Farhan→Bilal 718",
    life: 5000,
  });
  router.push(`/trips/${id}`);
}

async function onImport(ev: Event) {
  const file = (ev.target as HTMLInputElement).files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const ids = await importBackupFile(text);
    await store.refresh();
    toast.add({
      severity: "success",
      summary: "Imported",
      detail: `${ids.length} trip(s)`,
      life: 3000,
    });
    if (ids[0]) router.push(`/trips/${ids[0]}`);
  } catch (e) {
    toast.add({
      severity: "error",
      summary: "Import failed",
      detail: e instanceof Error ? e.message : String(e),
      life: 4000,
    });
  } finally {
    (ev.target as HTMLInputElement).value = "";
  }
}

const toolItems = computed<MenuItem[]>(() => [
  ...(isDev
    ? [
        {
          label: "Load sample trip",
          icon: "pi pi-sparkles",
          command: () => seed(),
        } satisfies MenuItem,
      ]
    : []),
  {
    label: "Backup all",
    icon: "pi pi-download",
    command: () => downloadFullBackup(),
  },
  {
    label: "Import JSON",
    icon: "pi pi-upload",
    command: () => fileInput.value?.click(),
  },
]);

function toggleTools(event: Event) {
  toolsMenu.value?.toggle(event);
}

function confirmDeleteTrip(tripId: string, tripName: string, event: Event) {
  event.preventDefault();
  event.stopPropagation();
  confirm.require({
    message: `Delete “${tripName}” from this device? This cannot be undone.`,
    header: "Delete trip",
    icon: "pi pi-exclamation-triangle",
    acceptClass: "p-button-danger",
    accept: async () => {
      await store.deleteTrip(tripId);
      toast.add({
        severity: "success",
        summary: "Trip deleted",
        life: 2000,
      });
    },
  });
}
</script>

<template>
  <div class="space-y-6">
    <section class="tl-card">
      <h1 class="mb-1 text-2xl font-semibold text-tl-accent-bright">
        Your trips
      </h1>
      <p class="mb-4 text-sm text-tl-muted">
        Everything stays on this device. Export JSON to share or back up.
      </p>
      <div class="flex flex-col gap-3 sm:flex-row">
        <Button
          label="New trip"
          icon="pi pi-plus"
          class="w-full sm:w-auto"
          @click="router.push('/trips/new')"
        />
      </div>
      <div class="mt-3 flex items-center gap-2">
        <Button
          label="Tools"
          icon="pi pi-ellipsis-h"
          severity="secondary"
          outlined
          size="small"
          @click="toggleTools"
          aria-haspopup="true"
          aria-controls="home_tools_menu"
        />
        <Menu
          id="home_tools_menu"
          ref="toolsMenu"
          :model="toolItems"
          popup
        />
        <input
          ref="fileInput"
          type="file"
          accept="application/json,.json"
          class="hidden"
          @change="onImport"
        />
      </div>
    </section>

    <section class="grid gap-3">
      <div v-if="!store.trips.length" class="tl-card text-center text-tl-muted">
        No trips yet. Create one{{ isDev ? " or load the sample" : "" }}.
      </div>
      <div
        v-for="t in store.trips"
        :key="t.id"
        class="tl-card tl-pressable tl-trip-link flex items-center justify-between gap-3"
      >
        <router-link
          :to="`/trips/${t.id}`"
          class="min-w-0 flex-1 no-underline"
        >
          <div class="font-medium text-tl">{{ t.name }}</div>
          <div class="text-xs text-tl-muted">
            Updated {{ new Date(t.updatedAt).toLocaleString() }} ·
            {{ t.currency }}
          </div>
        </router-link>
        <Button
          icon="pi pi-trash"
          severity="danger"
          text
          rounded
          aria-label="Delete trip"
          v-tooltip="'Delete trip'"
          @click="confirmDeleteTrip(t.id, t.name, $event)"
        />
        <router-link
          :to="`/trips/${t.id}`"
          class="text-tl-muted no-underline"
          aria-hidden="true"
          tabindex="-1"
        >
          <i class="pi pi-chevron-right" />
        </router-link>
      </div>
    </section>
  </div>
</template>
