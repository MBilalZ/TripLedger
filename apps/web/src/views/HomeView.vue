<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { useToast } from "primevue/usetoast";
import Button from "primevue/button";
import Menu from "primevue/menu";
import type { MenuItem } from "primevue/menuitem";
import { formatPkr } from "@tripledger/engine";
import { useFeedback } from "@/composables/useFeedback";
import { useAuthStore } from "@/stores/auth";
import { useTripsStore } from "@/stores/trips";
import { downloadFullBackup, importBackupFile } from "@/lib/backup";
import { isSupabaseConfigured } from "@/services/supabase";
import { toApiError } from "@/services/errors";
import AppLoading from "@/components/AppLoading.vue";
import {
  buildTripSummaries,
  filterSummaries,
  overallBalancePaisa,
  type GroupBalanceFilter,
  type TripSummary,
} from "@/lib/tripSummaries";

const store = useTripsStore();
const auth = useAuthStore();
const router = useRouter();
const toast = useToast();
const { confirmDanger } = useFeedback();
const fileInput = ref<HTMLInputElement | null>(null);
const toolsMenu = ref<InstanceType<typeof Menu> | null>(null);
const pickGroupMenu = ref<InstanceType<typeof Menu> | null>(null);
const isDev = import.meta.env.DEV;
const filter = ref<GroupBalanceFilter>("all");
const summaries = ref<TripSummary[]>([]);
const summariesLoading = ref(false);

const myNames = computed(() => {
  const names = ["You"];
  if (auth.profile?.displayName) names.push(auth.profile.displayName);
  return names;
});

async function refreshSummaries(opts: { quiet?: boolean } = {}) {
  const quiet = opts.quiet ?? summaries.value.length > 0;
  if (!quiet) summariesLoading.value = true;
  try {
    summaries.value = await buildTripSummaries(store.trips, myNames.value);
  } finally {
    if (!quiet) summariesLoading.value = false;
  }
}

onMounted(async () => {
  if (!auth.authReady) await auth.initAuth();
  if (auth.cloud || !isSupabaseConfigured()) {
    // Cache-first: paint immediately when store already has trips.
    if (store.trips.length) await refreshSummaries({ quiet: true });
    await store.refresh({ quiet: store.trips.length > 0 });
  }
  await refreshSummaries({ quiet: summaries.value.length > 0 });
});

watch(
  () => store.trips.map((t) => t.id + t.updatedAt).join("|"),
  () => void refreshSummaries({ quiet: true }),
);

const visibleSummaries = computed(() =>
  filterSummaries(summaries.value, filter.value),
);

const overall = computed(() => overallBalancePaisa(summaries.value));

const overallLabel = computed(() => {
  const b = overall.value;
  if (Math.abs(b) < 1) return "Overall, you are settled up ";
  if (b < 0) return "Overall, you owe ";
  return "Overall, you are owed ";
});

const filterChips: { id: GroupBalanceFilter; label: string }[] = [
  { id: "all", label: "All groups" },
  { id: "outstanding", label: "Outstanding" },
  { id: "you_owe", label: "You owe" },
  { id: "owed_to_you", label: "Owed to you" },
];

