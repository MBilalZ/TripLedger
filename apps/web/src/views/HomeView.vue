<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { useToast } from "primevue/usetoast";
import Button from "primevue/button";
import InputText from "primevue/inputtext";
import Menu from "primevue/menu";
import type { MenuItem } from "primevue/menuitem";
import { useTripsStore } from "@/stores/trips";
import { downloadFullBackup, importBackupFile } from "@/lib/backup";

const store = useTripsStore();
const router = useRouter();
const toast = useToast();
const newName = ref("");
const fileInput = ref<HTMLInputElement | null>(null);
const toolsMenu = ref<InstanceType<typeof Menu> | null>(null);

onMounted(() => store.refresh());

async function create() {
  const id = await store.createTrip(newName.value);
  newName.value = "";
  router.push(`/trips/${id}`);
}

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

const toolItems: MenuItem[] = [
  {
    label: "Load sample trip",
    icon: "pi pi-sparkles",
    command: () => seed(),
  },
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
];

function toggleTools(event: Event) {
  toolsMenu.value?.toggle(event);
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
        <InputText
          v-model="newName"
          placeholder="New trip name"
          class="w-full"
          @keyup.enter="create"
        />
        <Button label="Create" icon="pi pi-plus" @click="create" />
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
        No trips yet. Create one or load the sample.
      </div>
      <router-link
        v-for="t in store.trips"
        :key="t.id"
        :to="`/trips/${t.id}`"
        class="tl-card tl-pressable tl-trip-link block no-underline"
      >
        <div class="flex items-center justify-between gap-3">
          <div class="min-w-0">
            <div class="font-medium text-tl">{{ t.name }}</div>
            <div class="text-xs text-tl-muted">
              Updated {{ new Date(t.updatedAt).toLocaleString() }} ·
              {{ t.currency }}
            </div>
          </div>
          <i class="pi pi-chevron-right text-tl-muted" />
        </div>
      </router-link>
    </section>
  </div>
</template>
