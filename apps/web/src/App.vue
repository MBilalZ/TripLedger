<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import Toast from "primevue/toast";
import ConfirmDialog from "primevue/confirmdialog";
import Menu from "primevue/menu";
import type { MenuItem } from "primevue/menuitem";
import { isSupabaseConfigured } from "@/api/supabase";
import PwaInstallBanner from "@/components/PwaInstallBanner.vue";
import PushNotifyToggle from "@/components/PushNotifyToggle.vue";
import { useTheme } from "@/composables/useTheme";
import { useAuthStore } from "@/stores/auth";
import { useTripsStore } from "@/stores/trips";

const { isDark, toggle } = useTheme();
const auth = useAuthStore();
const trips = useTripsStore();
const router = useRouter();
const accountMenu = ref<InstanceType<typeof Menu> | null>(null);

onMounted(() => {
  void auth.initAuth().then(() => {
    if (auth.cloud || !isSupabaseConfigured()) {
      return trips.refresh();
    }
  });
});

async function onSignOut() {
  await auth.signOut();
  await router.push({ name: "auth" });
}

const accountItems = computed<MenuItem[]>(() => {
  if (!isSupabaseConfigured()) {
    return [
      {
        label: "Local · this device",
        disabled: true,
      },
    ];
  }
  if (auth.isSignedIn) {
    return [
      {
        label: auth.displayLabel || "Account",
        disabled: true,
      },
      { separator: true },
      {
        label: "Sign out",
        icon: "pi pi-sign-out",
        command: () => void onSignOut(),
      },
    ];
  }
  return [
    {
      label: "Sign in",
      icon: "pi pi-sign-in",
      command: () => void router.push({ name: "auth" }),
    },
    {
      label: "Create account",
      icon: "pi pi-user-plus",
      command: () =>
        void router.push({ name: "auth", query: { mode: "signup" } }),
    },
  ];
});

function toggleAccount(event: Event) {
  accountMenu.value?.toggle(event);
}
</script>

<template>
  <div class="min-h-screen bg-tl">
    <Toast position="top-center" />
    <ConfirmDialog :draggable="false" />
    <header class="tl-app-header">
      <div class="tl-app-header__inner">
        <router-link to="/" class="tl-app-header__brand">
          <span class="tl-brand-mark">TL</span>
          <span class="tl-app-header__brand-name">TripLedger</span>
        </router-link>
        <div class="tl-app-header__actions">
          <PushNotifyToggle />
          <button
            v-if="isSupabaseConfigured()"
            type="button"
            class="tl-icon-btn"
            aria-label="Account"
            aria-haspopup="true"
            aria-controls="account_menu"
            @click="toggleAccount"
          >
            <i class="pi pi-user" />
          </button>
          <Menu
            id="account_menu"
            ref="accountMenu"
            :model="accountItems"
            popup
          />
          <button
            type="button"
            class="tl-icon-btn"
            :aria-label="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
            @click="toggle"
          >
            <i :class="isDark ? 'pi pi-sun' : 'pi pi-moon'" />
          </button>
        </div>
      </div>
    </header>
    <main class="tl-app-main">
      <router-view />
    </main>
    <PwaInstallBanner />
  </div>
</template>