async function seed() {
  const id = await store.seedSample();
  toast.add({
    severity: "success",
    summary: "Sample group ready",
    detail: "Expected: Mamo→Bilal 19487.94, Salman→Bilal 656.47, Farhan→Bilal 717.65",
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
    await refreshSummaries();
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

const pickGroupItems = computed<MenuItem[]>(() => {
  if (!store.trips.length) {
    return [
      {
        label: "Start a new group",
        icon: "pi pi-plus",
        command: () => router.push("/trips/new"),
      },
    ];
  }
  return store.trips.map(
    (t) =>
      ({
        label: t.name,
        command: () => router.push(`/trips/${t.id}`),
      }) satisfies MenuItem,
  );
});

function toggleTools(event: Event) {
  toolsMenu.value?.toggle(event);
}

function togglePickGroup(event: Event) {
  pickGroupMenu.value?.toggle(event);
}

function leaveConfirmCopy(tripName: string, role: "owner" | "member" | null) {
  if (role === "owner") {
    return `Leave “${tripName}”? If you’re the last member, the group is deleted for everyone. Otherwise another member becomes the owner.`;
  }
  return `Leave “${tripName}”? You’ll lose access until you’re invited again.`;
}

function confirmRemoveTrip(tripId: string, tripName: string, event: Event) {
  event.preventDefault();
  event.stopPropagation();
  const isCloudLeave = store.cloud;
  const role = store.roleFor(tripId);
  confirmDanger({
    header: isCloudLeave ? "Leave group?" : "Delete group?",
    message: isCloudLeave
      ? leaveConfirmCopy(tripName, role)
      : `“${tripName}” will be deleted from this device. This can’t be undone.`,
    onAccept: async () => {
      try {
        if (isCloudLeave) {
          const result = await store.leaveTrip(tripId);
          toast.add({
            severity: "success",
            summary: result.action === "deleted" ? "Group deleted" : "Left group",
            detail:
              result.action === "deleted"
                ? "You were the last member, so the group was removed."
                : result.promotedUserId
                  ? "Another member is now the owner."
                  : undefined,
            life: 3000,
          });
        } else {
          await store.deleteTrip(tripId);
          toast.add({
            severity: "success",
            summary: "Group deleted",
            life: 2000,
          });
        }
        await refreshSummaries();
      } catch (e) {
        toast.add({
          severity: "error",
          summary: isCloudLeave ? "Could not leave" : "Could not delete",
          detail: toApiError(e).message,
          life: 4000,
        });
      }
    },
  });
}

function balanceClass(paisa: number | null) {
  if (paisa == null || Math.abs(paisa) < 1) return "text-tl-muted";
  return paisa < 0 ? "money-neg" : "money-pos";
}
</script>

<template>
  <div class="tl-has-bottom-nav space-y-4">
    <section class="space-y-3">
      <div class="flex items-start justify-between gap-2">
        <div>
          <h1 class="text-2xl font-semibold text-tl">Groups</h1>
          <p class="mt-1 text-sm">
            <span class="text-tl-muted">{{ overallLabel }}</span>
            <span
              v-if="Math.abs(overall) >= 1"
              class="ml-1 font-semibold"
              :class="balanceClass(overall)"
            >
              {{ formatPkr(Math.abs(overall)) }}
            </span>
          </p>
        </div>
        <Button
          icon="pi pi-ellipsis-h"
          severity="secondary"
          text
          rounded
          aria-label="Tools"
          aria-haspopup="true"
          aria-controls="home_tools_menu"
          @click="toggleTools"
        />
        <Menu id="home_tools_menu" ref="toolsMenu" :model="toolItems" popup />
        <input
          ref="fileInput"
          type="file"
          accept="application/json,.json"
          class="hidden"
          @change="onImport"
        />
      </div>

      <p class="text-xs text-tl-muted">
        <template v-if="store.cloud">
          Shared groups sync for everyone you invite.
        </template>
        <template v-else-if="isSupabaseConfigured() && !auth.isSignedIn">
          Sign in to create shared groups and join invite links.
        </template>
        <template v-else-if="isSupabaseConfigured() && store.authError">
          Cloud auth error: {{ store.authError }}.
        </template>
        <template v-else>
          Everything stays on this device until you enable cloud sync.
        </template>
      </p>

      <div class="tl-chip-bar">
        <button
          v-for="chip in filterChips"
          :key="chip.id"
          type="button"
          class="tl-chip"
          :class="{ 'is-active': filter === chip.id }"
          @click="filter = chip.id"
        >
          {{ chip.label }}
        </button>
      </div>
    </section>

    <section class="grid gap-3" aria-label="Group list">
      <div
        v-if="summariesLoading && !visibleSummaries.length"
        class="tl-card"
      >
        <AppLoading />
      </div>
      <div
        v-else-if="!visibleSummaries.length"
        class="tl-card text-center text-tl-muted"
      >
        <template v-if="!store.trips.length">
          No groups yet. Start a new group{{
            isDev && !store.cloud ? " or load the sample" : ""
          }}.
        </template>
        <template v-else>No groups match this filter.</template>
      </div>
      <div
        v-for="s in visibleSummaries"
        :key="s.trip.id"
        class="tl-card tl-pressable tl-trip-row flex items-center gap-2"
      >
        <router-link
          :to="`/trips/${s.trip.id}`"
          class="tl-trip-link no-underline"
          :aria-label="`Open ${s.trip.name}`"
        >
          <div class="tl-group-icon" aria-hidden="true">
            <i class="pi pi-users" />
          </div>
          <div class="min-w-0 flex-1">
            <div class="font-medium text-tl">{{ s.trip.name }}</div>
            <div class="text-sm" :class="balanceClass(s.myBalancePaisa)">
              {{ s.label }}
            </div>
            <div
              v-if="s.topCounterparty && s.myBalancePaisa != null && Math.abs(s.myBalancePaisa) >= 1"
              class="text-xs text-tl-muted"
            >
              <template v-if="s.topCounterparty.paisa < 0">
                You owe {{ s.topCounterparty.name }}
                {{ formatPkr(-s.topCounterparty.paisa) }}
              </template>
              <template v-else>
                {{ s.topCounterparty.name }} owes you
                {{ formatPkr(s.topCounterparty.paisa) }}
              </template>
            </div>
          </div>
        </router-link>
        <Button
          :icon="store.cloud ? 'pi pi-sign-out' : 'pi pi-trash'"
          severity="danger"
          text
          rounded
          class="shrink-0"
          :aria-label="store.cloud ? 'Leave group' : 'Delete group'"
          v-tooltip="store.cloud ? 'Leave group' : 'Delete group'"
          @click="confirmRemoveTrip(s.trip.id, s.trip.name, $event)"
        />
      </div>

      <div class="flex justify-center pt-2">
        <Button
          v-if="isSupabaseConfigured() && !auth.isSignedIn"
          label="Sign in"
          icon="pi pi-sign-in"
          outlined
          @click="router.push({ name: 'auth' })"
        />
        <Button
          v-else
          label="Start a new group"
          icon="pi pi-user-plus"
          outlined
          @click="router.push('/trips/new')"
        />
      </div>
    </section>

    <button
      type="button"
      class="tl-fab"
      aria-haspopup="true"
      aria-controls="pick_group_menu"
      @click="togglePickGroup"
    >
      <i class="pi pi-receipt" aria-hidden="true" />
      Add expense
    </button>
    <Menu
      id="pick_group_menu"
      ref="pickGroupMenu"
      :model="pickGroupItems"
      popup
    />
  </div>
</template>
