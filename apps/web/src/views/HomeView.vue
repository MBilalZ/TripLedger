<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { useToast } from "primevue/usetoast";
import { useConfirm } from "primevue/useconfirm";
import Button from "primevue/button";
import Menu from "primevue/menu";
import type { MenuItem } from "primevue/menuitem";
import { useAuthStore } from "@/stores/auth";
import { useTripsStore } from "@/stores/trips";
import { downloadFullBackup, importBackupFile } from "@/lib/backup";
import { isSupabaseConfigured } from "@/api/supabase";
import { toApiError } from "@/api/errors";

const store = useTripsStore();
const auth = useAuthStore();
const router = useRouter();
const toast = useToast();
const confirm = useConfirm();
const fileInput = ref<HTMLInputElement | null>(null);
const toolsMenu = ref<InstanceType<typeof Menu> | null>(null);
const isDev = import.meta.env.DEV;

onMounted(async () => {
  if (!auth.authReady) await auth.initAuth();
  if (auth.cloud || !isSupabaseConfigured()) {
    await store.refresh();
  }
});

async function seed() {
  const id = await store.seedSample();
  toast.add({
    severity: "success",
    summary: "Sample group ready",
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
      detail: store.cloud
        ? "Imported locally. Re-create or migrate to cloud separately if needed."
        : `${ids.length} trip(s)`,
      life: 4000,
    });
    if (ids[0] && !store.cloud) router.push(`/trips/${ids[0]}`);
  } catch (e) {
    toast.add({
      severity: "error",
      summary: "Import failed",
      detail: toApiError(e).message,
      life: 4000,
    });
  } finally {
    (ev.target as HTMLInputElement).value = "";
  }
}

const toolItems = computed<MenuItem[]>(() => [
  ...(isDev && !store.cloud
    ? [
        {
          label: "Load sample group",
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

function confirmRemoveTrip(tripId: string, tripName: string, event: Event) {
  event.preventDefault();
  event.stopPropagation();
  const role = store.roleFor(tripId);
  const isLeave = store.cloud && role === "member";
  confirm.require({
    message: isLeave
      ? `Leave “${tripName}”? You will lose access until invited again.`
      : `Delete “${tripName}”${store.cloud ? " for everyone" : " from this device"}? This cannot be undone.`,
    header: isLeave ? "Leave group" : "Delete group",
    icon: "pi pi-exclamation-triangle",
    acceptClass: "p-button-danger",
    accept: async () => {
      try {
        await store.deleteTrip(tripId);
        toast.add({
          severity: "success",
          summary: isLeave ? "Left group" : "Group deleted",
          life: 2000,
        });
      } catch (e) {
        toast.add({
          severity: "error",
          summary: isLeave ? "Could not leave" : "Could not delete",
          detail: toApiError(e).message,
          life: 4000,
        });
      }
    },
  });
}
</script>

<template>
  <div class="space-y-6">
    <section class="tl-card space-y-4">
      <div>
        <h1 class="mb-1 text-2xl font-semibold text-tl">Your groups</h1>
        <p class="text-sm text-tl-muted">
          <template v-if="store.cloud">
            Shared groups sync for everyone you invite. Copy an invite link from a
            group to add members.
          </template>
          <template v-else-if="isSupabaseConfigured() && !auth.isSignedIn">
            Sign in to create shared groups and join invite links. Your account
            works on every device.
          </template>
          <template v-else-if="isSupabaseConfigured() && store.authError">
            Cloud auth error: {{ store.authError }}.
          </template>
          <template v-else>
            Everything stays on this device. Add Supabase env vars to enable
            shared groups and invites.
          </template>
        </p>
      </div>
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button
          v-if="isSupabaseConfigured() && !auth.isSignedIn"
          label="Sign in"
          icon="pi pi-sign-in"
          class="w-full sm:w-auto"
          @click="router.push({ name: 'auth' })"
        />
        <Button
          v-else
          label="New group"
          icon="pi pi-plus"
          class="w-full sm:w-auto"
          @click="router.push('/trips/new')"
        />
        <Button
          label="Tools"
          icon="pi pi-ellipsis-h"
          severity="secondary"
          outlined
          size="small"
          class="w-full sm:w-auto"
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

    <section class="grid gap-3" aria-label="Group list">
      <div v-if="!store.trips.length" class="tl-card text-center text-tl-muted">
        No groups yet. Create one{{
          isDev && !store.cloud ? " or load the sample" : ""
        }}.
      </div>
      <div
        v-for="t in store.trips"
        :key="t.id"
        class="tl-card tl-pressable tl-trip-row flex items-center gap-2"
      >
        <router-link
          :to="`/trips/${t.id}`"
          class="tl-trip-link no-underline"
          :aria-label="`Open ${t.name}`"
        >
          <div class="min-w-0 flex-1">
            <div class="font-medium text-tl">{{ t.name }}</div>
            <div class="text-xs text-tl-muted">
              Updated {{ new Date(t.updatedAt).toLocaleString() }} · PKR
            </div>
          </div>
          <i class="pi pi-chevron-right shrink-0 text-tl-muted" aria-hidden="true" />
        </router-link>
        <Button
          :icon="store.cloud && store.roleFor(t.id) === 'member' ? 'pi pi-sign-out' : 'pi pi-trash'"
          severity="danger"
          text
          rounded
          class="shrink-0"
          :aria-label="
            store.cloud && store.roleFor(t.id) === 'member'
              ? 'Leave group'
              : 'Delete group'
          "
          v-tooltip="
            store.cloud && store.roleFor(t.id) === 'member'
              ? 'Leave group'
              : 'Delete group'
          "
          @click="confirmRemoveTrip(t.id, t.name, $event)"
        />
      </div>
    </section>
  </div>
</template>
