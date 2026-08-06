<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import AppLoading from "@/components/AppLoading.vue";
import {
  buildActivityFeed,
  formatActivityWhen,
  type ActivityItem,
} from "@/lib/activityFeed";
import { isEnabled } from "@/lib/features";
import { isSupabaseConfigured } from "@/services/supabase";
import { useAuthStore } from "@/stores/auth";
import { useTripsStore } from "@/stores/trips";

const auth = useAuthStore();
const trips = useTripsStore();
const router = useRouter();
const items = ref<ActivityItem[]>([]);
const loading = ref(true);

async function rebuildFeed(opts: { quiet?: boolean } = {}) {
  const quiet = opts.quiet ?? items.value.length > 0;
  if (!quiet) loading.value = true;
  try {
    if (!isEnabled("activity_feed")) {
      items.value = [];
      return;
    }
    items.value = await buildActivityFeed(trips.trips);
  } finally {
    if (!quiet) loading.value = false;
  }
}

onMounted(async () => {
  if (!auth.authReady) await auth.initAuth();
  if (trips.trips.length) await rebuildFeed({ quiet: true });
  if (auth.cloud || !isSupabaseConfigured()) {
    await trips.refresh({ quiet: trips.trips.length > 0 });
  }
  await rebuildFeed({ quiet: items.value.length > 0 });
});

watch(
  () => trips.trips.map((t) => t.id + t.updatedAt).join("|"),
  () => void rebuildFeed({ quiet: true }),
);

function iconFor(kind: ActivityItem["kind"]) {
  if (kind === "payment") return "pi pi-wallet";
  if (kind === "void") return "pi pi-trash";
  return "pi pi-receipt";
}
</script>

<template>
  <div class="tl-has-bottom-nav space-y-4">
    <section class="tl-card">
      <h1 class="mb-1 text-2xl font-semibold text-tl">Recent activity</h1>
      <p class="text-sm text-tl-muted">
        Expenses and payments across your groups.
      </p>
    </section>

    <section class="tl-card space-y-1" aria-label="Activity feed">
      <AppLoading v-if="loading && !items.length" />
      <p v-else-if="!items.length" class="text-sm text-tl-muted">
        No activity yet. Add an expense or payment in a group.
      </p>
      <button
        v-for="item in items"
        :key="item.id"
        type="button"
        class="tl-activity-row"
        @click="router.push(`/trips/${item.tripId}`)"
      >
        <div class="tl-activity-icon" aria-hidden="true">
          <i :class="iconFor(item.kind)" />
        </div>
        <div class="min-w-0 flex-1 text-left">
          <div class="text-sm text-tl">{{ item.title }}</div>
          <div
            class="mt-0.5 text-sm"
            :class="item.kind === 'void' ? 'line-through text-tl-muted' : 'money-neg'"
          >
            {{ item.detail }}
          </div>
          <div class="mt-0.5 text-xs text-tl-muted">
            {{ formatActivityWhen(item.at) }}
          </div>
        </div>
        <i class="pi pi-chevron-right text-tl-muted" aria-hidden="true" />
      </button>
    </section>
  </div>
</template>
